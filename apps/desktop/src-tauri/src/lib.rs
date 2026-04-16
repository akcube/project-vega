mod catalog_service;
mod commands;
mod domain;
mod events;
mod feed;
mod git_commands;
mod monitor;
mod projection;
mod session;
mod store;
mod terminal_service;
mod view_model;
mod workspace_service;

use std::sync::Arc;

use catalog_service::CatalogService;
use monitor::SessionMonitor;
use session::SessionManager;
use store::Store;
use tauri::Manager;
use terminal_service::TerminalService;
use workspace_service::WorkspaceService;

pub struct AppState {
    pub catalog: CatalogService,
    pub workspace: WorkspaceService,
    pub store: Arc<Store>,
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
            let monitor = Arc::new(SessionMonitor::new(store.clone(), app.handle().clone()));
            let workspace = WorkspaceService::new(store.clone(), sessions, terminals)
                .with_monitor(monitor);

            app.manage(AppState {
                catalog,
                workspace,
                store: store.clone(),
            });
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
            commands::attach_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::send_prompt,
            commands::cancel_run,
            commands::list_feed_entries,
            commands::mark_feed_entry_read,
            commands::count_unread_feed_entries,
            git_commands::load_commit_history,
            git_commands::load_commit_diff,
            git_commands::load_commit_replay,
            git_commands::create_worktree,
        ])
        .run(tauri::generate_context!())
        .expect("error running vega");
}
