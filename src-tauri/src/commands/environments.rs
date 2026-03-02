use crate::state::AppState;
use reqlite_shared::models::*;
use std::sync::Arc;

#[tauri::command]
pub async fn list_environments(state: tauri::State<'_, Arc<AppState>>, team_id: String) -> Result<Vec<Environment>, String> {
    state.db.list_environments(&team_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_environment(state: tauri::State<'_, Arc<AppState>>, team_id: String, name: String) -> Result<Environment, String> {
    state.db.create_environment(&team_id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_environment(state: tauri::State<'_, Arc<AppState>>, environment: Environment) -> Result<(), String> {
    state.db.update_environment(&environment).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_environment(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.db.delete_environment(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_active_environment(state: tauri::State<'_, Arc<AppState>>) -> Result<Option<String>, String> {
    Ok(state.active_environment.read().unwrap().clone())
}

#[tauri::command]
pub async fn set_active_environment(state: tauri::State<'_, Arc<AppState>>, env_id: Option<String>) -> Result<(), String> {
    *state.active_environment.write().unwrap() = env_id;
    Ok(())
}
