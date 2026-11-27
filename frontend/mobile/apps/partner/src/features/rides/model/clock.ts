import { kvGet, kvSet } from "@vsolve/mobile-core";

/**
 * The gap between the server's clock and the phone's (brief §5.6). Pings carry `captured_at` in
 * server time, so a phone whose clock runs slow still stays on duty. The offset is kept in memory
 * for the screens and in storage for the location task, which can start without any screen.
 */
const KEY = "rides.clockOffsetMs";
let cached: number | null = null;

export function offsetFrom(serverNowIso: string, phoneNowMs: number = Date.now()): number {
  const server = Date.parse(serverNowIso);
  return Number.isFinite(server) ? server - phoneNowMs : 0;
}

export function inServerTime(phoneMs: number, offsetMs: number): string {
  return new Date(phoneMs + offsetMs).toISOString();
}

/** Remember the offset from a `server_now` the server just sent. */
export async function saveClockOffset(serverNowIso: string): Promise<number> {
  const offset = offsetFrom(serverNowIso);
  cached = offset;
  await kvSet(KEY, String(offset));
  return offset;
}

export async function clockOffset(): Promise<number> {
  if (cached !== null) return cached;
  const raw = await kvGet(KEY);
  const parsed = raw === null ? Number.NaN : Number(raw);
  cached = Number.isFinite(parsed) ? parsed : 0;
  return cached;
}

/** Tests only: forget the in-memory offset. */
export function resetClockForTests(): void {
  cached = null;
}
