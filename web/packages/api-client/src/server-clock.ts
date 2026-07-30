/**
 * Server-clock offset tracking.
 *
 * Every countdown in this product is financially or operationally meaningful:
 * a 15-second instant offer, a 5-minute instant capacity hold, a scheduled
 * payment deadline, an OTP expiry, a booked work timer. A device clock that is
 * minutes fast or slow would show a partner an offer that looks alive when the
 * server has already expired it.
 *
 * Rules (plan document 09 §15 and 10 §4.2):
 *  - The server is the only authority on time.
 *  - The client renders countdowns locally from an offset-adjusted clock.
 *  - The client never polls per second to ask the server what time it is.
 *  - Expiry is always re-checked server-side; a local countdown is presentation.
 *
 * Two calibration sources, in order of precision:
 *  1. An explicit `server_now` field in a response body (millisecond precision).
 *  2. The HTTP `Date` response header, which every response carries but which
 *     RFC 7231 defines at one-second granularity. Good enough for a 15s offer
 *     (worst case ±0.5s) and always available, so it needs no contract support.
 *
 * Sample selection follows the same principle as NTP: the measurement with the
 * shortest round trip has the least uncertainty, so it wins.
 */

export interface ClockSample {
  /** Estimated offset in ms to add to a local timestamp to get server time. */
  offsetMs: number;
  /** Round-trip time of the measurement that produced this offset. */
  roundTripMs: number;
  /** Local time at which this sample was taken. */
  measuredAtLocalMs: number;
  /** Which source produced the sample. */
  source: "server_now" | "date_header";
}

/** How long a sample stays trusted before it is treated as needing a refresh. */
const SAMPLE_MAX_AGE_MS = 5 * 60_000;

/**
 * A better sample replaces the current one when it is more precise, or when the
 * current one has aged out. Without the age rule, one lucky fast response early
 * in a session would pin the offset forever and never track clock drift.
 */
function shouldReplace(current: ClockSample | null, candidate: ClockSample): boolean {
  if (!current) return true;
  const currentAge = candidate.measuredAtLocalMs - current.measuredAtLocalMs;
  if (currentAge > SAMPLE_MAX_AGE_MS) return true;
  // An explicit server_now is millisecond-precise; prefer it over a Date header
  // sample unless the header sample is dramatically tighter.
  if (candidate.source === "server_now" && current.source === "date_header") return true;
  if (candidate.source === "date_header" && current.source === "server_now") return false;
  return candidate.roundTripMs < current.roundTripMs;
}

export class ServerClock {
  private sample: ClockSample | null = null;

  /**
   * Records a measurement.
   *
   * @param serverTimeMs   Server instant parsed from the response.
   * @param requestSentAtMs Local time immediately before the request went out.
   * @param responseAtMs   Local time immediately after the response arrived.
   */
  record(
    serverTimeMs: number,
    requestSentAtMs: number,
    responseAtMs: number,
    source: ClockSample["source"],
  ): void {
    if (!Number.isFinite(serverTimeMs)) return;

    const roundTripMs = responseAtMs - requestSentAtMs;
    // A negative or absurd round trip means the timestamps are untrustworthy
    // (suspended tab, clock jump mid-request). Discard rather than poison.
    if (roundTripMs < 0 || roundTripMs > 60_000) return;

    // Assume symmetric latency: the server produced its timestamp at
    // approximately the midpoint of the round trip.
    const localAtServerInstant = requestSentAtMs + roundTripMs / 2;
    const candidate: ClockSample = {
      offsetMs: serverTimeMs - localAtServerInstant,
      roundTripMs,
      measuredAtLocalMs: responseAtMs,
      source,
    };

    if (shouldReplace(this.sample, candidate)) this.sample = candidate;
  }

  /** Current offset in ms, or 0 before any successful calibration. */
  get offsetMs(): number {
    return this.sample?.offsetMs ?? 0;
  }

  /** True once at least one usable sample exists. */
  get isCalibrated(): boolean {
    return this.sample !== null;
  }

  /**
   * Worst-case error of the current estimate, in ms.
   *
   * Half the round trip (asymmetric-latency risk) plus the source's own
   * granularity. Surface this when a countdown is near zero rather than
   * pretending sub-second accuracy the client does not have.
   */
  get uncertaintyMs(): number {
    if (!this.sample) return Number.POSITIVE_INFINITY;
    const granularity = this.sample.source === "date_header" ? 1000 : 0;
    return this.sample.roundTripMs / 2 + granularity;
  }

  /** Age of the current sample in ms. */
  ageMs(nowLocalMs: number = Date.now()): number {
    if (!this.sample) return Number.POSITIVE_INFINITY;
    return nowLocalMs - this.sample.measuredAtLocalMs;
  }

  /** Best estimate of the current server time, in epoch ms. */
  now(): number {
    return Date.now() + this.offsetMs;
  }

  /**
   * Milliseconds remaining until a server-provided deadline, floored at zero.
   *
   * Use for every hold, offer, OTP and work-timer countdown. Never subtract a
   * deadline from a raw `Date.now()`.
   */
  remainingMs(deadlineIso: string): number {
    const deadlineMs = Date.parse(deadlineIso);
    if (!Number.isFinite(deadlineMs)) return 0;
    return Math.max(0, deadlineMs - this.now());
  }

  /** Test seam: drop calibration. */
  reset(): void {
    this.sample = null;
  }
}

/**
 * Process-wide clock. One instance is correct because every app talks to one
 * API origin, and sharing samples across requests improves precision.
 */
export const serverClock = new ServerClock();

/** Extracts `server_now` from a response body when the endpoint provides one. */
export function readServerNow(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const value = (body as { server_now?: unknown }).server_now;
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
