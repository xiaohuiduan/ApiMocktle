use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use futures_util::{StreamExt, SinkExt};
use tokio_tungstenite::tungstenite::Message;

type ClientMap = HashMap<String, Vec<tokio::sync::mpsc::UnboundedSender<Message>>>;

pub struct CollabServer {
    pub port: u16,
    rooms: Arc<Mutex<ClientMap>>,
}

impl CollabServer {
    pub fn new(port: u16) -> Self {
        CollabServer {
            port,
            rooms: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

pub async fn start(port: u16) -> Result<CollabServer, Box<dyn std::error::Error + Send + Sync>> {
    let server = CollabServer::new(port);
    let rooms = server.rooms.clone();

    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    log::info!("WebSocket server listening on ws://{}", addr);

    tokio::spawn(async move {
        while let Ok((stream, _)) = listener.accept().await {
            let rooms = rooms.clone();
            tokio::spawn(async move {
                if let Ok(ws_stream) = accept_async(stream).await {
                    let (mut sender, mut receiver) = ws_stream.split();

                    // Simple echo/broadcast for now
                    while let Some(Ok(msg)) = receiver.next().await {
                        if let Message::Text(text) = &msg {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(text) {
                                if let Some(doc_id) = parsed.get("docId").and_then(|v| v.as_str()) {
                                    let mut rooms = rooms.lock().unwrap();
                                    rooms.entry(doc_id.to_string()).or_default();
                                }
                            }
                        }

                        // Echo back
                        if sender.send(msg).await.is_err() {
                            break;
                        }
                    }
                }
            });
        }
    });

    Ok(server)
}
