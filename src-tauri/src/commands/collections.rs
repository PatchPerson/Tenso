use crate::state::AppState;
use tenso_shared::models::*;
use std::sync::Arc;

#[tauri::command]
pub async fn list_teams(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<Team>, String> {
    state.db.list_teams().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_team(state: tauri::State<'_, Arc<AppState>>, name: String) -> Result<Team, String> {
    state.db.create_team(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_collections(state: tauri::State<'_, Arc<AppState>>, team_id: String) -> Result<Vec<Collection>, String> {
    state.db.list_collections(&team_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_collection(state: tauri::State<'_, Arc<AppState>>, team_id: String, parent_id: Option<String>, name: String) -> Result<Collection, String> {
    state.db.create_collection(&team_id, parent_id.as_deref(), &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_collection(state: tauri::State<'_, Arc<AppState>>, id: String, name: String) -> Result<(), String> {
    state.db.update_collection(&id, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_collection(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.db.delete_collection(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_requests(state: tauri::State<'_, Arc<AppState>>, collection_id: String) -> Result<Vec<SavedRequest>, String> {
    state.db.list_requests(&collection_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_request(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<Option<SavedRequest>, String> {
    state.db.get_request(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_request(state: tauri::State<'_, Arc<AppState>>, collection_id: String, name: String, method: String, url: String) -> Result<SavedRequest, String> {
    state.db.create_request(&collection_id, &name, &method, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_request(state: tauri::State<'_, Arc<AppState>>, request: SavedRequest) -> Result<(), String> {
    state.db.update_request(&request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_request(state: tauri::State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.db.delete_request(&id).map_err(|e| e.to_string())
}
