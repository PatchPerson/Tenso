use rusqlite::Connection;

pub fn run(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    // Disable foreign keys during migration to allow schema changes
    conn.execute_batch("PRAGMA foreign_keys=OFF;")?;

    // Migrate from old workspace schema if it exists
    migrate_workspace_to_team(conn)?;

    // Re-enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            convex_team_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id),
            parent_id TEXT REFERENCES collections(id),
            name TEXT NOT NULL,
            sort_order REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_collections_team ON collections(team_id);
        CREATE INDEX IF NOT EXISTS idx_collections_parent ON collections(parent_id);

        CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY,
            collection_id TEXT NOT NULL REFERENCES collections(id),
            name TEXT NOT NULL,
            method TEXT NOT NULL DEFAULT 'GET',
            url TEXT NOT NULL DEFAULT '',
            headers TEXT NOT NULL DEFAULT '[]',
            params TEXT NOT NULL DEFAULT '[]',
            body TEXT NOT NULL DEFAULT '{\"type\":\"none\"}',
            auth TEXT NOT NULL DEFAULT '{\"type\":\"none\"}',
            pre_script TEXT NOT NULL DEFAULT '',
            post_script TEXT NOT NULL DEFAULT '',
            sort_order REAL NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_requests_collection ON requests(collection_id);

        CREATE TABLE IF NOT EXISTS environments (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id),
            name TEXT NOT NULL,
            variables TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_environments_team ON environments(team_id);

        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL,
            method TEXT NOT NULL,
            url TEXT NOT NULL,
            status INTEGER NOT NULL,
            duration_ms INTEGER NOT NULL,
            response_size INTEGER NOT NULL,
            timestamp TEXT NOT NULL,
            request_data TEXT NOT NULL DEFAULT '{}',
            response_headers TEXT NOT NULL DEFAULT '{}',
            response_body_preview TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_history_team ON history(team_id);
        CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history(timestamp);

        CREATE TABLE IF NOT EXISTS websocket_connections (
            id TEXT PRIMARY KEY,
            team_id TEXT NOT NULL REFERENCES teams(id),
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            headers TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            op_type TEXT NOT NULL,
            fields TEXT NOT NULL DEFAULT '{}',
            revision INTEGER NOT NULL,
            user_id TEXT NOT NULL DEFAULT 'local',
            timestamp TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sync_cursors (
            team_id TEXT PRIMARY KEY,
            last_revision INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS deleted_entities (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            deleted_at TEXT NOT NULL,
            synced INTEGER DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_deleted_entities_synced ON deleted_entities(synced);

        CREATE TABLE IF NOT EXISTS convex_sync_state (
            team_id TEXT PRIMARY KEY,
            last_pull_at INTEGER DEFAULT 0,
            last_push_at INTEGER DEFAULT 0
        );
    ")?;
    Ok(())
}

/// Migrate old workspace-based schema to team-based schema.
fn migrate_workspace_to_team(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    // Check if old 'workspaces' table exists
    let has_workspaces: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='workspaces'",
        [],
        |row| row.get(0),
    )?;

    if !has_workspaces {
        return Ok(());
    }

    // Check if 'teams' table already exists
    let has_teams: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='teams'",
        [],
        |row| row.get(0),
    )?;

    if has_teams {
        conn.execute("DROP TABLE IF EXISTS workspaces", [])?;
        return Ok(());
    }

    // Rename workspaces -> teams
    conn.execute("ALTER TABLE workspaces RENAME TO teams", [])?;

    // Add convex_team_id column
    let _ = conn.execute("ALTER TABLE teams ADD COLUMN convex_team_id TEXT", []);

    // Rename workspace_id -> team_id in each table individually
    // Check if each table has workspace_id column before renaming
    let tables_to_rename = ["collections", "environments", "history", "websocket_connections"];
    for table in &tables_to_rename {
        let has_col: bool = conn.query_row(
            &format!(
                "SELECT COUNT(*) > 0 FROM pragma_table_info('{}') WHERE name='workspace_id'",
                table
            ),
            [],
            |row| row.get(0),
        )?;
        if has_col {
            conn.execute(
                &format!("ALTER TABLE {} RENAME COLUMN workspace_id TO team_id", table),
                [],
            )?;
        }
    }

    // Drop old indexes
    conn.execute("DROP INDEX IF EXISTS idx_collections_workspace", [])?;
    conn.execute("DROP INDEX IF EXISTS idx_environments_workspace", [])?;
    conn.execute("DROP INDEX IF EXISTS idx_history_workspace", [])?;

    // Rename in sync_log and sync_cursors if they have workspace_id
    for table in &["sync_log", "sync_cursors"] {
        let has_table: bool = conn.query_row(
            &format!(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='{}'",
                table
            ),
            [],
            |row| row.get(0),
        )?;
        if has_table {
            let has_col: bool = conn.query_row(
                &format!(
                    "SELECT COUNT(*) > 0 FROM pragma_table_info('{}') WHERE name='workspace_id'",
                    table
                ),
                [],
                |row| row.get(0),
            )?;
            if has_col {
                let _ = conn.execute(
                    &format!("ALTER TABLE {} RENAME COLUMN workspace_id TO team_id", table),
                    [],
                );
            }
        }
    }

    Ok(())
}
