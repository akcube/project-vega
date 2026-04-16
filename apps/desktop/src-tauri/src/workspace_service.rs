use std::path::Path;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use tauri::ipc::Channel;
use tokio::sync::mpsc;

use crate::domain::{Run, RunStatus, Task, WorkspaceView};
use crate::events::{SessionUpdate, WorkspaceEvent};
use crate::projection::{apply_workspace_event, build_review_summary, rebuild_snapshot};
use crate::session::{SessionInfo, SessionManager};
use crate::store::Store;
use crate::terminal_service::TerminalService;
use crate::view_model::{
    LiveStateViewModel, RunViewModel, TaskWorkspaceViewModel, TerminalEvent, TerminalSnapshot,
    WorktreeFileDocumentViewModel, WorktreeInspectionViewModel, WorkspaceSnapshot,
    WorkspaceSummaryViewModel,
};
use crate::worktree_inspector::WorktreeInspector;

#[derive(Clone)]
pub struct WorkspaceService {
    store: Arc<Store>,
    sessions: Arc<SessionManager>,
    terminals: Arc<TerminalService>,
}

impl WorkspaceService {
    pub fn new(
        store: Arc<Store>,
        sessions: Arc<SessionManager>,
        terminals: Arc<TerminalService>,
    ) -> Self {
        Self {
            store,
            sessions,
            terminals,
        }
    }

    pub fn list_active_workspaces(&self) -> Result<Vec<WorkspaceSummaryViewModel>> {
        self.store
            .list_active_workspaces()?
            .into_iter()
            .map(|workspace| {
                let task = self.store.get_task(&workspace.task_id)?;
                let project = self.store.get_project(&task.project_id)?;
                let is_streaming = self
                    .store
                    .get_current_run(&task.id)?
                    .map(|run| run.status == RunStatus::Streaming)
                    .unwrap_or(false)
                    || self.sessions.has_session(&task.id);

                Ok(WorkspaceSummaryViewModel {
                    workspace,
                    task_id: task.id,
                    task_title: task.title,
                    project_id: project.id,
                    project_name: project.name,
                    workflow_state: task.workflow_state,
                    is_streaming,
                })
            })
            .collect()
    }

    pub fn open_workspace(&self, task_id: &str) -> Result<TaskWorkspaceViewModel> {
        let task = self.store.get_task(task_id)?;
        self.store
            .ensure_active_workspace(task_id, task.last_open_view.clone())?;
        self.store.focus_workspace(task_id)?;
        self.workspace_view_model(task_id)
    }

    pub fn close_workspace(&self, task_id: &str) -> Result<()> {
        self.terminals.stop(task_id)?;
        self.store.close_active_workspace(task_id)
    }

    pub fn inspect_worktree(&self, task_id: &str) -> Result<WorktreeInspectionViewModel> {
        let task = self.store.get_task(task_id)?;
        WorktreeInspector::new().inspect(Path::new(&task.worktree_path))
    }

    pub fn read_worktree_file(
        &self,
        task_id: &str,
        relative_path: &str,
    ) -> Result<WorktreeFileDocumentViewModel> {
        let task = self.store.get_task(task_id)?;
        WorktreeInspector::new().read_file(Path::new(&task.worktree_path), relative_path)
    }

    pub fn save_worktree_file(
        &self,
        task_id: &str,
        relative_path: &str,
        contents: &str,
    ) -> Result<WorktreeFileDocumentViewModel> {
        let task = self.store.get_task(task_id)?;
        WorktreeInspector::new().write_file(Path::new(&task.worktree_path), relative_path, contents)
    }

    pub fn set_workspace_view(
        &self,
        task_id: &str,
        view: WorkspaceView,
    ) -> Result<TaskWorkspaceViewModel> {
        if self.store.get_active_workspace(task_id)?.is_none() {
            let task = self.store.get_task(task_id)?;
            self.store
                .ensure_active_workspace(task_id, task.last_open_view.clone())?;
        }

        self.store.update_active_workspace_view(task_id, view)?;
        self.workspace_view_model(task_id)
    }

    pub fn attach_terminal(
        &self,
        task_id: &str,
        cols: u16,
        rows: u16,
        on_event: Channel<TerminalEvent>,
    ) -> Result<TerminalSnapshot> {
        let task = self.store.get_task(task_id)?;
        self.terminals
            .attach(task_id, Path::new(&task.worktree_path), cols, rows, on_event)
    }

    pub fn write_terminal(&self, task_id: &str, data: &str) -> Result<()> {
        self.terminals.write(task_id, data)
    }

    pub fn resize_terminal(&self, task_id: &str, cols: u16, rows: u16) -> Result<()> {
        self.terminals.resize(task_id, cols, rows)
    }

