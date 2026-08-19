import type { Schemas } from "@vsolve/api-client";
import { describe, expect, it } from "vitest";

import { toCascadeView } from "./index";

/**
 * The waiting screen's progress strip.
 *
 * What is worth asserting is the *absence* of invention: the strip must not
 * project fire times for waves whose offers have not been sent, and it must not
 * describe a wave that does not exist. Everything else it shows is a server
 * field passed through.
 */

function cascade(overrides: Partial<Schemas["CascadeProgress"]> = {}): Schemas["CascadeProgress"] {
  return {
    wave: 1,
    total_waves: 4,
    offers_out: 3,
    next_wave_at: "2026-08-18T10:02:00.000Z",
    ...overrides,
  };
}

describe("toCascadeView", () => {
  it("renders one column per configured wave", () => {
    const view = toCascadeView(cascade());
    expect(view?.waves.map((wave) => wave.number)).toEqual([1, 2, 3, 4]);
  });

  it("marks past, current and future waves apart", () => {
    const view = toCascadeView(cascade({ wave: 2 }));
    expect(view?.waves.map((wave) => wave.state)).toEqual([
      "done",
      "current",
      "upcoming",
      "upcoming",
    ]);
  });

  it("counts the offers out on the current wave only", () => {
    const view = toCascadeView(cascade({ wave: 2, offers_out: 5 }));
    expect(view?.waves[1]?.detail).toBe("5 supervisors");
    expect(view?.waves[0]?.detail).toBe("No takers");
  });

  it("dates the next wave and no other", () => {
    const view = toCascadeView(cascade({ wave: 1 }));

    // Only wave 2 has a known time. Waves 3 and 4 depend on offers that have not
    // been sent, and projecting them would be this client promising a schedule
    // nobody can keep.
    expect(view?.waves[1]?.firesAt).toBe("2026-08-18T10:02:00.000Z");
    expect(view?.waves[2]?.firesAt).toBeNull();
    expect(view?.waves[3]?.firesAt).toBeNull();
    expect(view?.waves[2]?.detail).toBe("If needed");
  });

  it("names no next wave on the final one", () => {
    // The server sends `next_wave_at: null` on the last wave; the strip must not
    // count down to a wave that will never fire.
    const view = toCascadeView(cascade({ wave: 4, next_wave_at: null }));
    expect(view?.waves.every((wave) => wave.firesAt === null)).toBe(true);
    expect(view?.waves[3]?.state).toBe("current");
  });

  it("says the offers are going out rather than showing a zero", () => {
    const view = toCascadeView(cascade({ offers_out: 0 }));
    expect(view?.waves[0]?.detail).toBe("Sending now");
    expect(view?.hasOffersOut).toBe(false);
  });

  it("renders nothing when no search is running", () => {
    expect(toCascadeView(null)).toBeNull();
    // A cascade configured with no waves is not a cascade. Rendering an empty
    // strip would be a progress bar for a search that cannot happen.
    expect(toCascadeView(cascade({ total_waves: 0 }))).toBeNull();
  });
});
