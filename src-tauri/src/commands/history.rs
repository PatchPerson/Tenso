use crate::state::AppState;
use tenso_shared::models::*;
use std::sync::Arc;

#[tauri::command]
pub async fn list_history(state: tauri::State<'_, Arc<AppState>>, team_id: String, limit: Option<u32>) -> Result<Vec<HistoryEntry>, String> {
    state.db.list_history(&team_id, limit.unwrap_or(100)).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_history(state: tauri::State<'_, Arc<AppState>>, team_id: String) -> Result<(), String> {
    state.db.clear_history(&team_id).map_err(|e| e.to_string())
}
