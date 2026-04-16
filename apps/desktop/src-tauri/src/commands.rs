use tauri::ipc::Channel;
use tauri::State;

use crate::domain::{
    AddProjectResourceInput, CreateProjectInput, CreateTaskInput, Project, ProjectResource, Task,
    TaskView,
};
use crate::events::SessionUpdate;
use crate::view_model::TaskWorkspaceViewModel;
use crate::AppState;

#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> Result<Project, String> {
    state
        .workspace
        .create_project(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<Project>, String> {
    state
        .workspace
        .list_projects()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn add_project_resource(
    state: State<'_, AppState>,
    input: AddProjectResourceInput,
) -> Result<ProjectResource, String> {
    state
        .workspace
        .add_project_resource(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_task(
    state: State<'_, AppState>,
    input: CreateTaskInput,
) -> Result<Task, String> {
    state
        .workspace
        .create_task(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_tasks(state: State<'_, AppState>, project_id: String) -> Result<Vec<Task>, String> {
    state
        .workspace
        .list_tasks(&project_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn open_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<TaskWorkspaceViewModel, String> {
    state
        .workspace
        .open_task(&task_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_last_open_view(
    state: State<'_, AppState>,
    task_id: String,
    view: TaskView,
) -> Result<(), String> {
    state
        .workspace
        .set_last_open_view(&task_id, view)
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
