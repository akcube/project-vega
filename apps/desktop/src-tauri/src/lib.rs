mod commands;
mod domain;
mod events;
mod projection;
mod session;
mod store;
mod view_model;
mod workspace_service;

use std::sync::Arc;

use session::SessionManager;
use store::Store;
use tauri::Manager;
use workspace_service::WorkspaceService;

pub struct AppState {
    pub workspace: WorkspaceService,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let home_dir = app.path().home_dir()?;
            let store = Arc::new(Store::new(&data_dir)?);
            let sessions = Arc::new(SessionManager::new(home_dir));
            app.manage(AppState {
                workspace: WorkspaceService::new(store, sessions),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::list_projects,
            commands::add_project_resource,
            commands::create_task,
            commands::list_tasks,
            commands::open_task,
            commands::set_last_open_view,
            commands::send_prompt,
            commands::cancel_run,
        ])
        .run(tauri::generate_context!())
        .expect("error running vega");
}
