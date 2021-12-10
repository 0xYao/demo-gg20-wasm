import init, {
  initThreadPool,
  generate_round1_entry,
  generate_round2_entry,
  generate_round3_entry,
  generate_round4_entry,
  generate_round5_entry,
  generate_key,
} from "ecdsa-wasm";

// Temporary hack for getRandomValues() error
const getRandomValues = crypto.getRandomValues;
crypto.getRandomValues = function (buffer) {
  const array = new Uint8Array(buffer);
  const value = getRandomValues.call(crypto, array);
  buffer.set(value);
  return buffer;
};

await init();
await initThreadPool(navigator.hardwareConcurrency);

// Websocket state
let messageId = 0;
let messageRequests = new Map();
const server = "ws://localhost:3030/demo";
const ws = new WebSocket(server);

let clientState = {
  parties: null,
  threshold: null,
  partySignup: null,
  round1Entry: null,
  round2Entry: null,
  round3PeerEntries: [],
  round4Entry: null,
  round5Entry: null,
  partyKey: null,
};

// Receive messages sent to the worker
onmessage = async (e) => {
  const { data } = e;
  if (data.type === "party_signup") {
    // Generate the party signup entry
    const signup = await request({ kind: "party_signup" });
    const { party_signup } = signup.data;

    clientState.partySignup = party_signup;

    postMessage({ type: "party_signup", ...clientState });

    // Create the round 1 key entry
    const round1_entry = generate_round1_entry(party_signup);

    const { entry } = round1_entry;
    clientState.round1Entry = round1_entry;
    // Send the round 1 entry to the server
    await request({
      kind: "set_round1_entry",
      data: {
        entry: clientState.round1Entry.entry,
        uuid: clientState.partySignup.uuid,
      },
    });
  }
};

// Handle messages from the server that were broadcast
// without a client request
const onBroadcastMessage = async (msg) => {
  switch (msg.kind) {
    case "commitment_answer":
      switch (msg.data.round) {
        // Got round 1 commitments of other parties
        case "round1":
          postMessage({ type: "round1_complete", ...clientState });

          // Get round 2 entry using round 1 commitments
          const round2_entry = generate_round2_entry(
            clientState.partySignup,
            clientState.round1Entry,
            msg.data.answer
          );
          clientState.round2Entry = round2_entry;

          // Send the round 2 entry to the server
          await request({
            kind: "set_round2_entry",
            data: {
              entry: clientState.round2Entry.entry,
              uuid: clientState.partySignup.uuid,
            },
          });
          break;
        case "round2":
          postMessage({ type: "round2_complete", ...clientState });

          const round3_entry = generate_round3_entry(
            clientState.parties,
            clientState.threshold,
            clientState.partySignup,
            clientState.round2Entry,
            msg.data.answer
          );
          clientState.round3Entry = round3_entry;

          // Send the round 3 entry to the server
          await request({
            kind: "relay_round3",
            data: { entries: clientState.round3Entry.peer_entries },
          });
          break;
        case "round4":
          postMessage({ type: "round4_complete", ...clientState });

          const round5_entry = generate_round5_entry(
            clientState.parties,
            clientState.threshold,
            clientState.partySignup,
            clientState.round4Entry,
            msg.data.answer
          );

          clientState.round5Entry = round5_entry;

          // Send the round 5 entry to the server
          await request({
            kind: "set_round5_entry",
            data: {
              entry: clientState.round5Entry.entry,
              uuid: clientState.partySignup.uuid,
            },
          });

          break;
        case "round5":
          postMessage({ type: "round5_complete", ...clientState });

          const party_key = generate_key(
            clientState.parties,
            clientState.threshold,
            clientState.partySignup,
            clientState.round5Entry,
            msg.data.answer
          );

          //console.log('keygen complete: ', party_key);

          clientState.partyKey = party_key;

          postMessage({ type: "keygen_complete", ...clientState });

          break;
      }
      return true;
    case "peer_answer":
      const { peer_entry } = msg.data;
      clientState.round3PeerEntries.push(peer_entry);

      // Got all the p2p answers
      if (clientState.round3PeerEntries.length === clientState.parties - 1) {
        postMessage({ type: "round3_complete", ...clientState });

        // Must sort the entries otherwise the decryption
        // keys will not match the peer entries
        clientState.round3PeerEntries.sort((a, b) => {
          if (a.party_from < b.party_from) return -1;
          if (a.party_from > b.party_from) return 1;
          return 0;
        });

        const round3_ans_vec = clientState.round3PeerEntries.map(
          (peer) => peer.entry
        );

        // Clean up the peer entries
        clientState.round3PeerEntries = null;

        const round4_entry = generate_round4_entry(
          clientState.parties,
          clientState.partySignup,
          clientState.round3Entry,
          round3_ans_vec
        );

        clientState.round4Entry = round4_entry;

        // Send the round 4 entry to the server
        await request({
          kind: "set_round4_entry",
          data: {
            entry: clientState.round4Entry.entry,
            uuid: clientState.partySignup.uuid,
          },
        });
      }

      return true;
  }
  return false;
};

// Websocket communication with the server
ws.onopen = async () => {
  postMessage({ type: "server", server });
  const res = await request({ kind: "parameters" });
  clientState = { ...clientState, ...res.data };
  postMessage({ type: "ready", ...clientState });
};

ws.onmessage = async (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && messageRequests.has(msg.id)) {
    const { resolve } = messageRequests.get(msg.id);
    resolve(msg);
    // Without an `id` we treat as a broadcast message that
    // was sent from the server without a request from the client
  } else {
    if (!(await onBroadcastMessage(msg))) {
      console.error(
        "websocket client received a message it could not handle: ",
        msg
      );
    }
  }
};

// Wrap a websocket request in a promise that expects
// a response from the server
function request(message) {
  const id = ++messageId;
  const resolve = (data) => data;
  const reject = (e) => {};
  const p = new Promise(function (resolve, reject) {
    messageRequests.set(id, { resolve, reject });
  });
  message.id = id;
  ws.send(JSON.stringify(message));
  return p;
}
