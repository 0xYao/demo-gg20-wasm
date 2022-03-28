import init, { initThreadPool, KeyGenerator, Signer, sha256 } from "ecdsa-wasm";
import * as Comlink from "comlink";

// Temporary hack for getRandomValues() error
const getRandomValues = crypto.getRandomValues;
crypto.getRandomValues = function <T extends ArrayBufferView | null>(
  array: T
): T {
  const buffer = new Uint8Array(array as unknown as Uint8Array);
  const value = getRandomValues.call(crypto, buffer);
  (array as unknown as Uint8Array).set(value);
  return array;
};

console.log("Worker is initializing...");
await init();
//await initThreadPool(navigator.hardwareConcurrency);
await initThreadPool(1);

Comlink.expose({
  KeyGenerator,
  Signer,
  sha256,
});
