use axum::{extract::{State, WebSocketUpgrade, ws::{WebSocket, Message}}, response::Response};
use dashmap::DashMap;
use futures_util::{SinkExt, StreamExt};
use reqlite_shared::protocol::*;
use std::sync::Arc;
use tokio::sync::broadcast;
use crate::AppState;

pub struct SyncManager {
    pub channels: DashMap<String, broadcast::Sender<String>>,
}

impl SyncManager {
    pub fn new() -> Self {
        Self {
            channels: DashMap::new(),
        }
    }

    pub fn get_or_create_channel(&self, workspace_id: &str) -> broadcast::Sender<String> {
        self.channels
            .entry(workspace_id.to_string())
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(1024);
                tx
            })
            .clone()
    }

    pub fn broadcast(&self, workspace_id: &str, message: &str) {
        if let Some(tx) = self.channels.get(workspace_id) {
            let _ = tx.send(message.to_string());
        }
    }
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, state))
}

async fn handle_ws(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    let mut user_id = String::new();
    let mut workspace_id = String::new();
    let mut authenticated = false;

    // Process messages
    while let Some(Ok(msg)) = receiver.next().await {
        let Message::Text(text) = msg else { continue };

        let sync_msg: SyncMessage = match serde_json::from_str(&text) {
            Ok(m) => m,
            Err(e) => {
                let err = SyncMessage::Error { message: format!("Invalid message: {}", e) };
                let _ = sender.send(Message::Text(serde_json::to_string(&err).unwrap().into())).await;
                continue;
            }
        };

        match sync_msg {
            SyncMessage::Auth { token } => {
                match crate::auth::validate_token(&token, &state.jwt_secret) {
                    Ok(claims) => {
                        user_id = claims.sub;
                        authenticated = true;
                        let resp = SyncMessage::AuthOk { user_id: user_id.clone() };
                        let _ = sender.send(Message::Text(serde_json::to_string(&resp).unwrap().into())).await;
                    }
                    Err(e) => {
                        let resp = SyncMessage::AuthError { message: e };
                        let _ = sender.send(Message::Text(serde_json::to_string(&resp).unwrap().into())).await;
                        break;
                    }
                }
            }

            SyncMessage::Subscribe { workspace_id: ws_id, last_revision } => {
                if !authenticated {
                    let err = SyncMessage::Error { message: "Not authenticated".into() };
                    let _ = sender.send(Message::Text(serde_json::to_string(&err).unwrap().into())).await;
                    continue;
                }

                workspace_id = ws_id.clone();

                // Send delta since last revision
                match crate::db::get_operations_since(&state.db_pool, &ws_id, last_revision) {
                    Ok(ops) => {
                        if !ops.is_empty() {
                            let delta = SyncMessage::Delta { operations: ops };
                            let _ = sender.send(Message::Text(serde_json::to_string(&delta).unwrap().into())).await;
                        }
                    }
                    Err(e) => {
                        let err = SyncMessage::Error { message: e.to_string() };
                        let _ = sender.send(Message::Text(serde_json::to_string(&err).unwrap().into())).await;
                    }
                }

                // Subscribe to broadcast channel
                let tx = state.sync_manager.get_or_create_channel(&ws_id);
                let mut rx = tx.subscribe();

                // Spawn task to forward broadcasts to this client
                let mut sender_clone = sender.clone();
                let uid = user_id.clone();
                tokio::spawn(async move {
                    while let Ok(msg) = rx.recv().await {
                        // Don't echo back to sender (filter by checking if the op is from same user)
                        if let Ok(sync_msg) = serde_json::from_str::<SyncMessage>(&msg) {
                            if let SyncMessage::Op(ref op) = sync_msg {
                                if op.user_id == uid {
                                    continue;
                                }
                            }
                        }
                        if sender_clone.send(Message::Text(msg.into())).await.is_err() {
                            break;
                        }
                    }
                });
            }

            SyncMessage::Op(mut op) => {
                if !authenticated || workspace_id.is_empty() {
                    let err = SyncMessage::Error { message: "Not subscribed to workspace".into() };
                    let _ = sender.send(Message::Text(serde_json::to_string(&err).unwrap().into())).await;
                    continue;
                }

                op.user_id = user_id.clone();

                // Check for field-level conflicts
                let last_rev = crate::db::get_latest_revision(&state.db_pool, &workspace_id).unwrap_or(0);
                let conflicts = crate::db::check_field_conflict(
                    &state.db_pool, &workspace_id, &op.entity_id, &op.fields, last_rev.saturating_sub(10)
                ).unwrap_or_default();

                if !conflicts.is_empty() && op.op_type == OpType::Update {
                    // Field conflict detected
                    let conflict = SyncMessage::Conflict {
                        client_op_id: op.id.clone(),
                        conflicting_fields: conflicts,
                        latest: op.fields.clone(),
                    };
                    let _ = sender.send(Message::Text(serde_json::to_string(&conflict).unwrap().into())).await;
                    continue;
                }

                // Insert operation
                match crate::db::insert_operation(&state.db_pool, &op) {
                    Ok(revision) => {
                        // Send ack to sender
                        let ack = SyncMessage::Ack { client_op_id: op.id.clone(), revision };
                        let _ = sender.send(Message::Text(serde_json::to_string(&ack).unwrap().into())).await;

                        // Broadcast to other clients
                        op.revision = revision;
                        let broadcast_msg = SyncMessage::Op(op);
                        state.sync_manager.broadcast(&workspace_id, &serde_json::to_string(&broadcast_msg).unwrap());
                    }
                    Err(e) => {
                        let err = SyncMessage::Error { message: format!("Failed to store operation: {}", e) };
                        let _ = sender.send(Message::Text(serde_json::to_string(&err).unwrap().into())).await;
                    }
                }
            }

            _ => {
                let err = SyncMessage::Error { message: "Unexpected message type".into() };
                let _ = sender.send(Message::Text(serde_json::to_string(&err).unwrap().into())).await;
            }
        }
    }
}
