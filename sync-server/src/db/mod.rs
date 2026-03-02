pub mod migrations;

use r2d2::Pool;
use r2d2_sqlite::SqliteManager;
use rusqlite::params;

pub type DbPool = Pool<SqliteManager>;

pub fn init_pool(path: &str) -> Result<DbPool, Box<dyn std::error::Error>> {
    let manager = SqliteManager::file(path);
    let pool = Pool::builder().max_size(8).build(manager)?;

    let conn = pool.get()?;
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA foreign_keys=ON;
        PRAGMA busy_timeout=5000;
    ")?;

    Ok(pool)
}

pub fn get_operations_since(pool: &DbPool, workspace_id: &str, since_revision: u64) -> Result<Vec<reqlite_shared::protocol::Operation>, Box<dyn std::error::Error>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, entity_type, entity_id, op_type, fields, revision, user_id, timestamp FROM operations WHERE workspace_id = ?1 AND revision > ?2 ORDER BY revision"
    )?;
    let rows = stmt.query_map(params![workspace_id, since_revision], |row| {
        let entity_type_str: String = row.get(2)?;
        let op_type_str: String = row.get(4)?;
        let fields_str: String = row.get(5)?;
        Ok(reqlite_shared::protocol::Operation {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            entity_type: serde_json::from_str(&format!("\"{}\"", entity_type_str)).unwrap_or(reqlite_shared::protocol::EntityType::Request),
            entity_id: row.get(3)?,
            op_type: serde_json::from_str(&format!("\"{}\"", op_type_str)).unwrap_or(reqlite_shared::protocol::OpType::Update),
            fields: serde_json::from_str(&fields_str).unwrap_or(serde_json::Value::Null),
            revision: row.get(6)?,
            user_id: row.get(7)?,
            timestamp: row.get(8)?,
        })
    })?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn insert_operation(pool: &DbPool, op: &reqlite_shared::protocol::Operation) -> Result<u64, Box<dyn std::error::Error>> {
    let conn = pool.get()?;
    let entity_type = serde_json::to_string(&op.entity_type)?;
    let op_type = serde_json::to_string(&op.op_type)?;
    let fields = serde_json::to_string(&op.fields)?;
    conn.execute(
        "INSERT INTO operations (id, workspace_id, entity_type, entity_id, op_type, fields, user_id, timestamp) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![op.id, op.workspace_id, entity_type.trim_matches('"'), op.entity_id, op_type.trim_matches('"'), fields, op.user_id, op.timestamp],
    )?;
    let revision: u64 = conn.query_row("SELECT last_insert_rowid()", [], |row| row.get(0))?;
    Ok(revision)
}

pub fn get_latest_revision(pool: &DbPool, workspace_id: &str) -> Result<u64, Box<dyn std::error::Error>> {
    let conn = pool.get()?;
    let revision: u64 = conn.query_row(
        "SELECT COALESCE(MAX(revision), 0) FROM operations WHERE workspace_id = ?1",
        [workspace_id],
        |row| row.get(0),
    )?;
    Ok(revision)
}

pub fn check_field_conflict(pool: &DbPool, workspace_id: &str, entity_id: &str, fields: &serde_json::Value, since_revision: u64) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT fields FROM operations WHERE workspace_id = ?1 AND entity_id = ?2 AND revision > ?3"
    )?;
    let rows = stmt.query_map(params![workspace_id, entity_id, since_revision], |row| {
        let fields_str: String = row.get(0)?;
        Ok(fields_str)
    })?;

    let mut conflicting = Vec::new();
    let incoming_keys: Vec<String> = match fields.as_object() {
        Some(obj) => obj.keys().cloned().collect(),
        None => return Ok(vec![]),
    };

    for row in rows {
        if let Ok(fields_str) = row {
            if let Ok(existing) = serde_json::from_str::<serde_json::Value>(&fields_str) {
                if let Some(obj) = existing.as_object() {
                    for key in &incoming_keys {
                        if obj.contains_key(key) && !conflicting.contains(key) {
                            conflicting.push(key.clone());
                        }
                    }
                }
            }
        }
    }

    Ok(conflicting)
}
