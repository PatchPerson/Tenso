use axum::{Json, extract::State, http::StatusCode, extract::Path};
use serde::{Deserialize, Serialize};
use crate::AppState;

#[derive(Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    })
}

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user_id: String,
}

pub async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let password_hash = crate::auth::hash_password(&req.password)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let user_id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let conn = state.db_pool.get().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![user_id, req.username, password_hash, now],
    ).map_err(|e| (StatusCode::CONFLICT, format!("Username already exists: {}", e)))?;

    let token = crate::auth::create_token(&user_id, &req.username, &state.jwt_secret)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(AuthResponse { token, user_id }))
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

pub async fn login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, String)> {
    let conn = state.db_pool.get().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (user_id, password_hash): (String, String) = conn.query_row(
        "SELECT id, password_hash FROM users WHERE username = ?1",
        [&req.username],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).map_err(|_| (StatusCode::UNAUTHORIZED, "Invalid credentials".into()))?;

    let valid = crate::auth::verify_password(&req.password, &password_hash)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    if !valid {
        return Err((StatusCode::UNAUTHORIZED, "Invalid credentials".into()));
    }

    let token = crate::auth::create_token(&user_id, &req.username, &state.jwt_secret)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(AuthResponse { token, user_id }))
}

#[derive(Serialize)]
pub struct WorkspaceResponse {
    pub id: String,
    pub name: String,
    pub owner_id: String,
}

pub async fn list_workspaces(
    State(state): State<AppState>,
) -> Result<Json<Vec<WorkspaceResponse>>, (StatusCode, String)> {
    let conn = state.db_pool.get().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut stmt = conn.prepare("SELECT id, name, owner_id FROM workspaces")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let workspaces = stmt.query_map([], |row| {
        Ok(WorkspaceResponse {
            id: row.get(0)?,
            name: row.get(1)?,
            owner_id: row.get(2)?,
        })
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .filter_map(|r| r.ok())
    .collect();
    Ok(Json(workspaces))
}

#[derive(Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
    pub owner_id: String,
}

pub async fn create_workspace(
    State(state): State<AppState>,
    Json(req): Json<CreateWorkspaceRequest>,
) -> Result<Json<WorkspaceResponse>, (StatusCode, String)> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let conn = state.db_pool.get().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    conn.execute(
        "INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![id, req.name, req.owner_id, now],
    ).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(WorkspaceResponse { id, name: req.name, owner_id: req.owner_id }))
}

pub async fn get_snapshot(
    State(state): State<AppState>,
    Path(workspace_id): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let conn = state.db_pool.get().map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut stmt = conn.prepare("SELECT entity_type, entity_id, data FROM snapshots WHERE workspace_id = ?1")
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut snapshot = serde_json::Map::new();
    let rows = stmt.query_map([&workspace_id], |row| {
        let entity_type: String = row.get(0)?;
        let entity_id: String = row.get(1)?;
        let data: String = row.get(2)?;
        Ok((entity_type, entity_id, data))
    }).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    for row in rows {
        if let Ok((entity_type, entity_id, data)) = row {
            let type_map = snapshot.entry(entity_type).or_insert_with(|| serde_json::Value::Object(serde_json::Map::new()));
            if let Some(obj) = type_map.as_object_mut() {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&data) {
                    obj.insert(entity_id, parsed);
                }
            }
        }
    }

    Ok(Json(serde_json::Value::Object(snapshot)))
}
