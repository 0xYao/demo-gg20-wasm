use multi_party_ecdsa::protocols::multi_party_ecdsa::gg_2020::state_machine::keygen::{Keygen, ProtocolMessage};

use wasm_bindgen::prelude::*;

use common::{Parameters, PartySignup};
use serde::Serialize;

use crate::utils::KeyShare;
use round_based::{Msg, StateMachine};

use once_cell::sync::Lazy;
use std::sync::{Arc, Mutex};

use crate::{console_log, log};

static KEYGEN: Lazy<Arc<Mutex<Option<Keygen>>>> =
    Lazy::new(|| Arc::new(Mutex::new(None)));

/// Wrapper for a round `Msg` that includes the round
/// number so that we can ensure round messages are grouped
/// together and out of order messages can thus be handled correctly.
#[derive(Serialize)]
struct RoundMsg {
    round: u16,
    sender: u16,
    receiver: Option<u16>,
    body: ProtocolMessage,
}

impl RoundMsg {
    fn from_round(
        round: u16,
        messages: Vec<Msg<<Keygen as StateMachine>::MessageBody>>,
    ) -> Vec<Self> {
        messages
            .into_iter()
            .map(|m| RoundMsg {
                round,
                sender: m.sender,
                receiver: m.receiver,
                body: m.body,
            })
            .collect::<Vec<_>>()
    }
}

#[wasm_bindgen(js_name = "keygenInit")]
pub fn keygen_init(parameters: JsValue, party_signup: JsValue) {
    let params: Parameters = parameters.into_serde().unwrap();
    let PartySignup { number, uuid } =
        party_signup.into_serde::<PartySignup>().unwrap();
    let (party_num_int, _uuid) = (number, uuid);
    let mut writer = KEYGEN.lock().unwrap();
    *writer = Some(
        Keygen::new(party_num_int, params.threshold, params.parties).unwrap(),
    );
}

#[wasm_bindgen(js_name = "keygenHandleIncoming")]
pub fn keygen_handle_incoming(message: JsValue) {
    let message: Msg<<Keygen as StateMachine>::MessageBody> =
        message.into_serde().unwrap();
    let mut writer = KEYGEN.lock().unwrap();
    let state = writer.as_mut().unwrap();
    state.handle_incoming(message).unwrap();
}

#[wasm_bindgen(js_name = "keygenProceed")]
pub fn keygen_proceed() -> JsValue {
    let mut writer = KEYGEN.lock().unwrap();
    let state = writer.as_mut().unwrap();
    let round = state.current_round();

    console_log!("Round proceed {}", round);

    state.proceed().unwrap();
    let messages =
        RoundMsg::from_round(round, state.message_queue().drain(..).collect());

    JsValue::from_serde(&messages).unwrap()
}

#[wasm_bindgen(js_name = "keygenCreate")]
pub fn keygen_create() -> JsValue {
    let mut writer = KEYGEN.lock().unwrap();
    let state = writer.as_mut().unwrap();
    let local_key = state.pick_output().unwrap().unwrap();
    let public_key = local_key.public_key().to_bytes(false).to_vec();
    let key_share = KeyShare {
        local_key,
        address: crate::utils::address(&public_key),
        public_key,
    };
    *writer = None;
    JsValue::from_serde(&key_share).unwrap()
}
