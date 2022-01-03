import { StateMachine, TransitionHandler } from "./machine";
import {
  Parameters,
  PartySignup,
  PartySignupInfo,
  PartyKey,
  RoundEntry,
} from "../machine-common";
import { makePeerState, PeerEntryHandler, PeerEntry } from "./peer-state";
import { WebSocketClient } from "../websocket";

// Type to pass through the client state machine during key generation.
interface KeygenRoundEntry {
  parameters: Parameters;
  partySignup: PartySignup;
  roundEntry: RoundEntry;
  //answer: string[];
}

export type KeygenTransition = string[];
export type KeygenState = KeygenRoundEntry;

export interface KeygenInfo {
  groupId: string;
  sessionId: string;
  parameters: Parameters;
  partySignup: PartySignup;
}

export function generateKeyShare(
  websocket: WebSocketClient,
  worker: any,
  onTransition: TransitionHandler<KeygenState, KeygenTransition>,
  info: KeygenInfo
): Promise<PartyKey> {
  const peerEntryHandler = makePeerState(info.parameters.parties - 1);

  function relayPeers(peerEntries: PeerEntry[]) {
    websocket.notify({
      method: "peer_relay",
      params: [info.groupId, info.sessionId, peerEntries],
    });
  }

  /*
  function relayPeers(peerEntries: PeerEntry[]): Promise<string[]> {
    return new Promise((resolve) => {
      function onPeerEntry(peerEntry: PeerEntry) {
        console.log("got peer entry", peerEntry);
        const answer = peerEntryHandler(peerEntry);
        // Got all the p2p answers
        if (answer) {
          console.log("Got all p2p answers", answer);
          websocket.off("peer_relay", onPeerEntry);
          resolve(answer);
        }
      }

      console.log("adding listener onPeerEntry");
      websocket.on("peer_relay", onPeerEntry);
      //debugger;

      websocket.notify({
        method: "peer_relay",
        params: [info.groupId, info.sessionId, peerEntries],
      });
    });
  }
  */

  return new Promise(async (resolve, reject) => {
    const machine = new StateMachine<KeygenState, KeygenTransition>(
      [
        {
          name: "KEYGEN_ROUND_1",
          transition: async (
            previousState: KeygenState,
            transitionData: KeygenTransition
          ): Promise<KeygenState | null> => {
            const { parameters, partySignup } = info;

            // Create the round 1 key entry
            const roundEntry = await worker.keygenRound1(
              parameters,
              partySignup
            );

            relayPeers(roundEntry.peer_entries);
            console.log("After round 1 calling relayPeers");
            return { parameters, partySignup, roundEntry };
          },
        },
        {
          name: "KEYGEN_ROUND_2",
          transition: async (
            previousState: KeygenState,
            transitionData: KeygenTransition
          ): Promise<KeygenState | null> => {
            const keygenRoundEntry = previousState as KeygenRoundEntry;
            const answer = transitionData as string[];
            const { parameters, partySignup } = keygenRoundEntry;

            console.log("round 2 answer", answer);

            // Get round 2 entry using round 1 commitments
            const roundEntry = await worker.keygenRound2(
              parameters,
              partySignup,
              keygenRoundEntry.roundEntry,
              answer
            );

            //relayPeerNotify(roundEntry.peer_entries);

            return { parameters, partySignup, roundEntry };
          },
        },
        /*
        {
          name: "KEYGEN_ROUND_3",
          transition: async (
            previousState: KeygenState,
            transitionData: KeygenTransition
          ): Promise<KeygenState | null> => {
            const keygenRoundEntry = previousState as KeygenRoundEntry;
            const { parameters, partySignup } = keygenRoundEntry;
            const answer = transitionData as string[];

            const roundEntry = await worker.keygenRound3(
              parameters,
              partySignup,
              keygenRoundEntry.roundEntry,
              answer
            );

            relayPeers(roundEntry.peer_entries);
            return { parameters, partySignup, roundEntry };
          },
        },
        {
          name: "KEYGEN_ROUND_4",
          transition: async (
            previousState: KeygenState,
            transitionData: KeygenTransition
          ): Promise<KeygenState | null> => {
            const keygenRoundEntry = previousState as KeygenRoundEntry;
            const { parameters, partySignup } = keygenRoundEntry;
            const answer = transitionData as string[];

            const roundEntry = await worker.keygenRound4(
              parameters,
              partySignup,
              keygenRoundEntry.roundEntry,
              answer
            );

            relayPeers(roundEntry.peer_entries);
            return { parameters, partySignup, roundEntry };
          },
        },
        {
          name: "KEYGEN_ROUND_5",
          transition: async (
            previousState: KeygenState,
            transitionData: KeygenTransition
          ): Promise<KeygenState | null> => {
            const keygenRoundEntry = previousState as KeygenRoundEntry;
            const { parameters, partySignup } = keygenRoundEntry;
            const answer = transitionData as string[];

            const roundEntry = await worker.keygenRound5(
              parameters,
              partySignup,
              keygenRoundEntry.roundEntry,
              answer
            );

            relayPeers(roundEntry.peer_entries);
            return { parameters, partySignup, roundEntry };
          },
        },
        {
          name: "KEYGEN_FINALIZE",
          transition: async (
            previousState: KeygenState,
            transitionData: KeygenTransition
          ): Promise<KeygenState | null> => {
            const keygenRoundEntry = previousState as KeygenRoundEntry;
            const { parameters, partySignup } = keygenRoundEntry;
            const answer = transitionData as string[];

            const key: PartyKey = await worker.createKey(
              parameters,
              partySignup,
              keygenRoundEntry.roundEntry,
              answer
            );

            websocket.removeAllListeners("peer_relay");
            resolve(key);

            return null;
          },
        },
        */
      ],
      { onTransition }
    );

    websocket.on("peer_relay", async (peerEntry: PeerEntry) => {
      const answer = peerEntryHandler(peerEntry);
      // Got all the p2p answers
      if (answer) {
        console.log("got all p2p answers", machine.index);
        //console.log("Got all p2p answers", answer);
        await machine.next(answer);
      }
    });

    // Start the state machine running
    await machine.next();
  });
}
