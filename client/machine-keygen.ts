import {
  keygenRound1,
  keygenRound2,
  keygenRound3,
  keygenRound4,
  keygenRound5,
  createKey,
} from "ecdsa-wasm";
import { State, StateMachine } from "./state-machine";
import {
  Parameters,
  PartySignup,
  KeygenResult,
  PartyKey,
  PeerState,
  RoundEntry,
  BroadcastAnswer,
  Handshake,
  getSortedPeerEntriesAnswer,
  makeOnTransition,
} from "./machine-common";

// Type to pass through the client state machine during key generation.
interface KeygenRoundEntry<T> {
  parameters: Parameters;
  partySignup: PartySignup;
  roundEntry: T;
}

export type KeygenTransition = BroadcastAnswer;
export type KeygenState =
  | Handshake
  | KeygenRoundEntry<RoundEntry>
  | KeygenResult;

export function makeKeygenStateMachine(
  peerState: PeerState,
  request: Function,
  postMessage: Function
) {
  return new StateMachine<KeygenState, KeygenTransition>(
    [
      // Handshake to get server parameters and client identifier
      {
        name: "HANDSHAKE",
        transition: async (
          previousState: KeygenState
        ): Promise<KeygenState | null> => {
          const res = await request({ kind: "parameters" });
          const parameters = {
            parties: res.data.parties,
            threshold: res.data.threshold,
          };
          peerState.parties = res.data.parties;
          const client = { conn_id: res.data.conn_id };
          return Promise.resolve({ parameters, client });
        },
      },
      // Generate the PartySignup and keygen round 1 entry
      {
        name: "KEYGEN_ROUND_1",
        transition: async (
          previousState: KeygenState
        ): Promise<KeygenState | null> => {
          const handshake = previousState as Handshake;
          const { parameters } = handshake;
          const signup = await request({ kind: "party_signup" });
          const { party_signup: partySignup } = signup.data;

          // So the UI thread can show the party number
          postMessage({ type: "party_signup", partySignup });

          // Create the round 1 key entry
          const roundEntry = keygenRound1(partySignup);

          // Send the round 1 entry to the server
          request({
            kind: "keygen_round1",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          const data = { parameters, partySignup, roundEntry };
          return Promise.resolve(data);
        },
      },
      // All parties committed to round 1 so generate the round 2 entry
      {
        name: "KEYGEN_ROUND_2",
        transition: async (
          previousState: KeygenState,
          transitionData: KeygenTransition
        ): Promise<KeygenState | null> => {
          const keygenRoundEntry =
            previousState as KeygenRoundEntry<RoundEntry>;
          const { parameters, partySignup } = keygenRoundEntry;
          const { answer } = transitionData as BroadcastAnswer;

          // Get round 2 entry using round 1 commitments
          const roundEntry = keygenRound2(
            partySignup,
            keygenRoundEntry.roundEntry,
            answer
          );

          // Send the round 2 entry to the server
          request({
            kind: "keygen_round2",
            data: {
              entry: roundEntry.entry,
              uuid: keygenRoundEntry.partySignup.uuid,
            },
          });

          const data = { parameters, partySignup, roundEntry };
          return Promise.resolve(data);
        },
      },
      // All parties committed to round 2 so generate the round 3 peer to peer calls
      {
        name: "KEYGEN_ROUND_3",
        transition: async (
          previousState: KeygenState,
          transitionData: KeygenTransition
        ): Promise<KeygenState | null> => {
          const keygenRoundEntry =
            previousState as KeygenRoundEntry<RoundEntry>;
          const { parameters, partySignup } = keygenRoundEntry;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = keygenRound3(
            parameters,
            partySignup,
            keygenRoundEntry.roundEntry,
            answer
          );

          // Send the round 3 entry to the server
          request({
            kind: "keygen_round3_relay_peers",
            data: { entries: roundEntry.peer_entries },
          });

          const data = { parameters, partySignup, roundEntry };
          return Promise.resolve(data);
        },
      },
      // Got all the round 3 peer to peer messages, proceed to round  4
      {
        name: "KEYGEN_ROUND_4",
        transition: async (
          previousState: KeygenState,
          transitionData: KeygenTransition
        ): Promise<KeygenState | null> => {
          const keygenRoundEntry =
            previousState as KeygenRoundEntry<RoundEntry>;
          const { parameters, partySignup } = keygenRoundEntry;

          const answer = getSortedPeerEntriesAnswer(peerState);
          // Clean up the peer entries
          peerState.received = [];

          const roundEntry = keygenRound4(
            parameters,
            partySignup,
            keygenRoundEntry.roundEntry,
            answer
          );

          // Send the round 4 entry to the server
          request({
            kind: "keygen_round4",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          const data = { parameters, partySignup, roundEntry };
          return Promise.resolve(data);
        },
      },
      // Got all the round 4 entries
      {
        name: "KEYGEN_ROUND_5",
        transition: async (
          previousState: KeygenState,
          transitionData: KeygenTransition
        ): Promise<KeygenState | null> => {
          const keygenRoundEntry =
            previousState as KeygenRoundEntry<RoundEntry>;
          const { parameters, partySignup } = keygenRoundEntry;
          const { answer } = transitionData as BroadcastAnswer;

          const roundEntry = keygenRound5(
            parameters,
            partySignup,
            keygenRoundEntry.roundEntry,
            answer
          );

          // Send the round 5 entry to the server
          request({
            kind: "keygen_round5",
            data: {
              entry: roundEntry.entry,
              uuid: partySignup.uuid,
            },
          });

          const data = { parameters, partySignup, roundEntry };
          return Promise.resolve(data);
        },
      },
      // Got all the round 5 entries, create the final key data
      {
        name: "KEYGEN_FINALIZE",
        transition: async (
          previousState: KeygenState,
          transitionData: KeygenTransition
        ): Promise<KeygenState | null> => {
          const keygenRoundEntry =
            previousState as KeygenRoundEntry<RoundEntry>;
          const { parameters, partySignup } = keygenRoundEntry;
          const { answer } = transitionData as BroadcastAnswer;

          const key: PartyKey = createKey(
            parameters,
            partySignup,
            keygenRoundEntry.roundEntry,
            answer
          );

          return Promise.resolve({ parameters, partySignup, key });
        },
      },
    ],
    makeOnTransition<KeygenState, KeygenTransition>(postMessage)
  );
}
