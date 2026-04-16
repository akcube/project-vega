use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use chrono::Utc;
use vega_git::{CommitHistoryRequest, CreateWorktreeRequest, GitService};

use crate::domain::{
    AddProjectResourceInput, CreateProjectInput, CreateTaskInput, Project, ProjectResource,
    ProjectResourceKind, Task, WorkflowState, WorkspaceView,
};
use crate::session::SessionManager;
use crate::store::Store;
use crate::terminal_service::TerminalService;
use crate::view_model::{
    ProjectBoardViewModel, TaskBoardCardViewModel, TaskBoardColumnViewModel,
};

#[derive(Clone)]
pub struct CatalogService {
    store: Arc<Store>,
    sessions: Arc<SessionManager>,
    terminals: Arc<TerminalService>,
}

impl CatalogService {
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

    pub fn create_project(&self, mut input: CreateProjectInput) -> Result<Project> {
        input.name = input.name.trim().to_string();
        input.brief = input.brief.trim().to_string();
        input.plan_markdown = input.plan_markdown.trim().to_string();

        if input.name.is_empty() {
            return Err(anyhow!("project name is required"));
        }
        if input.brief.is_empty() {
            return Err(anyhow!("project brief is required"));
        }
        if input.plan_markdown.is_empty() {
            return Err(anyhow!("project plan is required"));
        }
        if input.resources.is_empty() {
            return Err(anyhow!("at least one project resource is required"));
        }

        let mut repo_count = 0;
        for resource in &mut input.resources {
            resource.label = resource.label.trim().to_string();
            resource.locator = resource.locator.trim().to_string();
            if resource.label.is_empty() {
                return Err(anyhow!("resource label is required"));
            }
            if resource.locator.is_empty() {
                return Err(anyhow!("resource locator is required"));
            }
            if resource.kind == ProjectResourceKind::Repo {
                repo_count += 1;
                resource.locator = normalize_repository_path(&resource.locator)?;
            }
        }

        if repo_count == 0 {
            return Err(anyhow!("a project must include at least one repository"));
        }

        self.store.create_project(input)
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        self.store.list_projects()
    }

    pub fn add_project_resource(&self, mut input: AddProjectResourceInput) -> Result<ProjectResource> {
        input.label = input.label.trim().to_string();
        input.locator = input.locator.trim().to_string();

        if input.label.is_empty() {
            return Err(anyhow!("resource label is required"));
        }
        if input.locator.is_empty() {
            return Err(anyhow!("resource locator is required"));
        }
        if input.kind == ProjectResourceKind::Repo {
            input.locator = normalize_repository_path(&input.locator)?;
        }

        self.store.add_project_resource(input)
    }

    pub fn project_board(&self, project_id: &str) -> Result<ProjectBoardViewModel> {
        let project = self.store.get_project(project_id)?;
        let repositories = self.store.list_project_repositories(project_id)?;
        let documents = self.store.list_project_documents(project_id)?;
        let tasks = self.store.list_tasks(project_id)?;
        let open_workspace_ids = self
            .store
            .list_active_workspaces()?
            .into_iter()
            .map(|workspace| workspace.task_id)
            .collect::<HashSet<_>>();
        let repository_map = repositories
            .iter()
            .cloned()
            .map(|resource| (resource.id.clone(), resource))
            .collect::<HashMap<_, _>>();

        let mut columns = WorkflowState::ordered()
            .into_iter()
            .map(|state| TaskBoardColumnViewModel {
                state: state.clone(),
                label: state.label().to_string(),
                tasks: Vec::new(),
            })
            .collect::<Vec<_>>();

        for task in tasks {
            let source_repo = task
                .source_repo_resource_id
                .as_ref()
                .and_then(|resource_id| repository_map.get(resource_id))
                .cloned();
            let is_streaming = self
                .store
                .get_current_run(&task.id)?
                .map(|run| run.status.as_str() == "streaming")
                .unwrap_or(false)
                || self.sessions.has_session(&task.id);
            let card = TaskBoardCardViewModel {
                task: task.clone(),
                source_repo,
                has_open_workspace: open_workspace_ids.contains(&task.id),
                is_streaming,
            };
            if let Some(column) = columns
                .iter_mut()
                .find(|column| column.state == task.workflow_state)
            {
                column.tasks.push(card);
            }
        }

        Ok(ProjectBoardViewModel {
            project,
            repositories,
            documents,
            columns,
        })
    }

