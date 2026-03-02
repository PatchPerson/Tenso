pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_path: String,
    pub jwt_secret: String,
    pub team_key: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".into()),
            port: std::env::var("PORT").unwrap_or_else(|_| "3000".into()).parse().unwrap_or(3000),
            database_path: std::env::var("DATABASE_PATH").unwrap_or_else(|_| "reqlite-sync.db".into()),
            jwt_secret: std::env::var("JWT_SECRET").unwrap_or_else(|_| "reqlite-dev-secret-change-me".into()),
            team_key: std::env::var("TEAM_KEY").ok(),
        }
    }
}