    pub async fn send_prompt(
        &self,
        task_id: &str,
        text: &str,
        on_event: Channel<SessionUpdate>,
    ) -> Result<String> {
        let task = self.store.get_task(task_id)?;
        let run = self.ensure_live_run(&task).await?;

        self.store.update_run_status(&run.id, RunStatus::Streaming)?;
        self.append_event_and_snapshot(
            &task,
            &run,
            &WorkspaceEvent::UserMessage {
                text: text.to_string(),
            },
        )?;

        let (update_tx, mut update_rx) = mpsc::unbounded_channel::<SessionUpdate>();
        let service = self.clone();
        let task_id_owned = task_id.to_string();
        let processor = tokio::spawn(async move {
            while let Some(update) = update_rx.recv().await {
                let _ = service.apply_session_update_for_task(&task_id_owned, &update);
                on_event.send(update).ok();
            }
        });

        let result = self.sessions.send_prompt(task_id, text, update_tx).await;
        let _ = processor.await;

        match &result {
            Ok(_) => self.store.update_run_status(&run.id, RunStatus::Ready)?,
            Err(_) => self.store.update_run_status(&run.id, RunStatus::Failed)?,
        }

        result
    }

    pub async fn cancel_run(&self, task_id: &str) -> Result<()> {
        if self.sessions.has_session(task_id) {
            self.sessions.cancel(task_id).await?;
        }
        if let Some(run) = self.store.get_current_run(task_id)? {
            self.store.update_run_status(&run.id, RunStatus::Cancelled)?;
        }
        Ok(())
    }

    fn workspace_view_model(&self, task_id: &str) -> Result<TaskWorkspaceViewModel> {
        let task = self.store.get_task(task_id)?;
        let workspace = self
            .store
            .get_active_workspace(task_id)?
            .ok_or_else(|| anyhow!("workspace is not open for task {task_id}"))?;
        let project = self.store.get_project(&task.project_id)?;
        let source_repo = task
            .source_repo_resource_id
            .as_deref()
            .map(|resource_id| self.store.get_project_resource(resource_id))
            .transpose()?;
        let documents = self.store.list_project_documents(&task.project_id)?;
        let run = self.store.get_current_run(task_id)?;
        let snapshot = self.snapshot_for_task(task_id)?;
        let has_session = self.sessions.has_session(task_id);
        let can_resume = run
            .as_ref()
            .and_then(|current| current.provider_session_id.as_ref())
            .is_some()
            && !has_session;
        let is_streaming = run
            .as_ref()
            .map(|current| current.status == RunStatus::Streaming)
            .unwrap_or(false);

        Ok(TaskWorkspaceViewModel {
            workspace,
            project,
            task,
            source_repo,
            documents,
            run: run.as_ref().map(|run| RunViewModel {
                run: run.clone(),
                session_reference: run.provider_session_id.clone(),
                log_reference: run.provider_log_path.clone(),
            }),
            snapshot: snapshot.clone(),
            review: build_review_summary(&snapshot),
            live: LiveStateViewModel {
                has_session,
                can_resume,
                is_streaming,
            },
        })
    }

    #[cfg(test)]
    fn create_run_for_task(&self, task_id: &str) -> Result<Run> {
        let task = self.store.get_task(task_id)?;
        self.store.create_run(&task)
    }

    #[cfg(test)]
    fn append_user_message_for_task(&self, task_id: &str, text: &str) -> Result<()> {
        let task = self.store.get_task(task_id)?;
        let run = self
            .store
            .get_current_run(task_id)?
            .ok_or_else(|| anyhow!("no current run for task {task_id}"))?;
        self.append_event_and_snapshot(
            &task,
            &run,
            &WorkspaceEvent::UserMessage {
                text: text.to_string(),
            },
        )
    }

    fn apply_session_update_for_task(&self, task_id: &str, update: &SessionUpdate) -> Result<()> {
        let task = self.store.get_task(task_id)?;
        let run = self
            .store
            .get_current_run(task_id)?
            .ok_or_else(|| anyhow!("no current run for task {task_id}"))?;
        self.append_event_and_snapshot(
            &task,
            &run,
            &WorkspaceEvent::SessionUpdate {
                update: update.clone(),
            },
        )
    }

    fn append_event_and_snapshot(&self, task: &Task, run: &Run, event: &WorkspaceEvent) -> Result<()> {
        self.store.append_task_event(&task.id, &run.id, event)?;

        let snapshot = match self.store.load_snapshot(&task.id)? {
            Some((_saved_run_id, saved_snapshot)) => {
                let mut next = saved_snapshot;
                apply_workspace_event(&mut next, event);
                next
            }
            None => rebuild_snapshot(&self.store.list_task_events(&task.id)?),
        };

        self.store.save_snapshot(&task.id, &run.id, &snapshot)?;
        Ok(())
    }

    fn snapshot_for_task(&self, task_id: &str) -> Result<WorkspaceSnapshot> {
        match self.store.load_snapshot(task_id)? {
            Some((_saved_run_id, snapshot)) => Ok(snapshot),
            None => Ok(rebuild_snapshot(&self.store.list_task_events(task_id)?)),
        }
    }

