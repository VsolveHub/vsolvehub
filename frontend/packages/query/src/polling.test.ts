import { describe, expect, it } from "vitest";

import { RECOVERY_POLL_INTERVAL } from "./freshness";
import { boundedPoll, nextPollDelay } from "./polling";

/**
 * The three properties that make a poller safe to ship.
 *
 * Each one fails silently if it regresses: a poll that never stops looks
 * identical to one that is working, right up until it is doing it on ten
 * thousand settled bookings.
 */

interface Group {
  status: string;
}

const isSettled = (group: Group) => group.status === "BOOKED";

describe("a poll that stops", () => {
  it("stops once the server's answer can no longer change", () => {
    expect(nextPollDelay({ status: "BOOKED" }, { isSettled, failureCount: 0 })).toBe(false);
  });

  it("keeps going while the answer can still change", () => {
    expect(nextPollDelay({ status: "MATCHING" }, { isSettled, failureCount: 0 })).toBe(
      RECOVERY_POLL_INTERVAL,
    );
  });

  it("polls before the first answer arrives, rather than assuming settled", () => {
    // `undefined` is "we have not asked yet". Treating it as settled would mean
    // a query that failed its first attempt never tried again.
    expect(nextPollDelay(undefined, { isSettled, failureCount: 0 })).toBe(
      RECOVERY_POLL_INTERVAL,
    );
  });
});

describe("a poll that backs off", () => {
  it("doubles the interval per consecutive failure", () => {
    const at = (failureCount: number) =>
      nextPollDelay({ status: "MATCHING" }, { intervalMs: 5_000, isSettled, failureCount });

    expect(at(0)).toBe(5_000);
    expect(at(1)).toBe(10_000);
    expect(at(2)).toBe(20_000);
    expect(at(3)).toBe(40_000);
  });

  it("caps the interval rather than backing off to never", () => {
    // Unbounded doubling reaches hours, at which point a recovered server is
    // never noticed and a person refreshes instead.
    expect(
      nextPollDelay({ status: "MATCHING" }, { intervalMs: 5_000, isSettled, failureCount: 20 }),
    ).toBe(60_000);
  });

  it("still stops on a settled answer even after failures", () => {
    expect(
      nextPollDelay({ status: "BOOKED" }, { intervalMs: 5_000, isSettled, failureCount: 4 }),
    ).toBe(false);
  });
});

describe("the query options it produces", () => {
  it("never polls a backgrounded tab", () => {
    // A hidden tab cannot show anyone anything, and on a phone it is the one
    // most likely to be doing this on a metered connection.
    expect(boundedPoll({ isSettled }).refetchIntervalInBackground).toBe(false);
  });

  it("reads data and failure count from the query TanStack hands it", () => {
    const options = boundedPoll<Group>({ intervalMs: 5_000, isSettled });

    expect(
      options.refetchInterval({
        state: { data: { status: "MATCHING" }, fetchFailureCount: 1 },
      }),
    ).toBe(10_000);

    expect(
      options.refetchInterval({
        state: { data: { status: "BOOKED" }, fetchFailureCount: 0 },
      }),
    ).toBe(false);
  });
});
