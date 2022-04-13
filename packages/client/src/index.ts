import { KeyGenerator, Signer } from '@metamask/mpc-ecdsa-wasm';

export { KeyGenerator, Signer } from '@metamask/mpc-ecdsa-wasm';

export * from './keygen';
export * from './sign';
export * from './transports/websocket';
export * from './clients/websocket';
export { StreamTransport, SinkTransport } from './round-based';

export enum SessionKind {
  KEYGEN = 'keygen',
  SIGN = 'sign',
}

export type EcdsaWorker = {
  KeyGenerator(
    parameters: Parameters,
    partySignup: PartySignup,
  ): Promise<KeyGenerator>;

  Signer(
    index: number,
    participants: number[],
    localKey: LocalKey,
  ): Promise<Signer>;

  sha256(value: string): Promise<string>;
};

export type GroupInfo = {
  uuid: string;
  label: string;
  params: Parameters;
};

// Message is sent by a client.
//
// When receiver is null then the message is a broadcast round
// otherwise communication should be handled peer to peer.
export type Message = {
  round: number;
  sender: number;
  uuid: string;
  receiver?: number;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  body: any;
};

// Configuration parameters retrieved from the server
// during the handshake.
export type Parameters = {
  parties: number;
  threshold: number;
};

// Private key share for GG2020.
export type KeyShare = {
  localKey: LocalKey;
  publicKey: number[];
  address: string;
};

// Opaque type for the private key share.
export type LocalKey = {
  // Index of the key share.
  i: number;
  // Threshold for key share signing.
  t: number;
  // Total number of parties.
  n: number;
};

// Generated by the server to signal this party wants
// to be included in key generation.
//
// The uuid is injected from the session that owns
// this party signup.
export type PartySignup = {
  number: number;
  uuid: string;
};

export type Session = {
  uuid: string;
  partySignup?: PartySignup;
};

// State for party signup round during keygen.
export type PartySignupInfo = {
  parameters: Parameters;
  partySignup: PartySignup;
};

export type SessionInfo = {
  groupId: string;
  sessionId: string;
  parameters: Parameters;
  partySignup: PartySignup;
};

// Result of signing a message.
export type SignResult = {
  r: string;
  s: string;
  recid: number;
};

// A signed message with public key and address pre-computed.
export type SignMessage = {
  signature: SignResult;
  public_key: number[];
  address: string;
};