    async fn ensure_live_run(&self, task: &Task) -> Result<Run> {
        if let Some(run) = self.store.get_current_run(&task.id)? {
            if self.sessions.has_session(&task.id) {
                return Ok(run);
            }

            if let Some(session_id) = run.provider_session_id.clone() {
                match self.sessions.start(task, Some(&session_id)).await {
                    Ok(info) => {
                        self.persist_session_locator(&run, &info)?;
                        return self
                            .store
                            .get_run(&run.id)?
                            .ok_or_else(|| anyhow!("run disappeared after session reload"));
                    }
                    Err(error) => {
                        self.store.update_run_status(&run.id, RunStatus::Failed)?;
                        return Err(error);
                    }
                }
            }

            return Err(anyhow!(
                "task has a current run but no provider session to reload"
            ));
        }

        let run = self.store.create_run(task)?;
        match self.sessions.start(task, None).await {
            Ok(info) => {
                self.persist_session_locator(&run, &info)?;
                self.store
                    .get_run(&run.id)?
                    .ok_or_else(|| anyhow!("run disappeared after creation"))
            }
            Err(error) => {
                self.store.update_run_status(&run.id, RunStatus::Failed)?;
                Err(error)
            }
        }
    }

    fn persist_session_locator(&self, run: &Run, info: &SessionInfo) -> Result<()> {
        self.store.update_run_locator(
            &run.id,
            Some(&info.provider_session_id),
            info.provider_log_path.as_deref(),
        )
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use chrono::Utc;
    use tempfile::{tempdir, TempDir};

    use super::*;
    use crate::domain::{
        CreateProjectInput, Provider, Task, WorkflowState, WorkspaceView,
    };

    struct TestHarness {
        _temp: TempDir,
        service: WorkspaceService,
        task: Task,
    }

    fn test_service() -> TestHarness {
        let temp = tempdir().unwrap();
        let store = Arc::new(Store::new(temp.path()).unwrap());
        let sessions = Arc::new(SessionManager::new(temp.path().to_path_buf()));
        let terminals = Arc::new(TerminalService::new());
        let service = WorkspaceService::new(store.clone(), sessions, terminals);
        let project = store
            .create_project(CreateProjectInput {
                name: "Alpha".to_string(),
                brief: "Main project".to_string(),
                plan_markdown: "- shell".to_string(),
                resources: Vec::new(),
            })
            .unwrap();

        let timestamp = Utc::now().to_rfc3339();
        let task = Task {
            id: "task-1".to_string(),
            project_id: project.id.clone(),
            title: "Set up workspace".to_string(),
            workflow_state: WorkflowState::Todo,
            source_repo_resource_id: None,
            worktree_path: temp.path().display().to_string(),
            worktree_name: "workspace".to_string(),
            branch_name: "vega/workspace".to_string(),
            provider: Provider::Codex,
            model: "gpt-5-codex".to_string(),
            permission_policy: "default".to_string(),
            mcp_subset: Vec::new(),
            skill_subset: Vec::new(),
            current_run_id: None,
            last_open_view: WorkspaceView::Agent,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        store.insert_task(&task).unwrap();

        TestHarness {
            _temp: temp,
            service,
            task,
        }
    }

    #[test]
    fn open_workspace_rehydrates_snapshot_from_task_events() {
        let harness = test_service();
        harness.service.create_run_for_task(&harness.task.id).unwrap();
        harness
            .service
            .append_user_message_for_task(&harness.task.id, "Build the shell")
            .unwrap();
        harness
            .service
            .apply_session_update_for_task(
                &harness.task.id,
                &SessionUpdate::TextChunk {
                    text: "Done.".to_string(),
                },
            )
            .unwrap();
        harness
            .service
            .apply_session_update_for_task(
                &harness.task.id,
                &SessionUpdate::Done {
                    stop_reason: "end_turn".to_string(),
                },
            )
            .unwrap();

        let workspace = harness.service.open_workspace(&harness.task.id).unwrap();
        assert_eq!(workspace.snapshot.messages.len(), 2);
        assert!(workspace.snapshot.current_message.is_none());
    }

    #[test]
    fn opening_workspace_registers_it_in_active_workspace_strip() {
        let harness = test_service();
        let workspace = harness.service.open_workspace(&harness.task.id).unwrap();
        let active = harness.service.list_active_workspaces().unwrap();

        assert_eq!(workspace.workspace.task_id, harness.task.id);
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].task_title, harness.task.title);
    }

    #[test]
    fn creating_multiple_runs_keeps_only_latest_current_run() {
        let harness = test_service();
        let first = harness.service.create_run_for_task(&harness.task.id).unwrap();
        let second = harness.service.create_run_for_task(&harness.task.id).unwrap();
        assert_ne!(first.id, second.id);

        let workspace = harness.service.open_workspace(&harness.task.id).unwrap();
        assert_eq!(workspace.run.as_ref().unwrap().run.id, second.id);
        assert!(!workspace.live.can_resume);
    }

    #[test]
    fn switching_workspace_view_updates_workspace_and_task_state() {
        let harness = test_service();
        harness.service.open_workspace(&harness.task.id).unwrap();
        let workspace = harness
            .service
            .set_workspace_view(&harness.task.id, WorkspaceView::Review)
            .unwrap();

        assert_eq!(workspace.workspace.selected_view, WorkspaceView::Review);
        assert_eq!(workspace.task.last_open_view, WorkspaceView::Review);
    }
}
