use crate::db::DbPool;

pub fn run(pool: &DbPool) -> Result<(), Box<dyn std::error::Error>> {
    let conn = pool.get()?;
    conn.execute_batch("
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspace_members (
            workspace_id TEXT NOT NULL REFERENCES workspaces(id),
            user_id TEXT NOT NULL REFERENCES users(id),
            role TEXT NOT NULL DEFAULT 'member',
            PRIMARY KEY (workspace_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS operations (
            revision INTEGER PRIMARY KEY AUTOINCREMENT,
            id TEXT NOT NULL UNIQUE,
            workspace_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            op_type TEXT NOT NULL,
            fields TEXT NOT NULL DEFAULT '{}',
            user_id TEXT NOT NULL,
            timestamp TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_operations_workspace ON operations(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_operations_entity ON operations(entity_id);
        CREATE INDEX IF NOT EXISTS idx_operations_ws_rev ON operations(workspace_id, revision);

        CREATE TABLE IF NOT EXISTS snapshots (
            workspace_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            data TEXT NOT NULL,
            revision INTEGER NOT NULL,
            PRIMARY KEY (workspace_id, entity_id)
        );
    ")?;
    Ok(())
}
