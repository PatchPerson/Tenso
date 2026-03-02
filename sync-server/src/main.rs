mod config;
mod db;
mod auth;
mod api;
mod sync;

use axum::{Router, routing::{get, post}};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
pub struct AppState {
    pub db_pool: db::DbPool,
    pub jwt_secret: String,
    pub sync_manager: Arc<sync::SyncManager>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("reqlite_sync_server=debug,tower_http=debug")
        .init();

    let config = config::Config::from_env();
    let db_pool = db::init_pool(&config.database_path).expect("Failed to init database");
    db::migrations::run(&db_pool).expect("Failed to run migrations");

    let sync_manager = Arc::new(sync::SyncManager::new());

    let state = AppState {
        db_pool,
        jwt_secret: config.jwt_secret.clone(),
        sync_manager,
    };

    let app = Router::new()
        .route("/health", get(api::health))
        .route("/api/auth/register", post(api::register))
        .route("/api/auth/login", post(api::login))
        .route("/api/workspaces", get(api::list_workspaces).post(api::create_workspace))
        .route("/api/workspaces/{id}/snapshot", get(api::get_snapshot))
        .route("/ws", get(sync::ws_handler))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("Sync server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
