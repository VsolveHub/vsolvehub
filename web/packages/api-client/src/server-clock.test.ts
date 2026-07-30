import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerClock, readServerNow } from "./server-clock";

afterEach(() => {
  vi.useRealTimers();
});

/** Local epoch used across these tests; the device clock is deliberately wrong. */
const LOCAL_NOW = Date.parse("2026-07-30T09:00:00.000Z");

function clockAt(localNowMs: number): ServerClock {
  vi.useFakeTimers();
  vi.setSystemTime(localNowMs);
  return new ServerClock();
}

describe("offset estimation", () => {
  it("is uncalibrated until a sample arrives", () => {
    const clock = clockAt(LOCAL_NOW);
    expect(clock.isCalibrated).toBe(false);
    expect(clock.offsetMs).toBe(0);
    expect(clock.uncertaintyMs).toBe(Number.POSITIVE_INFINITY);
  });

  it("estimates the server instant at the round-trip midpoint", () => {
    const clock = clockAt(LOCAL_NOW);
    // Device is 4 minutes fast. Request took 200ms, so the server produced its
    // timestamp at roughly local +100ms.
    const sentAt = LOCAL_NOW;
    const receivedAt = LOCAL_NOW + 200;
    const trueServerNow = LOCAL_NOW - 4 * 60_000 + 100;

    clock.record(trueServerNow, sentAt, receivedAt, "server_now");

    expect(clock.offsetMs).toBe(-4 * 60_000);
    expect(clock.isCalibrated).toBe(true);
  });

  it("corrects a fast device clock when reporting now()", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW - 240_000, LOCAL_NOW, LOCAL_NOW, "server_now");
    expect(clock.now()).toBe(LOCAL_NOW - 240_000);
  });
});

describe("sample selection", () => {
  it("prefers the measurement with the shortest round trip", () => {
    const clock = clockAt(LOCAL_NOW);
    // A slow first sample carries more asymmetry risk than a fast second one.
    clock.record(LOCAL_NOW + 5_000, LOCAL_NOW, LOCAL_NOW + 4_000, "date_header");
    const slowOffset = clock.offsetMs;

    clock.record(LOCAL_NOW + 1_000, LOCAL_NOW, LOCAL_NOW + 50, "date_header");
    expect(clock.offsetMs).not.toBe(slowOffset);
    expect(clock.uncertaintyMs).toBeLessThan(1_100);
  });

  it("prefers an explicit server_now over a Date header sample", () => {
    const clock = clockAt(LOCAL_NOW);
    // Even though the header sample is faster, it is only second-precise.
    clock.record(LOCAL_NOW + 1_000, LOCAL_NOW, LOCAL_NOW + 10, "date_header");
    clock.record(LOCAL_NOW + 2_000, LOCAL_NOW, LOCAL_NOW + 500, "server_now");
    expect(clock.offsetMs).toBe(2_000 - 250);
  });

  it("does not let a Date header sample displace a server_now sample", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW + 2_000, LOCAL_NOW, LOCAL_NOW + 100, "server_now");
    const precise = clock.offsetMs;
    clock.record(LOCAL_NOW + 9_000, LOCAL_NOW, LOCAL_NOW + 10, "date_header");
    expect(clock.offsetMs).toBe(precise);
  });

  it("refreshes an aged sample so it tracks clock drift", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW + 1_000, LOCAL_NOW, LOCAL_NOW + 10, "server_now");

    // Six minutes later a slower sample must still win, or one lucky early
    // measurement would pin the offset for the whole session.
    const laterLocal = LOCAL_NOW + 6 * 60_000;
    clock.record(laterLocal + 5_000, laterLocal, laterLocal + 800, "server_now");
    expect(clock.offsetMs).toBe(5_000 - 400);
  });
});

describe("hostile inputs", () => {
  it("discards a negative round trip", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW, LOCAL_NOW + 100, LOCAL_NOW, "date_header");
    expect(clock.isCalibrated).toBe(false);
  });

  it("discards an absurdly long round trip from a suspended tab", () => {
    // A backgrounded mobile tab can resume minutes later; that measurement says
    // nothing useful about the offset and would poison every countdown.
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW, LOCAL_NOW, LOCAL_NOW + 120_000, "date_header");
    expect(clock.isCalibrated).toBe(false);
  });

  it("discards an unparseable server time", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(Number.NaN, LOCAL_NOW, LOCAL_NOW + 50, "date_header");
    expect(clock.isCalibrated).toBe(false);
  });
});

describe("uncertainty", () => {
  it("adds one second of granularity for a Date header sample", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW, LOCAL_NOW, LOCAL_NOW + 200, "date_header");
    // 100ms of asymmetry risk plus the header's 1s resolution.
    expect(clock.uncertaintyMs).toBe(1_100);
  });

  it("adds no granularity for a millisecond-precise server_now sample", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW, LOCAL_NOW, LOCAL_NOW + 200, "server_now");
    expect(clock.uncertaintyMs).toBe(100);
  });
});

describe("remainingMs", () => {
  it("counts down from the corrected clock, not the device clock", () => {
    const clock = clockAt(LOCAL_NOW);
    // Device is 4 minutes fast. A 15-second offer must still show ~15s left.
    clock.record(LOCAL_NOW - 240_000, LOCAL_NOW, LOCAL_NOW, "server_now");

    const expiresAt = new Date(LOCAL_NOW - 240_000 + 15_000).toISOString();
    expect(clock.remainingMs(expiresAt)).toBe(15_000);
  });

  it("would have reported a wrong value without correction", () => {
    // Proves the correction matters: an uncalibrated clock on the same device
    // sees the deadline as long past and would hide a live offer.
    const clock = clockAt(LOCAL_NOW);
    const expiresAt = new Date(LOCAL_NOW - 240_000 + 15_000).toISOString();
    expect(clock.remainingMs(expiresAt)).toBe(0);
  });

  it("floors at zero rather than returning a negative duration", () => {
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW, LOCAL_NOW, LOCAL_NOW, "server_now");
    expect(clock.remainingMs(new Date(LOCAL_NOW - 5_000).toISOString())).toBe(0);
  });

  it("treats an unparseable deadline as already expired", () => {
    // Failing closed is correct: never render an expired hold as live.
    const clock = clockAt(LOCAL_NOW);
    clock.record(LOCAL_NOW, LOCAL_NOW, LOCAL_NOW, "server_now");
    expect(clock.remainingMs("not-a-date")).toBe(0);
  });
});

describe("readServerNow", () => {
  it("extracts a server_now field", () => {
    expect(readServerNow({ server_now: "2026-07-30T09:00:00Z" })).toBe(
      Date.parse("2026-07-30T09:00:00Z"),
    );
  });

  it("returns null when absent or malformed", () => {
    expect(readServerNow({})).toBeNull();
    expect(readServerNow({ server_now: 12345 })).toBeNull();
    expect(readServerNow({ server_now: "nope" })).toBeNull();
    expect(readServerNow(null)).toBeNull();
  });
});
