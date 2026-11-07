import * as Crypto from "expo-crypto";

/**
 * Idempotency keys call `crypto.getRandomValues`. React Native does not provide
 * that until this polyfill runs, so app layouts import it before anything else.
 */
type RandomBytes = (byteLength: number) => Uint8Array;

const cryptoApi = Crypto as { getRandomBytes?: RandomBytes; polyfillWebCrypto?: () => void };

if (typeof cryptoApi.polyfillWebCrypto === "function") {
  cryptoApi.polyfillWebCrypto();
} else if (typeof globalThis.crypto?.getRandomValues !== "function" && cryptoApi.getRandomBytes) {
  const getRandomBytes = cryptoApi.getRandomBytes;
  const cryptoObject = globalThis.crypto ?? {};
  Object.defineProperty(globalThis, "crypto", { value: cryptoObject, configurable: true });
  cryptoObject.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
    const bytes = getRandomBytes(array.byteLength);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  };
}
