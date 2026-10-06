import * as Crypto from "expo-crypto";

export async function sha256OfFile(uri: string): Promise<string> {
  const response = await fetch(uri);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    void fetch(upload.uri)
      .then((response) => response.blob())
      .then((blob) => xhr.send(blob))
      .catch(reject);
  });
}
