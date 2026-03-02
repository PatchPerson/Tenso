use crate::state::AppState;
use std::sync::Arc;

#[tauri::command]
pub async fn ws_connect(
    state: tauri::State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
    id: String,
    url: String,
    headers: Vec<tenso_shared::models::KeyValue>,
) -> Result<(), String> {
    crate::websocket::connect(&state, &app_handle, &id, &url, &headers).await
}

#[tauri::command]
pub async fn ws_send(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    message: String,
) -> Result<(), String> {
    if let Some(conn) = state.ws_connections.get(&id) {
        conn.tx.send(message).map_err(|e| e.to_string())
    } else {
        Err("Connection not found".into())
    }
}

#[tauri::command]
pub async fn ws_disconnect(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    state.ws_connections.remove(&id);
    Ok(())
}
