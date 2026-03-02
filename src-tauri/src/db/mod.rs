mod migrations;

use rusqlite::Connection;
use std::sync::Mutex;
use tenso_shared::models::*;

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn new(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let conn = Connection::open(path)?;
        conn.execute_batch("
            PRAGMA journal_mode=WAL;
            PRAGMA synchronous=NORMAL;
            PRAGMA busy_timeout=5000;
        ")?;
        let db = Self { conn: Mutex::new(conn) };
        db.run_migrations()?;
        // Enable foreign keys AFTER migrations (ALTER TABLE RENAME needs them OFF)
        db.conn.lock().unwrap().execute_batch("PRAGMA foreign_keys=ON;")?;
        db.ensure_default_team()?;
        Ok(db)
    }

    fn run_migrations(&self) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().unwrap();
        migrations::run(&conn)?;
        Ok(())
    }

    fn ensure_default_team(&self) -> Result<(), Box<dyn std::error::Error>> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM teams", [], |r| r.get(0))?;
        if count == 0 {
            let id = ulid::Ulid::new().to_string();
            let now = chrono::Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO teams (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, "Default Team", now, now],
            )?;
        }
        Ok(())
    }

    // Team operations
    pub fn list_teams(&self) -> Result<Vec<Team>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, convex_team_id, created_at, updated_at FROM teams ORDER BY created_at")?;
        let rows = stmt.query_map([], |row| {
            Ok(Team {
                id: row.get(0)?,
                name: row.get(1)?,
                convex_team_id: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_team(&self, name: &str) -> Result<Team, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO teams (id, name, convex_team_id, created_at, updated_at) VALUES (?1, ?2, NULL, ?3, ?4)",
            rusqlite::params![id, name, now, now],
        )?;
        Ok(Team { id, name: name.to_string(), convex_team_id: None, created_at: now.clone(), updated_at: now })
    }

    // Collection operations
    pub fn list_collections(&self, team_id: &str) -> Result<Vec<Collection>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, team_id, parent_id, name, sort_order, created_at, updated_at FROM collections WHERE team_id = ?1 ORDER BY sort_order"
        )?;
        let rows = stmt.query_map([team_id], |row| {
            Ok(Collection {
                id: row.get(0)?,
                team_id: row.get(1)?,
                parent_id: row.get(2)?,
                name: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_collection(&self, team_id: &str, parent_id: Option<&str>, name: &str) -> Result<Collection, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let sort_order: f64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), 0.0) + 1.0 FROM collections WHERE team_id = ?1 AND parent_id IS ?2",
            rusqlite::params![team_id, parent_id],
            |row| row.get(0),
        )?;
        conn.execute(
            "INSERT INTO collections (id, team_id, parent_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![id, team_id, parent_id, name, sort_order, now, now],
        )?;
        Ok(Collection {
            id, team_id: team_id.to_string(), parent_id: parent_id.map(|s| s.to_string()),
            name: name.to_string(), sort_order, created_at: now.clone(), updated_at: now,
        })
    }

    pub fn update_collection(&self, id: &str, name: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute("UPDATE collections SET name = ?1, updated_at = ?2 WHERE id = ?3", rusqlite::params![name, now, id])?;
        Ok(())
    }

    pub fn delete_collection(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let tombstone_id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO deleted_entities (id, entity_type, entity_id, deleted_at, synced) VALUES (?1, 'collection', ?2, ?3, 0)",
            rusqlite::params![tombstone_id, id, now],
        )?;
        conn.execute("DELETE FROM requests WHERE collection_id = ?1", [id])?;
        conn.execute("DELETE FROM collections WHERE parent_id = ?1", [id])?;
        conn.execute("DELETE FROM collections WHERE id = ?1", [id])?;
        Ok(())
    }

    // Request operations
    pub fn list_requests(&self, collection_id: &str) -> Result<Vec<SavedRequest>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, name, method, url, headers, params, body, auth, pre_script, post_script, sort_order, created_at, updated_at FROM requests WHERE collection_id = ?1 ORDER BY sort_order"
        )?;
        let rows = stmt.query_map([collection_id], |row| {
            let headers_json: String = row.get(5)?;
            let params_json: String = row.get(6)?;
            let body_json: String = row.get(7)?;
            let auth_json: String = row.get(8)?;
            Ok(SavedRequest {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                name: row.get(2)?,
                method: row.get(3)?,
                url: row.get(4)?,
                headers: serde_json::from_str(&headers_json).unwrap_or_default(),
                params: serde_json::from_str(&params_json).unwrap_or_default(),
                body: serde_json::from_str(&body_json).unwrap_or(RequestBody::None),
                auth: serde_json::from_str(&auth_json).unwrap_or(AuthConfig::None),
                pre_script: row.get(9)?,
                post_script: row.get(10)?,
                sort_order: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_request(&self, id: &str) -> Result<Option<SavedRequest>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, collection_id, name, method, url, headers, params, body, auth, pre_script, post_script, sort_order, created_at, updated_at FROM requests WHERE id = ?1"
        )?;
        let mut rows = stmt.query_map([id], |row| {
            let headers_json: String = row.get(5)?;
            let params_json: String = row.get(6)?;
            let body_json: String = row.get(7)?;
            let auth_json: String = row.get(8)?;
            Ok(SavedRequest {
                id: row.get(0)?,
                collection_id: row.get(1)?,
                name: row.get(2)?,
                method: row.get(3)?,
                url: row.get(4)?,
                headers: serde_json::from_str(&headers_json).unwrap_or_default(),
                params: serde_json::from_str(&params_json).unwrap_or_default(),
                body: serde_json::from_str(&body_json).unwrap_or(RequestBody::None),
                auth: serde_json::from_str(&auth_json).unwrap_or(AuthConfig::None),
                pre_script: row.get(9)?,
                post_script: row.get(10)?,
                sort_order: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })?;
        Ok(rows.next().transpose()?)
    }

    pub fn create_request(&self, collection_id: &str, name: &str, method: &str, url: &str) -> Result<SavedRequest, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let sort_order: f64 = conn.query_row(
            "SELECT COALESCE(MAX(sort_order), 0.0) + 1.0 FROM requests WHERE collection_id = ?1",
            [collection_id],
            |row| row.get(0),
        )?;
        let empty_arr = "[]";
        let body_json = serde_json::to_string(&RequestBody::None).unwrap();
        let auth_json = serde_json::to_string(&AuthConfig::None).unwrap();
        conn.execute(
            "INSERT INTO requests (id, collection_id, name, method, url, headers, params, body, auth, pre_script, post_script, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, '', '', ?10, ?11, ?12)",
            rusqlite::params![id, collection_id, name, method, url, empty_arr, empty_arr, body_json, auth_json, sort_order, now, now],
        )?;
        Ok(SavedRequest {
            id, collection_id: collection_id.to_string(), name: name.to_string(),
            method: method.to_string(), url: url.to_string(),
            headers: vec![], params: vec![], body: RequestBody::None, auth: AuthConfig::None,
            pre_script: String::new(), post_script: String::new(), sort_order,
            created_at: now.clone(), updated_at: now,
        })
    }

    pub fn update_request(&self, req: &SavedRequest) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let headers_json = serde_json::to_string(&req.headers).unwrap();
        let params_json = serde_json::to_string(&req.params).unwrap();
        let body_json = serde_json::to_string(&req.body).unwrap();
        let auth_json = serde_json::to_string(&req.auth).unwrap();
        conn.execute(
            "UPDATE requests SET name=?1, method=?2, url=?3, headers=?4, params=?5, body=?6, auth=?7, pre_script=?8, post_script=?9, updated_at=?10 WHERE id=?11",
            rusqlite::params![req.name, req.method, req.url, headers_json, params_json, body_json, auth_json, req.pre_script, req.post_script, now, req.id],
        )?;
        Ok(())
    }

    pub fn delete_request(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let tombstone_id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO deleted_entities (id, entity_type, entity_id, deleted_at, synced) VALUES (?1, 'request', ?2, ?3, 0)",
            rusqlite::params![tombstone_id, id, now],
        )?;
        conn.execute("DELETE FROM requests WHERE id = ?1", [id])?;
        Ok(())
    }

    // Environment operations
    pub fn list_environments(&self, team_id: &str) -> Result<Vec<Environment>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, team_id, name, variables, created_at, updated_at FROM environments WHERE team_id = ?1 ORDER BY name"
        )?;
        let rows = stmt.query_map([team_id], |row| {
            let vars_json: String = row.get(3)?;
            Ok(Environment {
                id: row.get(0)?,
                team_id: row.get(1)?,
                name: row.get(2)?,
                variables: serde_json::from_str(&vars_json).unwrap_or_default(),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn create_environment(&self, team_id: &str, name: &str) -> Result<Environment, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO environments (id, team_id, name, variables, created_at, updated_at) VALUES (?1, ?2, ?3, '[]', ?4, ?5)",
            rusqlite::params![id, team_id, name, now, now],
        )?;
        Ok(Environment { id, team_id: team_id.to_string(), name: name.to_string(), variables: vec![], created_at: now.clone(), updated_at: now })
    }

    pub fn update_environment(&self, env: &Environment) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let vars_json = serde_json::to_string(&env.variables).unwrap();
        conn.execute(
            "UPDATE environments SET name=?1, variables=?2, updated_at=?3 WHERE id=?4",
            rusqlite::params![env.name, vars_json, now, env.id],
        )?;
        Ok(())
    }

    pub fn delete_environment(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let tombstone_id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO deleted_entities (id, entity_type, entity_id, deleted_at, synced) VALUES (?1, 'environment', ?2, ?3, 0)",
            rusqlite::params![tombstone_id, id, now],
        )?;
        conn.execute("DELETE FROM environments WHERE id = ?1", [id])?;
        Ok(())
    }

    // History operations
    pub fn add_history(&self, entry: &HistoryEntry) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO history (id, team_id, method, url, status, duration_ms, response_size, timestamp, request_data, response_headers, response_body_preview) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![entry.id, entry.team_id, entry.method, entry.url, entry.status, entry.duration_ms, entry.response_size, entry.timestamp, entry.request_data, entry.response_headers, entry.response_body_preview],
        )?;
        Ok(())
    }

    pub fn list_history(&self, team_id: &str, limit: u32) -> Result<Vec<HistoryEntry>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, team_id, method, url, status, duration_ms, response_size, timestamp, request_data, response_headers, response_body_preview FROM history WHERE team_id = ?1 ORDER BY timestamp DESC LIMIT ?2"
        )?;
        let rows = stmt.query_map(rusqlite::params![team_id, limit], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                team_id: row.get(1)?,
                method: row.get(2)?,
                url: row.get(3)?,
                status: row.get(4)?,
                duration_ms: row.get(5)?,
                response_size: row.get(6)?,
                timestamp: row.get(7)?,
                request_data: row.get(8)?,
                response_headers: row.get(9)?,
                response_body_preview: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    pub fn clear_history(&self, team_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM history WHERE team_id = ?1", [team_id])?;
        Ok(())
    }

    // Sync: get modified entities since timestamp
    pub fn get_modified_since(&self, team_id: &str, since_ms: i64) -> Result<(Vec<Collection>, Vec<SavedRequest>, Vec<Environment>, Vec<HistoryEntry>), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let since_str = chrono::DateTime::from_timestamp_millis(since_ms)
            .map(|dt| dt.to_rfc3339())
            .unwrap_or_default();

        let mut stmt = conn.prepare(
            "SELECT id, team_id, parent_id, name, sort_order, created_at, updated_at FROM collections WHERE team_id = ?1 AND updated_at > ?2"
        )?;
        let collections: Vec<Collection> = stmt.query_map(rusqlite::params![team_id, since_str], |row| {
            Ok(Collection {
                id: row.get(0)?, team_id: row.get(1)?, parent_id: row.get(2)?,
                name: row.get(3)?, sort_order: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
            })
        })?.collect::<Result<_, _>>()?;

        let mut stmt = conn.prepare(
            "SELECT id, collection_id, name, method, url, headers, params, body, auth, pre_script, post_script, sort_order, created_at, updated_at FROM requests WHERE collection_id IN (SELECT id FROM collections WHERE team_id = ?1) AND updated_at > ?2"
        )?;
        let requests: Vec<SavedRequest> = stmt.query_map(rusqlite::params![team_id, since_str], |row| {
            let headers_json: String = row.get(5)?;
            let params_json: String = row.get(6)?;
            let body_json: String = row.get(7)?;
            let auth_json: String = row.get(8)?;
            Ok(SavedRequest {
                id: row.get(0)?, collection_id: row.get(1)?, name: row.get(2)?,
                method: row.get(3)?, url: row.get(4)?,
                headers: serde_json::from_str(&headers_json).unwrap_or_default(),
                params: serde_json::from_str(&params_json).unwrap_or_default(),
                body: serde_json::from_str(&body_json).unwrap_or(RequestBody::None),
                auth: serde_json::from_str(&auth_json).unwrap_or(AuthConfig::None),
                pre_script: row.get(9)?, post_script: row.get(10)?,
                sort_order: row.get(11)?, created_at: row.get(12)?, updated_at: row.get(13)?,
            })
        })?.collect::<Result<_, _>>()?;

        let mut stmt = conn.prepare(
            "SELECT id, team_id, name, variables, created_at, updated_at FROM environments WHERE team_id = ?1 AND updated_at > ?2"
        )?;
        let environments: Vec<Environment> = stmt.query_map(rusqlite::params![team_id, since_str], |row| {
            let vars_json: String = row.get(3)?;
            Ok(Environment {
                id: row.get(0)?, team_id: row.get(1)?, name: row.get(2)?,
                variables: serde_json::from_str(&vars_json).unwrap_or_default(),
                created_at: row.get(4)?, updated_at: row.get(5)?,
            })
        })?.collect::<Result<_, _>>()?;

        let mut stmt = conn.prepare(
            "SELECT id, team_id, method, url, status, duration_ms, response_size, timestamp, request_data, response_headers, response_body_preview FROM history WHERE team_id = ?1 AND timestamp > ?2"
        )?;
        let history: Vec<HistoryEntry> = stmt.query_map(rusqlite::params![team_id, since_str], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?, team_id: row.get(1)?, method: row.get(2)?,
                url: row.get(3)?, status: row.get(4)?, duration_ms: row.get(5)?,
                response_size: row.get(6)?, timestamp: row.get(7)?, request_data: row.get(8)?,
                response_headers: row.get(9)?, response_body_preview: row.get(10)?,
            })
        })?.collect::<Result<_, _>>()?;

        Ok((collections, requests, environments, history))
    }

    // Sync: get unsynced deletes
    pub fn get_unsynced_deletes(&self) -> Result<Vec<(String, String, String)>, rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, entity_type, entity_id FROM deleted_entities WHERE synced = 0")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })?;
        rows.collect()
    }

    // Sync: mark deletes as synced
    pub fn mark_deletes_synced(&self, ids: &[String]) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        for id in ids {
            conn.execute("UPDATE deleted_entities SET synced = 1 WHERE id = ?1", [id])?;
        }
        Ok(())
    }

    // Sync: upsert collection (for incoming remote changes)
    pub fn upsert_collection(&self, col: &Collection) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO collections (id, team_id, parent_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![col.id, col.team_id, col.parent_id, col.name, col.sort_order, col.created_at, col.updated_at],
        )?;
        Ok(())
    }

    // Sync: upsert request
    pub fn upsert_request(&self, req: &SavedRequest) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let headers_json = serde_json::to_string(&req.headers).unwrap();
        let params_json = serde_json::to_string(&req.params).unwrap();
        let body_json = serde_json::to_string(&req.body).unwrap();
        let auth_json = serde_json::to_string(&req.auth).unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO requests (id, collection_id, name, method, url, headers, params, body, auth, pre_script, post_script, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![req.id, req.collection_id, req.name, req.method, req.url, headers_json, params_json, body_json, auth_json, req.pre_script, req.post_script, req.sort_order, req.created_at, req.updated_at],
        )?;
        Ok(())
    }

    // Sync: upsert environment
    pub fn upsert_environment(&self, env: &Environment) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let vars_json = serde_json::to_string(&env.variables).unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO environments (id, team_id, name, variables, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![env.id, env.team_id, env.name, vars_json, env.created_at, env.updated_at],
        )?;
        Ok(())
    }

    // Sync: upsert history entry
    pub fn upsert_history(&self, entry: &HistoryEntry) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO history (id, team_id, method, url, status, duration_ms, response_size, timestamp, request_data, response_headers, response_body_preview) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![entry.id, entry.team_id, entry.method, entry.url, entry.status, entry.duration_ms, entry.response_size, entry.timestamp, entry.request_data, entry.response_headers, entry.response_body_preview],
        )?;
        Ok(())
    }

    // Sync: soft delete by client ID (for incoming remote deletes)
    pub fn soft_delete_by_id(&self, entity_type: &str, entity_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        match entity_type {
            "collection" => {
                conn.execute("DELETE FROM requests WHERE collection_id = ?1", [entity_id])?;
                conn.execute("DELETE FROM collections WHERE parent_id = ?1", [entity_id])?;
                conn.execute("DELETE FROM collections WHERE id = ?1", [entity_id])?;
            }
            "request" => {
                conn.execute("DELETE FROM requests WHERE id = ?1", [entity_id])?;
            }
            "environment" => {
                conn.execute("DELETE FROM environments WHERE id = ?1", [entity_id])?;
            }
            _ => {}
        }
        Ok(())
    }

    // Sync: record a deletion in the tombstone table
    pub fn record_deletion(&self, entity_type: &str, entity_id: &str) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let id = ulid::Ulid::new().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR IGNORE INTO deleted_entities (id, entity_type, entity_id, deleted_at, synced) VALUES (?1, ?2, ?3, ?4, 0)",
            rusqlite::params![id, entity_type, entity_id, now],
        )?;
        Ok(())
    }

    // Sync state
    pub fn get_sync_state(&self, team_id: &str) -> Result<(i64, i64), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        let result = conn.query_row(
            "SELECT last_pull_at, last_push_at FROM convex_sync_state WHERE team_id = ?1",
            [team_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match result {
            Ok(r) => Ok(r),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok((0, 0)),
            Err(e) => Err(e),
        }
    }

    pub fn set_sync_state(&self, team_id: &str, last_pull: i64, last_push: i64) -> Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO convex_sync_state (team_id, last_pull_at, last_push_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![team_id, last_pull, last_push],
        )?;
        Ok(())
    }

    // Get all data for migration (initial push to Convex)
    pub fn get_all_for_team(&self, team_id: &str) -> Result<(Vec<Collection>, Vec<SavedRequest>, Vec<Environment>, Vec<HistoryEntry>), rusqlite::Error> {
        self.get_modified_since(team_id, 0)
    }
}