    pub fn create_task(&self, input: CreateTaskInput) -> Result<Task> {
        let project = self.store.get_project(&input.project_id)?;
        let repositories = self.store.list_project_repositories(&project.id)?;
        if repositories.is_empty() {
            return Err(anyhow!("project has no repositories"));
        }

        let source_repo = resolve_source_repo(&repositories, input.source_repo_resource_id.as_deref())?;
        let task_id = uuid::Uuid::new_v4().to_string();
        let task_slug = slugify(&input.title);
        let short_id = &task_id[..8];
        let worktree_name = format!("{task_slug}-{short_id}");
        let branch_name = format!("vega/{task_slug}-{short_id}");
        let repository_path = PathBuf::from(&source_repo.locator);
        let worktree_path = derive_worktree_path(&repository_path, &worktree_name);

        let handle = GitService::new().create_worktree(CreateWorktreeRequest {
            repository_path,
            worktree_path,
            worktree_name: worktree_name.clone(),
            branch_name: branch_name.clone(),
            start_point: None,
            reuse_existing_branch: false,
        })?;

        let timestamp = Utc::now().to_rfc3339();
        let task = Task {
            id: task_id,
            project_id: project.id,
            title: input.title.trim().to_string(),
            workflow_state: WorkflowState::Todo,
            source_repo_resource_id: Some(source_repo.id),
            worktree_path: handle.worktree_path.display().to_string(),
            worktree_name: handle.worktree_name,
            branch_name: handle.branch_name,
            provider: input.provider,
            model: input.model.trim().to_string(),
            permission_policy: "default".to_string(),
            mcp_subset: Vec::new(),
            skill_subset: Vec::new(),
            current_run_id: None,
            last_open_view: WorkspaceView::Agent,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        self.store.insert_task(&task)?;
        Ok(task)
    }

    pub fn update_task_workflow_state(
        &self,
        task_id: &str,
        workflow_state: WorkflowState,
    ) -> Result<()> {
        self.store.update_task_workflow_state(task_id, workflow_state)
    }

    pub async fn delete_task(&self, task_id: &str) -> Result<()> {
        self.sessions.stop(task_id).await?;
        self.terminals.stop(task_id)?;
        self.store.delete_task(task_id)
    }

    pub async fn delete_project(&self, project_id: &str) -> Result<()> {
        let task_ids = self
            .store
            .list_tasks(project_id)?
            .into_iter()
            .map(|task| task.id)
            .collect::<Vec<_>>();

        for task_id in &task_ids {
            self.sessions.stop(task_id).await?;
            self.terminals.stop(task_id)?;
        }

        self.store.delete_project(project_id)?;
        Ok(())
    }
}

fn normalize_repository_path(locator: &str) -> Result<String> {
    let path = std::fs::canonicalize(locator)
        .map_err(|error| anyhow!("resolve repository path {locator}: {error}"))?;
    GitService::new().commit_history(CommitHistoryRequest {
        repository_path: path.clone(),
        max_count: 1,
    })?;
    Ok(path.display().to_string())
}

fn resolve_source_repo(
    repositories: &[ProjectResource],
    requested_id: Option<&str>,
) -> Result<ProjectResource> {
    match (repositories.len(), requested_id) {
        (1, None) => Ok(repositories[0].clone()),
        (_, Some(resource_id)) => repositories
            .iter()
            .find(|resource| resource.id == resource_id)
            .cloned()
            .ok_or_else(|| anyhow!("selected source repository does not belong to the project")),
        _ => Err(anyhow!("select a repository for this task")),
    }
}

fn derive_worktree_path(repository_path: &PathBuf, worktree_name: &str) -> PathBuf {
    let repo_name = repository_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repo");
    let base_dir = repository_path
        .parent()
        .unwrap_or(repository_path.as_path())
        .join(format!(".{repo_name}.vega-worktrees"));
    base_dir.join(worktree_name)
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_dash = false;
    for ch in value.trim().chars() {
        let mapped = if ch.is_ascii_alphanumeric() {
            Some(ch.to_ascii_lowercase())
        } else if ch.is_whitespace() || ch == '-' || ch == '_' {
            Some('-')
        } else {
            None
        };

        match mapped {
            Some('-') if !last_was_dash && !slug.is_empty() => {
                slug.push('-');
                last_was_dash = true;
            }
            Some(ch) if ch != '-' => {
                slug.push(ch);
                last_was_dash = false;
            }
            _ => {}
        }
    }

    if slug.is_empty() {
        "task".to_string()
    } else {
        slug.trim_matches('-').to_string()
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;
    use std::process::Command;
    use std::sync::Arc;

    use tempfile::{tempdir, TempDir};

    use super::*;
    use crate::domain::{CreateProjectResourceInput, Provider};

    fn init_repo(path: &Path) {
        Command::new("git").arg("init").arg(path).output().unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "config", "user.email", "vega@example.com"])
            .output()
            .unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "config", "user.name", "Vega"])
            .output()
            .unwrap();
        std::fs::write(path.join("README.md"), "hello\n").unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "add", "README.md"])
            .output()
            .unwrap();
        Command::new("git")
            .args(["-C", path.to_str().unwrap(), "commit", "-m", "init"])
            .output()
            .unwrap();
    }

    struct CatalogHarness {
        _temp: TempDir,
        catalog: CatalogService,
        project: Project,
        repositories: Vec<ProjectResource>,
    }

    fn setup_catalog() -> CatalogHarness {
        let temp = tempdir().unwrap();
        let repo_a = temp.path().join("repo-a");
        let repo_b = temp.path().join("repo-b");
        std::fs::create_dir_all(&repo_a).unwrap();
        std::fs::create_dir_all(&repo_b).unwrap();
        init_repo(&repo_a);
        init_repo(&repo_b);

        let store = Arc::new(Store::new(temp.path()).unwrap());
        let sessions = Arc::new(SessionManager::new(temp.path().to_path_buf()));
        let terminals = Arc::new(TerminalService::new());
        let catalog = CatalogService::new(store.clone(), sessions, terminals);
        let project = catalog
            .create_project(CreateProjectInput {
                name: "Alpha".to_string(),
                brief: "Build the monitor".to_string(),
                plan_markdown: "- board\n- workspaces".to_string(),
                resources: vec![
                    CreateProjectResourceInput {
                        kind: ProjectResourceKind::Repo,
                        label: "Repo A".to_string(),
                        locator: repo_a.display().to_string(),
                    },
                    CreateProjectResourceInput {
                        kind: ProjectResourceKind::Repo,
                        label: "Repo B".to_string(),
                        locator: repo_b.display().to_string(),
                    },
                ],
            })
            .unwrap();

        let repositories = store.list_project_repositories(&project.id).unwrap();
        CatalogHarness {
            _temp: temp,
            catalog,
            project,
            repositories,
        }
    }

    #[test]
    fn create_project_requires_at_least_one_repo() {
        let temp = tempdir().unwrap();
        let store = Arc::new(Store::new(temp.path()).unwrap());
        let sessions = Arc::new(SessionManager::new(temp.path().to_path_buf()));
        let terminals = Arc::new(TerminalService::new());
        let catalog = CatalogService::new(store, sessions, terminals);

        let error = catalog
            .create_project(CreateProjectInput {
                name: "Alpha".to_string(),
                brief: "Build the monitor".to_string(),
                plan_markdown: "- board".to_string(),
                resources: vec![CreateProjectResourceInput {
                    kind: ProjectResourceKind::Doc,
                    label: "Spec".to_string(),
                    locator: "/tmp/spec.md".to_string(),
                }],
            })
            .unwrap_err();

        assert!(error.to_string().contains("repository"));
    }

    #[test]
    fn create_task_requires_repo_selection_when_project_has_multiple_repos() {
        let harness = setup_catalog();
        let error = harness
            .catalog
            .create_task(CreateTaskInput {
                project_id: harness.project.id,
                title: "Build board".to_string(),
                source_repo_resource_id: None,
                provider: Provider::Codex,
                model: "gpt-5-codex".to_string(),
            })
            .unwrap_err();

        assert!(error.to_string().contains("select a repository"));
    }

    #[test]
    fn create_task_uses_selected_repo_when_project_has_multiple_repos() {
        let harness = setup_catalog();
        let selected_repo = harness.repositories[1].clone();
        let task = harness
            .catalog
            .create_task(CreateTaskInput {
                project_id: harness.project.id,
                title: "Build board".to_string(),
                source_repo_resource_id: Some(selected_repo.id.clone()),
                provider: Provider::Codex,
                model: "gpt-5-codex".to_string(),
            })
            .unwrap();

        assert_eq!(task.source_repo_resource_id, Some(selected_repo.id));
        assert!(task.worktree_path.contains(".repo-b.vega-worktrees"));
    }

    #[test]
    fn create_task_uses_the_only_repo_without_explicit_selection() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);

        let store = Arc::new(Store::new(temp.path()).unwrap());
        let sessions = Arc::new(SessionManager::new(temp.path().to_path_buf()));
        let terminals = Arc::new(TerminalService::new());
        let catalog = CatalogService::new(store.clone(), sessions, terminals);
        let project = catalog
            .create_project(CreateProjectInput {
                name: "Solo".to_string(),
                brief: "One repo".to_string(),
                plan_markdown: "- task".to_string(),
                resources: vec![CreateProjectResourceInput {
                    kind: ProjectResourceKind::Repo,
                    label: "Repo".to_string(),
                    locator: repo.display().to_string(),
                }],
            })
            .unwrap();

        let task = catalog
            .create_task(CreateTaskInput {
                project_id: project.id,
                title: "Build board".to_string(),
                source_repo_resource_id: None,
                provider: Provider::Codex,
                model: "gpt-5-codex".to_string(),
            })
            .unwrap();

        assert!(task.worktree_path.contains(".repo.vega-worktrees"));
        assert_eq!(task.workflow_state, WorkflowState::Todo);
    }
}
