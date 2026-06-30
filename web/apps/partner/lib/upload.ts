import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Persists an uploaded file to /public/uploads and returns its public URL.
 * Returns null when no file was provided. Local-dev storage — swap for S3 in prod.
 */
export async function saveUpload(file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  await mkdir(UPLOAD_DIR, { recursive: true });
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filename = `${randomUUID()}_${safe}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return `/uploads/${filename}`;
}
