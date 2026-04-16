mod catalog_service;
mod commands;
mod domain;
mod events;
mod git_commands;
mod projection;
mod session;
mod store;
mod terminal_service;
mod view_model;
mod worktree_inspector;
mod workspace_service;

use std::sync::Arc;

use catalog_service::CatalogService;
use session::SessionManager;
use store::Store;
use tauri::Manager;
use terminal_service::TerminalService;
use workspace_service::WorkspaceService;

pub struct AppState {
    pub catalog: CatalogService,
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
            let terminals = Arc::new(TerminalService::new());
            let catalog = CatalogService::new(store.clone(), sessions.clone(), terminals.clone());
            let workspace = WorkspaceService::new(store, sessions, terminals);

            app.manage(AppState { catalog, workspace });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_project,
            commands::list_projects,
            commands::get_project_board,
            commands::add_project_resource,
            commands::create_task,
            commands::update_task_workflow_state,
            commands::delete_task,
            commands::delete_project,
            commands::list_active_workspaces,
            commands::open_workspace,
            commands::set_workspace_view,
            commands::close_workspace,
            commands::inspect_worktree,
            commands::read_worktree_file,
            commands::save_worktree_file,
            commands::attach_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::send_prompt,
            commands::cancel_run,
            git_commands::load_commit_history,
            git_commands::load_commit_diff,
            git_commands::load_commit_replay,
            git_commands::create_worktree,
        ])
        .run(tauri::generate_context!())
        .expect("error running vega");
}
