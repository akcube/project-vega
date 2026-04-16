use std::sync::Arc;

use anyhow::{anyhow, Result};
use tauri::ipc::Channel;
use tokio::sync::mpsc;

use crate::domain::{
    AddProjectResourceInput, CreateProjectInput, CreateTaskInput, Project, ProjectResource, Run,
    RunStatus, Task, TaskStatus, TaskView,
};
use crate::events::{SessionUpdate, WorkspaceEvent};
use crate::projection::{apply_workspace_event, build_review_summary, rebuild_snapshot};
use crate::session::{SessionInfo, SessionManager};
use crate::store::Store;
use crate::view_model::{LiveStateViewModel, RunViewModel, TaskWorkspaceViewModel, WorkspaceSnapshot};

#[derive(Clone)]
pub struct WorkspaceService {
    store: Arc<Store>,
    sessions: Arc<SessionManager>,
}

impl WorkspaceService {
    pub fn new(store: Arc<Store>, sessions: Arc<SessionManager>) -> Self {
        Self { store, sessions }
    }

    pub fn create_project(&self, input: CreateProjectInput) -> Result<Project> {
        self.store.create_project(input)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        self.store.list_projects()
    }

    pub fn add_project_resource(&self, input: AddProjectResourceInput) -> Result<ProjectResource> {
        self.store.add_project_resource(input)
    }

    pub fn create_task(&self, input: CreateTaskInput) -> Result<Task> {
        self.store.create_task(input)
    }

    pub fn list_tasks(&self, project_id: &str) -> Result<Vec<Task>> {
        self.store.list_tasks(project_id)
    }

    pub fn set_last_open_view(&self, task_id: &str, view: TaskView) -> Result<()> {
        self.store.set_last_open_view(task_id, view)
    }

    pub fn open_task(&self, task_id: &str) -> Result<TaskWorkspaceViewModel> {
        let task = self.store.get_task(task_id)?;
        let project = self.store.get_project(&task.project_id)?;
        let resources = self.store.list_project_resources(&task.project_id)?;
        let run = self.store.get_current_run(task_id)?;
        let snapshot = self.snapshot_for_task(&task, run.as_ref())?;
        let review = build_review_summary(&snapshot);

        Ok(TaskWorkspaceViewModel {
            project,
            task: task.clone(),
            resources,
            run: run.as_ref().map(|run| RunViewModel {
                run: run.clone(),
                session_reference: run.provider_session_id.clone(),
                log_reference: run.provider_log_path.clone(),
            }),
            snapshot,
            review,
            live: LiveStateViewModel {
                has_session: self.sessions.has_session(task_id),
                is_streaming: matches!(task.status, TaskStatus::Running),
            },
        })
    }

    pub fn create_run_for_task(&self, task_id: &str) -> Result<Run> {
        let task = self.store.get_task(task_id)?;
        self.store.create_run(&task)
    }

