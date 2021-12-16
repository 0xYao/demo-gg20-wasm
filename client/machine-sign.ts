import {
  signRound0,
  signRound1,
  signRound2,
  signRound3,
  signRound4,
  signRound5,
  signRound6,
  signRound7,
  signRound8,
  signRound9,
  signMessage,
} from "ecdsa-wasm";
import { StateMachine } from "./state-machine";
import {
  KeygenResult,
  PartySignup,
  RoundEntry,
  BroadcastAnswer,
  PeerState,
  getSortedPeerEntriesAnswer,
  makeOnTransition,
} from "./machine-common";
import { BroadcastMessage } from "./websocket-client";

// Type used to start the signing process.
interface SignInit {
  message: string;
  keygenResult: KeygenResult;
}

// Type to pass through the client state machine during message signing.
interface SignRoundEntry<T> {
  message: string;
  partySignup: PartySignup;
  keygenResult: KeygenResult;
  roundEntry: T;
}

type SignState = SignRoundEntry<RoundEntry>;
type SignTransition = SignInit | BroadcastAnswer;

export function makeSignMessageStateMachine(
  peerState: PeerState,
  sendNetworkRequest: Function,
  sendUiMessage: Function,
  sendNetworkMessage: Function
) {
  // State machine for signing a proposal
  const machine = new StateMachine<SignState, SignTransition>(
    [
      // Start the signing process.
      {
        name: "SIGN_ROUND_0",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          // Generate a new party signup for the sign phase
          const signup = await sendNetworkRequest({ kind: "party_signup" });
          const { party_signup: partySignup } = signup.data;

          // So the UI thread can update the party number for the sign phase
          sendUiMessage({ type: "party_signup", partySignup });

          const { message, keygenResult } = transitionData as SignInit;
          const { key } = keygenResult;
          const roundEntry = signRound0(partySignup, key);

          // Send the round 0 entry to the server
          sendNetworkRequest({
            kind: "sign_round0",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_1",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const { message, partySignup, keygenResult } =
            previousState as SignRoundEntry<RoundEntry>;
          const { parameters, key } = keygenResult;
          const { answer } = transitionData as BroadcastAnswer;
          const roundEntry = signRound1(parameters, partySignup, key, answer);

          // Set up for the peer to peer calls in round 2
          peerState.parties = parameters.threshold + 1;
          peerState.received = [];

          // Send the round 1 entry to the server
          sendNetworkRequest({
            kind: "sign_round1",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_2",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { parameters, key } = keygenResult;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = signRound2(
            parameters,
            partySignup,
            key,
            signState.roundEntry,
            answer
          );

          // Send the round 2 entry to the server
          sendNetworkRequest({
            kind: "sign_round2_relay_peers",
            data: { entries: roundEntry.peer_entries },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_3",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { parameters, key } = keygenResult;

          const answer = getSortedPeerEntriesAnswer(peerState);
          // Clean up the peer entries
          peerState.received = [];

          const roundEntry = signRound3(
            parameters,
            partySignup,
            key,
            signState.roundEntry,
            answer
          );

          // Send the round 3 entry to the server
          sendNetworkRequest({
            kind: "sign_round3",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_4",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = signRound4(
            partySignup,
            signState.roundEntry,
            answer
          );

          // Send the round 4 entry to the server
          sendNetworkRequest({
            kind: "sign_round4",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_5",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { key } = keygenResult;
          const { answer } = transitionData as BroadcastAnswer;

          //const encoder = new TextEncoder();
          //const messageBytes = encoder.encode(message);
          //const messageHex = toHexString(messageBytes);

          const roundEntry = signRound5(
            partySignup,
            key,
            signState.roundEntry,
            answer,
            message
          );

          // Send the round 5 entry to the server
          sendNetworkRequest({
            kind: "sign_round5",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_6",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = signRound6(
            partySignup,
            signState.roundEntry,
            answer
          );

          // Send the round 6 entry to the server
          sendNetworkRequest({
            kind: "sign_round6",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_7",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { parameters } = keygenResult;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = signRound7(
            parameters,
            partySignup,
            signState.roundEntry,
            answer
          );

          // Send the round 7 entry to the server
          sendNetworkRequest({
            kind: "sign_round7",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_8",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = signRound8(
            partySignup,
            signState.roundEntry,
            answer
          );

          // Send the round 8 entry to the server
          sendNetworkRequest({
            kind: "sign_round8",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_ROUND_9",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { parameters } = keygenResult;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = signRound9(
            parameters,
            partySignup,
            signState.roundEntry,
            answer
          );

          // Send the round 9 entry to the server
          sendNetworkRequest({
            kind: "sign_round9",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          return {
            message,
            partySignup,
            keygenResult,
            roundEntry,
          };
        },
      },
      {
        name: "SIGN_FINALIZE",
        transition: async (
          previousState: SignState,
          transitionData: SignTransition
        ): Promise<SignState | null> => {
          const signState = previousState as SignRoundEntry<RoundEntry>;
          const { message, partySignup, keygenResult } = signState;
          const { parameters, key } = keygenResult;
          const { answer } = transitionData as BroadcastAnswer;

          const signResult = signMessage(
            partySignup,
            key,
            signState.roundEntry,
            answer
          );

          // Update the UI
          sendUiMessage({ type: "sign_result", signResult });

          // Notify non-participants of the signed message
          sendNetworkMessage({
            kind: "sign_result",
            data: { sign_result: signResult, uuid: partySignup.uuid },
          });

          return null;
        },
      },
    ],
    makeOnTransition<SignState, SignTransition>(sendUiMessage)
  );

  // Handle messages from the server that were broadcast
  // without a client request
  async function onBroadcastMessage(msg: BroadcastMessage) {
    switch (msg.kind) {
      case "sign_proposal":
        const { message } = msg.data;
        sendUiMessage({ type: "sign_proposal", message });
        return true;
      case "sign_progress":
        // Parties that did not commit to signing should update the UI only
        sendUiMessage({ type: "sign_progress" });

        // Parties not participating in the signing should reset their party number
        sendUiMessage({
          type: "party_signup",
          partySignup: { number: 0, uuid: "" },
        });
        return true;
      case "sign_commitment_answer":
        switch (msg.data.round) {
          case "round0":
            // We performed a sign of the message and also need to update the UI
            sendUiMessage({ type: "sign_progress" });
            await machine.next({ answer: msg.data.answer });
            break;
          case "round1":
            await machine.next({ answer: msg.data.answer });
            break;
          case "round3":
            await machine.next({ answer: msg.data.answer });
            break;
          case "round4":
            await machine.next({ answer: msg.data.answer });
            break;
          case "round5":
            await machine.next({ answer: msg.data.answer });
            break;
          case "round6":
            await machine.next({ answer: msg.data.answer });
            break;
          case "round7":
            await machine.next({ answer: msg.data.answer });
            break;
          case "round8":
            await machine.next({ answer: msg.data.answer });
            break;
          case "round9":
            await machine.next({ answer: msg.data.answer });
            break;
        }
        return true;
      case "sign_peer_answer":
        const { peer_entry: signPeerEntry } = msg.data;
        peerState.received.push(signPeerEntry);

        // Got all the p2p answers
        if (peerState.received.length === peerState.parties - 1) {
          await machine.next();
        }

        return true;
      case "sign_result":
        const { sign_result: signResult } = msg.data;
        // Update the UI
        sendUiMessage({ type: "sign_result", signResult });
        return true;
    }
    return false;
  }

  return { machine, onBroadcastMessage };
}
