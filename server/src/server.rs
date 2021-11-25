use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

use anyhow::Result;
use futures_util::{SinkExt, StreamExt, TryFutureExt};
use log::{error, info, trace, warn};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, RwLock};
use tokio_stream::wrappers::UnboundedReceiverStream;
use uuid::Uuid;
use warp::ws::{Message, WebSocket};
use warp::Filter;

use super::state_machine::*;

use common::PartySignup;

/// Global unique user id counter.
static NEXT_USER_ID: AtomicUsize = AtomicUsize::new(1);

static PHASES: Lazy<Vec<Phase>> =
    Lazy::new(|| vec![Phase::Standby, Phase::Keygen, Phase::Signing]);

/// Parameters for key generation and signing.
#[derive(Debug, Serialize, Deserialize)]
pub struct Parameters {
    pub parties: u16,
    pub threshold: u16,
}

/// Request from a websocket client.
#[derive(Debug, Deserialize)]
struct Request {
    id: usize,
    kind: MessageKind,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
enum MessageKind {
    /// Get the parameters.
    #[serde(rename = "parameters")]
    Parameters,
    #[serde(rename = "keygen_signup")]
    KeygenSignup,
}

#[derive(Debug, Serialize)]
struct Response {
    id: usize,
    kind: MessageKind,
    data: ResponseData,
}

/// Request from a websocket client.
#[derive(Debug, Serialize)]
#[serde(untagged)]
enum ResponseData {
    /// Sent when a client connects so they know
    /// the number of paramters.
    Parameters {
        parties: u16,
        threshold: u16,
    },
    KeygenSignup {
        party_signup: PartySignup,
    },
}

#[derive(Debug)]
struct State<'a> {
    /// Initial parameters.
    params: Parameters,
    /// Connected clients.
    clients: HashMap<usize, mpsc::UnboundedSender<Message>>,
    /// Current state machine phase.
    phase: Phase,
    /// The state machine.
    machine: PhaseIterator<'a>,
    /// Current keygen signup state.
    keygen_signup: PartySignup,
}

pub struct Server;

impl Server {
    pub async fn start(
        path: &'static str,
        addr: impl Into<SocketAddr>,
        params: Parameters,
    ) -> Result<()> {
        let machine = PhaseIterator {
            phases: &PHASES,
            index: 0,
        };

        let state = Arc::new(RwLock::new(State {
            params,
            clients: HashMap::new(),
            phase: Default::default(),
            keygen_signup: PartySignup {
                number: 0,
                uuid: Uuid::new_v4().to_string(),
            },
            machine,
        }));
        let state = warp::any().map(move || state.clone());

        let routes = warp::path(path).and(warp::ws()).and(state).map(
            |ws: warp::ws::Ws, state| {
                ws.on_upgrade(move |socket| client_connected(socket, state))
            },
        );
        warp::serve(routes).run(addr).await;
        Ok(())
    }
}

async fn client_connected(ws: WebSocket, state: Arc<RwLock<State<'_>>>) {
    let conn_id = NEXT_USER_ID.fetch_add(1, Ordering::Relaxed);

    info!("connected (uid={})", conn_id);

    // Split the socket into a sender and receive of messages.
    let (mut user_ws_tx, mut user_ws_rx) = ws.split();

    // Use an unbounded channel to handle buffering and flushing of messages
    // to the websocket...
    let (tx, rx) = mpsc::unbounded_channel::<Message>();
    let mut rx = UnboundedReceiverStream::new(rx);

    tokio::task::spawn(async move {
        while let Some(message) = rx.next().await {
            user_ws_tx
                .send(message)
                .unwrap_or_else(|e| {
                    eprintln!("websocket send error: {}", e);
                })
                .await;
        }
    });

    // Save the sender in our list of connected clients.
    state.write().await.clients.insert(conn_id, tx);

    // Handle incoming requests from clients
    while let Some(result) = user_ws_rx.next().await {
        let msg = match result {
            Ok(msg) => msg,
            Err(e) => {
                error!("websocket rx error (uid={}): {}", conn_id, e);
                break;
            }
        };
        client_incoming_message(conn_id, msg, &state).await;
    }

    // user_ws_rx stream will keep processing as long as the user stays
    // connected. Once they disconnect, then...
    client_disconnected(conn_id, &state).await;
}

async fn client_incoming_message(
    conn_id: usize,
    msg: Message,
    state: &Arc<RwLock<State<'_>>>,
) {
    let msg = if let Ok(s) = msg.to_str() {
        s
    } else {
        return;
    };

    match serde_json::from_str::<Request>(msg) {
        Ok(req) => client_request(conn_id, req, state).await,
        Err(e) => warn!("websocket rx JSON error (uid={}): {}", conn_id, e),
    }
}

/// Process a request message from a client.
async fn client_request(
    conn_id: usize,
    req: Request,
    state: &Arc<RwLock<State<'_>>>,
) {
    let info = state.read().await;
    trace!("processing request {:#?}", req);
    let response: Option<Response> = match req.kind {
        // Handshake gets the parameters the server was started with
        MessageKind::Parameters => Some(Response {
            id: req.id,
            kind: req.kind,
            data: ResponseData::Parameters {
                parties: info.params.parties,
                threshold: info.params.threshold,
            },
        }),
        // Signup creates a PartySignup
        MessageKind::KeygenSignup => {
            let party_signup = {
                let client_signup = &info.keygen_signup;
                if client_signup.number < info.params.parties {
                    PartySignup {
                        number: client_signup.number + 1,
                        uuid: client_signup.uuid.clone(),
                    }
                } else {
                    PartySignup {
                        number: 1,
                        uuid: Uuid::new_v4().to_string(),
                    }
                }
            };

            drop(info);
            let mut writer = state.write().await;
            writer.keygen_signup = party_signup.clone();

            Some(Response {
                id: req.id,
                kind: req.kind,
                data: ResponseData::KeygenSignup { party_signup },
            })
        }
    };

    if let Some(res) = response {
        send_client_response(conn_id, res, state).await;
    }
}

/// Send a response to a single client.
async fn send_client_response(
    conn_id: usize,
    res: Response,
    state: &Arc<RwLock<State<'_>>>,
) {
    if let Some(tx) = state.read().await.clients.get(&conn_id) {
        let msg = serde_json::to_string(&res).unwrap();
        trace!("sending message {:#?}", msg);
        if let Err(_disconnected) = tx.send(Message::text(msg)) {
            // The tx is disconnected, our `client_disconnected` code
            // should be happening in another task, nothing more to
            // do here.
        }
    } else {
        warn!("could not find tx for (uid={})", conn_id);
    }
}

async fn client_disconnected(conn_id: usize, state: &Arc<RwLock<State<'_>>>) {
    info!("disconnected (uid={})", conn_id);
    // Stream closed up, so remove from the client list
    state.write().await.clients.remove(&conn_id);
}
