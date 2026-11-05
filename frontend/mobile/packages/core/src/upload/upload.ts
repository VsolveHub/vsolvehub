import { File, UploadType } from "expo-file-system";
import { apiBaseUrl } from "../config";

/**
 * Phone uploads read the picked file straight from disk with `expo-file-system`.
 *
 * Never `fetch(uri)` a local file here. Expo's Android `fetch` takes the path out of a `file://`
 * URL without decoding it, and Expo Go keeps picked files under a percent-encoded folder
 * (`…/%2540anonymous%252F…/ImagePicker/…`). The lookup misses and the response is a 404 whose
 * body is the 14 bytes `File not found`. Those bytes were then hashed and uploaded in place of
 * the photo, and Django refused every document as `partner_document_upload_invalid`.
 */

/** What Django is told about a file before it is sent: both measured from the bytes on disk. */
export interface LocalFileFacts {
  sizeBytes: number;
  sha256: string;
}

export class LocalFileUnreadableError extends Error {
  constructor() {
    super("We could not read that file from your phone. Choose it again.");
    this.name = "LocalFileUnreadableError";
  }
}

function openPicked(uri: string): File {
  const file = new File(uri);
  if (!file.exists) throw new LocalFileUnreadableError();
  return file;
}

/** Size and lowercase-hex SHA-256 of a picked file, read from disk by the native module. */
export async function describeLocalFile(uri: string): Promise<LocalFileFacts> {
  const file = openPicked(uri);
  return { sizeBytes: file.size, sha256: await file.digest("SHA-256") };
}

export interface SignedUpload {
  uri: string;
  contentType: string;
  url: string;
  onProgress?: (fraction: number) => void;
}

function resolveTargetUrl(rawUrl: string): string {
  if (rawUrl.includes("localhost") || rawUrl.includes("127.0.0.1")) {
    const base = apiBaseUrl();
    const match = base.match(/^https?:\/\/([^:/]+)(:\d+)?/);
    if (match) {
      const devHost = match[1];
      return rawUrl.replace(/localhost|127\.0\.0\.1/, devHost);
    }
  }
  return rawUrl;
}

/** PUT the file's bytes to a signed URL natively, reporting progress. Resolves on a 2xx only. */
export async function uploadToSignedUrl(upload: SignedUpload): Promise<void> {
  const file = openPicked(upload.uri);
  const targetUrl = resolveTargetUrl(upload.url);
  const result = await file.upload(targetUrl, {
    httpMethod: "PUT",
    uploadType: UploadType.BINARY_CONTENT,
    headers: { "Content-Type": upload.contentType },
    onProgress: ({ bytesSent, totalBytes }) => {
      if (totalBytes > 0) upload.onProgress?.(bytesSent / totalBytes);
    },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed with status ${result.status}.`);
  }
}
