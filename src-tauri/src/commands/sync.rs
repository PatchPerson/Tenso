use crate::state::AppState;
use tenso_shared::models::*;
use std::sync::Arc;

#[tauri::command]
pub async fn get_modified_since(
    state: tauri::State<'_, Arc<AppState>>,
    team_id: String,
    since_ms: i64,
) -> Result<serde_json::Value, String> {
    let (collections, requests, environments, history) = state.db
        .get_modified_since(&team_id, since_ms)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "collections": collections,
        "requests": requests,
        "environments": environments,
        "history": history,
    }))
}

#[tauri::command]
pub async fn get_unsynced_deletes(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<serde_json::Value>, String> {
    let deletes = state.db.get_unsynced_deletes().map_err(|e| e.to_string())?;
    Ok(deletes.into_iter().map(|(id, entity_type, entity_id)| {
        serde_json::json!({ "id": id, "entityType": entity_type, "entityId": entity_id })
    }).collect())
}

#[tauri::command]
pub async fn mark_deletes_synced(
    state: tauri::State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<(), String> {
    state.db.mark_deletes_synced(&ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_collection(
    state: tauri::State<'_, Arc<AppState>>,
    collection: Collection,
) -> Result<(), String> {
    state.db.upsert_collection(&collection).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_request(
    state: tauri::State<'_, Arc<AppState>>,
    request: SavedRequest,
) -> Result<(), String> {
    state.db.upsert_request(&request).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_environment(
    state: tauri::State<'_, Arc<AppState>>,
    environment: Environment,
) -> Result<(), String> {
    state.db.upsert_environment(&environment).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_history(
    state: tauri::State<'_, Arc<AppState>>,
    entry: HistoryEntry,
) -> Result<(), String> {
    state.db.upsert_history(&entry).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn soft_delete_entity(
    state: tauri::State<'_, Arc<AppState>>,
    entity_type: String,
    entity_id: String,
) -> Result<(), String> {
    state.db.soft_delete_by_id(&entity_type, &entity_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_sync_state(
    state: tauri::State<'_, Arc<AppState>>,
    team_id: String,
) -> Result<serde_json::Value, String> {
    let (last_pull, last_push) = state.db.get_sync_state(&team_id).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "lastPullAt": last_pull, "lastPushAt": last_push }))
}

#[tauri::command]
pub async fn set_sync_state(
    state: tauri::State<'_, Arc<AppState>>,
    team_id: String,
    last_pull: i64,
    last_push: i64,
) -> Result<(), String> {
    state.db.set_sync_state(&team_id, last_pull, last_push).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_for_team(
    state: tauri::State<'_, Arc<AppState>>,
    team_id: String,
) -> Result<serde_json::Value, String> {
    let (collections, requests, environments, history) = state.db
        .get_all_for_team(&team_id)
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "collections": collections,
        "requests": requests,
        "environments": environments,
        "history": history,
    }))
}
