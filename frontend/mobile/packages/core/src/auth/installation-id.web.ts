import { kvGet, kvSet } from "../storage/kv";

const INSTALLATION_KEY = "installation-id";

/**
 * The browser has no SecureStore. A random id in local storage is enough to
 * name this browser for OTP; it is still not a fingerprint.
 */
export async function installationId(): Promise<string> {
  const existing = await kvGet(INSTALLATION_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  await kvSet(INSTALLATION_KEY, created);
  return created;
}
