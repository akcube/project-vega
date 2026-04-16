use tauri::State;
use tauri::ipc::Channel;

use crate::AppState;
use crate::domain::{
    AddProjectResourceInput, CreateProjectInput, CreateTaskInput, Project, ProjectPlanGuidance,
    ProjectPlanningInput, ProjectResource, ProjectTaskSuggestions, Task, WorkflowState,
    WorkspaceView,
};
use crate::events::SessionUpdate;
use crate::feed::FeedEntry;
use crate::project_planner;
use crate::view_model::{
    ProjectBoardViewModel, TaskWorkspaceViewModel, TerminalEvent, TerminalSnapshot,
    WorktreeFileDocumentViewModel, WorktreeInspectionViewModel, WorkspaceSummaryViewModel,
};

#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> Result<Project, String> {
    state
        .catalog
        .create_project(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn suggest_project_plan(
    input: ProjectPlanningInput,
) -> Result<ProjectPlanGuidance, String> {
    Ok(project_planner::suggest_project_plan(input).await)
}

#[tauri::command]
pub async fn suggest_project_tasks(
    input: ProjectPlanningInput,
) -> Result<ProjectTaskSuggestions, String> {
    Ok(project_planner::suggest_project_tasks(input).await)
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    state
        .catalog
        .list_projects()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_project_board(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<ProjectBoardViewModel, String> {
    state
        .catalog
        .project_board(&project_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_project_resource(
    state: State<'_, AppState>,
    input: AddProjectResourceInput,
) -> Result<ProjectResource, String> {
    state
        .catalog
        .add_project_resource(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_task(state: State<'_, AppState>, input: CreateTaskInput) -> Result<Task, String> {
    state
        .catalog
        .create_task(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_task_workflow_state(
    state: State<'_, AppState>,
    task_id: String,
    workflow_state: WorkflowState,
) -> Result<(), String> {
    state
        .catalog
        .update_task_workflow_state(&task_id, workflow_state)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_task(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .catalog
        .delete_task(&task_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn delete_project(state: State<'_, AppState>, project_id: String) -> Result<(), String> {
    state
        .catalog
        .delete_project(&project_id)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_active_workspaces(
    state: State<'_, AppState>,
) -> Result<Vec<WorkspaceSummaryViewModel>, String> {
    state
        .workspace
        .list_active_workspaces()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_workspace(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<TaskWorkspaceViewModel, String> {
    state
        .workspace
        .open_workspace(&task_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_workspace_view(
    state: State<'_, AppState>,
    task_id: String,
    view: WorkspaceView,
) -> Result<TaskWorkspaceViewModel, String> {
    state
        .workspace
        .set_workspace_view(&task_id, view)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn close_workspace(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .workspace
        .close_workspace(&task_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inspect_worktree(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<WorktreeInspectionViewModel, String> {
    state
        .workspace
        .inspect_worktree(&task_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_worktree_file(
    state: State<'_, AppState>,
    task_id: String,
    relative_path: String,
) -> Result<WorktreeFileDocumentViewModel, String> {
    state
        .workspace
        .read_worktree_file(&task_id, &relative_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_worktree_file(
    state: State<'_, AppState>,
    task_id: String,
    relative_path: String,
    contents: String,
) -> Result<WorktreeFileDocumentViewModel, String> {
    state
        .workspace
        .save_worktree_file(&task_id, &relative_path, &contents)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn attach_terminal(
    state: State<'_, AppState>,
    task_id: String,
    cols: u16,
    rows: u16,
    on_event: Channel<TerminalEvent>,
) -> Result<TerminalSnapshot, String> {
    state
        .workspace
        .attach_terminal(&task_id, cols, rows, on_event)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, AppState>,
    task_id: String,
    data: String,
) -> Result<(), String> {
    state
        .workspace
        .write_terminal(&task_id, &data)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, AppState>,
    task_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .workspace
        .resize_terminal(&task_id, cols, rows)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn send_prompt(
    state: State<'_, AppState>,
    task_id: String,
    text: String,
    on_event: Channel<SessionUpdate>,
) -> Result<String, String> {
    state
        .workspace
        .send_prompt(&task_id, &text, on_event)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn cancel_run(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .workspace
        .cancel_run(&task_id)
        .await
        .map_err(|error| error.to_string())
}

// ── Feed commands ─────────────────────────────────────────────────────

#[tauri::command]
pub fn list_feed_entries(
    state: State<'_, AppState>,
    limit: i64,
) -> Result<Vec<FeedEntry>, String> {
    state
        .store
        .list_feed_entries(limit)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn mark_feed_entry_read(
    state: State<'_, AppState>,
    entry_id: String,
) -> Result<(), String> {
    state
        .store
        .mark_feed_entry_read(&entry_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn count_unread_feed_entries(state: State<'_, AppState>) -> Result<i64, String> {
    state
        .store
        .count_unread_feed_entries()
        .map_err(|error| error.to_string())
}
