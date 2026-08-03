import { serverClock } from "@vsolve/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeCountdown } from "./countdown";

/**
 * Countdown arithmetic and, more importantly, whose clock it uses.
 *
 * The formatting cases are cheap. The one that earns its place is the last
 * describe block: a device clock two minutes fast must not make a live offer
 * look dead, because a Partner who sees "expired" does not tap Accept.
 */

describe("what the digits say", () => {
  it("counts down in minutes and seconds under an hour", () => {
    expect(describeCountdown(102_000).display).toBe("1:42");
    expect(describeCountdown(9_000).display).toBe("0:09");
  });

  it("adds an hours segment only when there is one", () => {
    expect(describeCountdown(3_661_000).display).toBe("1:01:01");
    expect(describeCountdown(59_000).display).toBe("0:59");
  });

  it("rounds up, so a countdown never shows zero while time remains", () => {
    // Showing "0:00" for 400ms of remaining time would make a Partner stop
    // reaching for a button that still works.
    expect(describeCountdown(400).display).toBe("0:01");
    expect(describeCountdown(0).display).toBe("0:00");
  });

  it("floors at zero rather than going negative", () => {
    expect(describeCountdown(-5_000).display).toBe("0:00");
    expect(describeCountdown(-5_000).isExpired).toBe(true);
  });
});

describe("what a screen reader hears", () => {
  it("is coarse, because a per-second string makes a page unusable", () => {
    expect(describeCountdown(102_000).announce).toBe("about 2 minutes left");
    expect(describeCountdown(45_000).announce).toBe("less than a minute left");
    expect(describeCountdown(3_600_000).announce).toBe("about 1 hour left");
  });

  it("says the time is up rather than reading zero digits", () => {
    expect(describeCountdown(0).announce).toBe("Time is up");
  });

  it("agrees with the digits about whether time remains", () => {
    // The two must never disagree: a visible "0:01" with "Time is up" announced
    // is a control a sighted user reaches for and a blind user does not.
    for (const remaining of [0, 1, 999, 1_000, 59_999, 60_000]) {
      const countdown = describeCountdown(remaining);
      expect(countdown.isExpired).toBe(countdown.display === "0:00");
    }
  });
});

describe("whose clock it is", () => {
  const DEADLINE = "2026-08-03T09:02:00Z";

  beforeEach(() => {
    serverClock.reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    serverClock.reset();
  });

  it("measures against the server, not a device running fast", () => {
    // The device believes it is 09:03 — past the deadline. The server said
    // 09:01 during a 100ms round trip, so a minute is genuinely left.
    vi.setSystemTime(new Date("2026-08-03T09:03:00Z"));
    const sentAt = Date.now();
    const receivedAt = sentAt + 100;
    serverClock.record(Date.parse("2026-08-03T09:01:00Z"), sentAt, receivedAt, "date_header");

    const remaining = serverClock.remainingMs(DEADLINE);
    expect(describeCountdown(remaining).isExpired).toBe(false);
    expect(remaining).toBeGreaterThan(59_000);
  });

  it("does not keep a live offer alive on a device running slow", () => {
    // The mirror image, and the one that would cost a Partner a wasted trip:
    // the device thinks there is time, the server has already expired it.
    vi.setSystemTime(new Date("2026-08-03T09:01:00Z"));
    const sentAt = Date.now();
    serverClock.record(Date.parse("2026-08-03T09:05:00Z"), sentAt, sentAt + 100, "date_header");

    expect(describeCountdown(serverClock.remainingMs(DEADLINE)).isExpired).toBe(true);
  });

  it("falls back to the device clock only when never calibrated", () => {
    // Offset zero is the honest default: with no sample there is nothing better
    // to use, and refusing to render a countdown would be worse.
    vi.setSystemTime(new Date("2026-08-03T09:01:30Z"));
    expect(serverClock.isCalibrated).toBe(false);
    expect(describeCountdown(serverClock.remainingMs(DEADLINE)).display).toBe("0:30");
  });
});
