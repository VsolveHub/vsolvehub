import * as Crypto from "expo-crypto";

/**
 * Browser (Expo web) uploads. A picked file is a `blob:` URL here, which the browser's own
 * `fetch` reads correctly; the phone build uses `expo-file-system` instead (see `upload.ts`).
 */

export interface LocalFileFacts {
  sizeBytes: number;
  sha256: string;
}

export class LocalFileUnreadableError extends Error {
  constructor() {
    super("We could not read that file. Choose it again.");
    this.name = "LocalFileUnreadableError";
  }
}

/** Read the picked file, refusing an error response rather than treating it as the file. */
async function readPicked(uri: string): Promise<Response> {
  const response = await fetch(uri);
  if (!response.ok) throw new LocalFileUnreadableError();
  return response;
}

export async function describeLocalFile(uri: string): Promise<LocalFileFacts> {
  const bytes = new Uint8Array(await (await readPicked(uri)).arrayBuffer());
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return { sizeBytes: bytes.byteLength, sha256 };
}

export interface SignedUpload {
  uri: string;
  contentType: string;
  url: string;
  onProgress?: (fraction: number) => void;
}

/** PUT the file bytes to a signed URL and report progress the way the web upload does. */
export function uploadToSignedUrl(upload: SignedUpload): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.url);
    xhr.setRequestHeader("Content-Type", upload.contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && upload.onProgress) {
        upload.onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new Error("Upload failed before a response arrived."));
    void readPicked(upload.uri)
      .then((response) => response.blob())
      .then((blob) => xhr.send(blob))
      .catch(reject);
  });
}