    pub fn append_user_message_for_task(&self, task_id: &str, text: &str) -> Result<()> {
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

    pub fn apply_session_update_for_task(&self, task_id: &str, update: &SessionUpdate) -> Result<()> {
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

    pub async fn send_prompt(
        &self,
        task_id: &str,
        text: &str,
        on_event: Channel<SessionUpdate>,
    ) -> Result<String> {
        let task = self.store.get_task(task_id)?;
        let run = self.ensure_live_run(&task).await?;

        self.store.update_task_status(task_id, TaskStatus::Running)?;
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

        let result = self
            .sessions
            .send_prompt(task_id, text, update_tx)
            .await;

        let _ = processor.await;

        match &result {
            Ok(_) => {
                self.store.update_task_status(task_id, TaskStatus::Idle)?;
                self.store.update_run_status(&run.id, RunStatus::Ready)?;
            }
            Err(_) => {
                self.store.update_task_status(task_id, TaskStatus::Failed)?;
                self.store.update_run_status(&run.id, RunStatus::Failed)?;
            }
        }

        result
    }

    pub async fn cancel_run(&self, task_id: &str) -> Result<()> {
        self.sessions.cancel(task_id).await?;
        self.store.update_task_status(task_id, TaskStatus::Cancelled)?;
        if let Some(run) = self.store.get_current_run(task_id)? {
            self.store.update_run_status(&run.id, RunStatus::Cancelled)?;
        }
        Ok(())
    }

    fn append_event_and_snapshot(
        &self,
        task: &Task,
        run: &Run,
        event: &WorkspaceEvent,
    ) -> Result<()> {
        self.store.append_task_event(&task.id, &run.id, event)?;
        let saved_snapshot = self.store.load_snapshot(&task.id)?;
        let can_incrementally_apply = saved_snapshot
            .as_ref()
            .is_some_and(|(saved_run_id, _)| saved_run_id == &run.id);
        let mut snapshot = if can_incrementally_apply {
            saved_snapshot
                .expect("saved snapshot exists when incremental apply is enabled")
                .1
        } else {
            rebuild_snapshot(&self.store.list_task_events(&run.id)?)
        };
        if can_incrementally_apply {
            apply_workspace_event(&mut snapshot, event);
        }
        self.store.save_snapshot(&task.id, &run.id, &snapshot)?;
        Ok(())
    }

    fn snapshot_for_task(&self, task: &Task, run: Option<&Run>) -> Result<WorkspaceSnapshot> {
        match (self.store.load_snapshot(&task.id)?, run) {
            (Some((saved_run_id, snapshot)), Some(run)) if saved_run_id == run.id => Ok(snapshot),
            (_, Some(run)) => Ok(rebuild_snapshot(&self.store.list_task_events(&run.id)?)),
            (Some((_saved_run_id, snapshot)), None) => Ok(snapshot),
            (None, None) => Ok(WorkspaceSnapshot::default()),
        }
    }

    async fn ensure_live_run(&self, task: &Task) -> Result<Run> {
        if let Some(run) = self.store.get_current_run(&task.id)? {
            if self.sessions.has_session(&task.id) {
                return Ok(run);
            }
        }

        let run = self.store.create_run(task)?;
        match self.sessions.start(task).await {
            Ok(info) => {
                self.persist_session_locator(&run, &info)?;
                Ok(self
                    .store
                    .get_run(&run.id)?
                    .ok_or_else(|| anyhow!("run disappeared after creation"))?)
            }
            Err(error) => {
                self.store.update_task_status(&task.id, TaskStatus::Failed)?;
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

    use tempfile::{tempdir, TempDir};

    use super::*;
    use crate::domain::{CreateProjectInput, CreateTaskInput, Provider};

    struct TestHarness {
        _temp: TempDir,
        service: WorkspaceService,
        task: Task,
    }

    fn test_service() -> TestHarness {
        let temp = tempdir().unwrap();
        let store = Arc::new(Store::new(temp.path()).unwrap());
        let sessions = Arc::new(SessionManager::new(temp.path().to_path_buf()));
        let service = WorkspaceService::new(store, sessions);
        let project = service
            .create_project(CreateProjectInput {
                name: "Alpha".to_string(),
                description: "Main project".to_string(),
            })
            .unwrap();
        let task = service
            .create_task(CreateTaskInput {
                project_id: project.id.clone(),
                title: "Set up workspace".to_string(),
                worktree_path: temp.path().display().to_string(),
                provider: Provider::Codex,
                model: "gpt-5-codex".to_string(),
            })
            .unwrap();
        TestHarness {
            _temp: temp,
            service,
            task,
        }
    }

    #[test]
    fn open_task_rehydrates_snapshot_from_events() {
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

        let workspace = harness.service.open_task(&harness.task.id).unwrap();
        assert_eq!(workspace.snapshot.messages.len(), 2);
        assert!(workspace.snapshot.current_message.is_none());
    }

    #[test]
    fn creating_multiple_runs_keeps_only_latest_current_run() {
        let harness = test_service();
        let first = harness.service.create_run_for_task(&harness.task.id).unwrap();
        let second = harness.service.create_run_for_task(&harness.task.id).unwrap();
        assert_ne!(first.id, second.id);

        let workspace = harness.service.open_task(&harness.task.id).unwrap();
        assert_eq!(workspace.run.unwrap().run.id, second.id);
    }
}
