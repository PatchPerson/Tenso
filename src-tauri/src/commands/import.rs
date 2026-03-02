use crate::state::AppState;
use crate::import::postman::ImportedCollection;
use tenso_shared::models::*;
use std::sync::Arc;

#[tauri::command]
pub async fn import_curl(
    _state: tauri::State<'_, Arc<AppState>>,
    curl_command: String,
) -> Result<SavedRequest, String> {
    crate::import::curl::parse_curl(&curl_command)
}

#[tauri::command]
pub async fn import_openapi(
    state: tauri::State<'_, Arc<AppState>>,
    spec_json: String,
    workspace_id: String,
) -> Result<Vec<Collection>, String> {
    crate::import::openapi::import_openapi_spec(&state, &spec_json, &workspace_id).await
}

#[tauri::command]
pub async fn import_postman(
    _state: tauri::State<'_, Arc<AppState>>,
    json_content: String,
) -> Result<ImportedCollection, String> {
    crate::import::postman::parse_postman_collection(&json_content)
}
