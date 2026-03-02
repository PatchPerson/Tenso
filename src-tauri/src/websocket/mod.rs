use crate::state::{AppState, WsConnection};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio_tungstenite::connect_async;
use tauri::Emitter;

pub async fn connect(
    state: &AppState,
    app_handle: &tauri::AppHandle,
    id: &str,
    url: &str,
    _headers: &[tenso_shared::models::KeyValue],
) -> Result<(), String> {
    let (ws_stream, _) = connect_async(url).await.map_err(|e| e.to_string())?;
    let (mut write, mut read) = ws_stream.split();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let ws_conn = Arc::new(WsConnection { tx });
    state.ws_connections.insert(id.to_string(), ws_conn);

    let handle = app_handle.clone();
    let _conn_id = id.to_string();

    // Send messages from channel to WebSocket
    tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if write.send(tokio_tungstenite::tungstenite::Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Read messages from WebSocket and emit to frontend
    let conn_id2 = id.to_string();
    tokio::spawn(async move {
        while let Some(Ok(msg)) = read.next().await {
            if let tokio_tungstenite::tungstenite::Message::Text(text) = msg {
                let _ = handle.emit(&format!("ws-message-{}", conn_id2), text.to_string());
            }
        }
        let _ = handle.emit(&format!("ws-closed-{}", conn_id2), ());
    });

    Ok(())
}
