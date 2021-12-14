type BroadcastKind =
  | "keygen_commitment_answer"
  | "keygen_peer_answer"
  | "sign_proposal"
  | "sign_progress"
  | "sign_commitment_answer";

export interface BroadcastMessage {
  kind: BroadcastKind;
  data: any;
}

type RequestKind =
  | "parameters"
  | "party_signup"
  | "keygen_round1"
  | "keygen_round2"
  | "keygen_round3_relay_peers"
  | "keygen_round4"
  | "keygen_round5"
  | "sign_proposal"
  | "sign_round0"
  | "sign_round1";

export interface RequestMessage {
  id?: number;
  kind: RequestKind;
  data?: any;
}

export interface ResponseMessage {
  id?: number;
  data?: any;
}

export interface webSocketOptions {
  url: string;
  onOpen: (e: Event) => void;
  onClose: (e: CloseEvent) => void;
  onBroadcastMessage: (msg: BroadcastMessage) => Promise<boolean>;
}

export const makeWebSocketClient = (options: webSocketOptions) => {
  const { url, onOpen, onClose, onBroadcastMessage } = options;

  // Websocket state
  let messageId = 0;
  let messageRequests = new Map();
  const websocket = new WebSocket(url);

  websocket.onopen = (e) => onOpen(e);
  websocket.onclose = (e) => onClose(e);

  websocket.onmessage = async (e) => {
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

  // Send a message without any expectation of a reply.
  function send(message: RequestMessage): void {
    websocket.send(JSON.stringify(message));
  }

  // Wrap a websocket request in a promise that expects
  // a response from the server
  function request(message: RequestMessage): Promise<ResponseMessage> {
    const id = ++messageId;
    const resolve = (data: ResponseMessage) => data;
    const reject = (e: Error) => {
      throw e;
    };
    const p = new Promise((resolve, reject) => {
      messageRequests.set(id, { resolve, reject });
    });
    message.id = id;
    send(message);
    return p;
  }

  return {
    websocket,
    request,
    send,
  };
};
