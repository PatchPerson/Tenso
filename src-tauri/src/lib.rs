use tauri::Manager;

mod state;
mod db;
mod commands;
mod http;
mod websocket;
mod scripting;
mod import;
mod codegen;

use state::AppState;
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter("tenso=debug")
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            std::fs::create_dir_all(&data_dir).ok();

            let db_path = data_dir.join("tenso.db");
            let state = AppState::new(db_path.to_str().unwrap())
                .expect("Failed to initialize app state");

            app.manage(Arc::new(state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::collections::list_teams,
            commands::collections::create_team,
            commands::collections::list_collections,
            commands::collections::create_collection,
            commands::collections::update_collection,
            commands::collections::delete_collection,
            commands::collections::list_requests,
            commands::collections::get_request,
            commands::collections::create_request,
            commands::collections::update_request,
            commands::collections::delete_request,
            commands::http::send_request,
            commands::environments::list_environments,
            commands::environments::create_environment,
            commands::environments::update_environment,
            commands::environments::delete_environment,
            commands::environments::get_active_environment,
            commands::environments::set_active_environment,
            commands::history::list_history,
            commands::history::clear_history,
            commands::import::import_curl,
            commands::import::import_openapi,
            commands::import::import_postman,
            commands::codegen::generate_code,
            commands::scripting::run_script,
            commands::websocket::ws_connect,
            commands::websocket::ws_send,
            commands::websocket::ws_disconnect,
            commands::sync::get_modified_since,
            commands::sync::get_unsynced_deletes,
            commands::sync::mark_deletes_synced,
            commands::sync::upsert_collection,
            commands::sync::upsert_request,
            commands::sync::upsert_environment,
            commands::sync::upsert_history,
            commands::sync::soft_delete_entity,
            commands::sync::get_sync_state,
            commands::sync::set_sync_state,
            commands::sync::get_all_for_team,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
