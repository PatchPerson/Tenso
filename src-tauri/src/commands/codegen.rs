use crate::state::AppState;
use tenso_shared::models::*;
use std::sync::Arc;

#[tauri::command]
pub async fn generate_code(
    _state: tauri::State<'_, Arc<AppState>>,
    method: String,
    url: String,
    headers: Vec<KeyValue>,
    body: RequestBody,
    language: String,
) -> Result<String, String> {
    crate::codegen::generate(&method, &url, &headers, &body, &language)
}
