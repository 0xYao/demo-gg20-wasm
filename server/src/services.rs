use serde::{Deserialize, Serialize};

use async_trait::async_trait;
use json_rpc2::{futures::*, Request, Response, Result};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;

use common::Parameters;

use super::server::{Group, Phase, Session, State};

use log::warn;

const GROUP_CREATE: &str = "group_create";
const GROUP_JOIN: &str = "group_join";
const SESSION_CREATE: &str = "session_create";
const SESSION_JOIN: &str = "session_join";

type Uuid = String;

#[derive(Debug, Deserialize)]
struct GroupCreateParams {
    label: String,
    params: Parameters,
}

type SessionCreateParams = (Uuid, Phase);

type SessionJoinParams = (Uuid, Uuid, Phase);

pub(crate) struct ServiceHandler;

#[async_trait]
impl Service for ServiceHandler {
    type Data = (usize, Arc<RwLock<State>>);
    async fn handle(
        &self,
        req: &mut Request,
        ctx: &Self::Data,
    ) -> Result<Option<Response>> {
        let response = if req.matches(GROUP_CREATE) {
            let (conn_id, state) = ctx;
            let params: Vec<GroupCreateParams> = req.deserialize()?;
            let info = params.get(0).unwrap();

            let group =
                Group::new(*conn_id, info.params.clone(), info.label.clone());
            let res = serde_json::to_value(&group.uuid).unwrap();
            let group_key = group.uuid.clone();
            let mut writer = state.write().await;
            writer.groups.insert(group_key, group);

            Some((req, res).into())
        } else if (req.matches(GROUP_JOIN)) {
            let (conn_id, state) = ctx;

            let params: Vec<String> = req.deserialize()?;
            let uuid = params.get(0).unwrap();

            let mut writer = state.write().await;
            if let Some(group) = writer.groups.get_mut(uuid) {
                if let None = group.clients.iter().find(|c| *c == conn_id) {
                    group.clients.push(*conn_id);
                }

                let res = serde_json::to_value(group).unwrap();
                Some((req, res).into())
            } else {
                warn!("group does not exist: {}", uuid);
                // TODO: send error response
                None
            }
        } else if (req.matches(SESSION_CREATE)) {
            let (conn_id, state) = ctx;
            let params: SessionCreateParams = req.deserialize()?;
            let (group_id, phase) = params;

            let mut writer = state.write().await;
            if let Some(group) = writer.groups.get_mut(&group_id) {
                // Verify connection is part of the group clients
                if let Some(_) = group.clients.iter().find(|c| *c == conn_id) {
                    let session = Session::from(phase.clone());
                    let key = session.uuid.clone();
                    group.sessions.insert(key, session.clone());

                    let res = serde_json::to_value(&session).unwrap();
                    Some((req, res).into())

                    // FIXME: restore session create notification
                    /*
                    let notification = Outgoing {
                        id: None,
                        kind: Some(OutgoingKind::SessionCreate),
                        data: Some(OutgoingData::SessionCreate {
                            session: session.clone(),
                        }),
                    };

                    broadcast_message(
                        &notification,
                        state,
                        Some(vec![conn_id]),
                    )
                    .await;
                    */
                } else {
                    warn!("connection for session create does not belong to the group");
                    None
                }
            } else {
                warn!("group does not exist: {}", group_id);
                // TODO: send error response
                None
            }
        } else if (req.matches(SESSION_JOIN)) {
            let (conn_id, state) = ctx;
            let params: SessionJoinParams = req.deserialize()?;
            let (group_id, session_id, _phase) = params;

            let mut writer = state.write().await;
            if let Some(group) = writer.groups.get_mut(&group_id) {
                // Verify connection is part of the group clients
                if let Some(_) = group.clients.iter().find(|c| *c == conn_id) {
                    if let Some(session) = group.sessions.get_mut(&session_id) {
                        let res = serde_json::to_value(&session).unwrap();
                        Some((req, res).into())
                    } else {
                        warn!("session does not exist: {}", session_id);
                        // TODO: send error response
                        None
                    }
                } else {
                    warn!("connection for session join does not belong to the group");
                    None
                }
            } else {
                warn!("group does not exist: {}", group_id);
                // TODO: send error response
                None
            }
        } else {
            None
        };
        Ok(response)
    }
}
