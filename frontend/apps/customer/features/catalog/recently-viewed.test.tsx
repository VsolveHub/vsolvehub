import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RECENTLY_VIEWED_LIMIT,
  clearViewed,
  readViewed,
  recordViewed,
  withViewed,
  type ViewedService,
} from "./recently-viewed";

/**
 * The browse history this app keeps on the device.
 *
 * `.tsx` despite testing no component: the workspace's vitest config routes
 * `.ts` to the node environment and `.tsx` to jsdom, and every case below needs
 * a real `localStorage`. The extension is the environment selector here.
 *
 * The properties that matter are the ones that decide whether this can break a
 * page: re-viewing must move rather than duplicate, and *every* storage failure
 * must degrade to "no history" rather than throw. A browse convenience is not
 * allowed to take down the catalogue.
 */

const KEY = "vsolve:recently-viewed-services";

function entry(slug: string, name = slug): ViewedService {
  return { slug, name, href: `/catalog/technician/${slug}` };
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("withViewed", () => {
  it("puts the newest first", () => {
    const history = withViewed([entry("a")], entry("b"));
    expect(history.map((viewed) => viewed.slug)).toEqual(["b", "a"]);
  });

  it("moves a repeat view rather than storing it twice", () => {
    const history = withViewed([entry("a"), entry("b")], entry("b"));
    expect(history.map((viewed) => viewed.slug)).toEqual(["b", "a"]);
  });

  it("drops the oldest past the limit", () => {
    const full = Array.from({ length: RECENTLY_VIEWED_LIMIT }, (_, index) =>
      entry(`s${index}`),
    );
    const history = withViewed(full, entry("new"));

    expect(history).toHaveLength(RECENTLY_VIEWED_LIMIT);
    expect(history[0]?.slug).toBe("new");
    expect(history.map((viewed) => viewed.slug)).not.toContain(
      `s${RECENTLY_VIEWED_LIMIT - 1}`,
    );
  });

  it("does not mutate the list it was given", () => {
    const history = [entry("a")];
    withViewed(history, entry("b"));
    expect(history.map((viewed) => viewed.slug)).toEqual(["a"]);
  });
});

describe("recordViewed and readViewed", () => {
  it("round-trips a view", () => {
    recordViewed(entry("ac-service", "AC service"));
    expect(readViewed()).toEqual([entry("ac-service", "AC service")]);
  });

  it("reads nothing when nothing has been stored", () => {
    expect(readViewed()).toEqual([]);
  });

  it("treats unparseable storage as no history", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(readViewed()).toEqual([]);
  });

  it("treats a value of the wrong shape as no history", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ slug: "a" }));
    expect(readViewed()).toEqual([]);
  });

  it("drops entries from an older shape and keeps the rest", () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify([{ slug: "old", name: "Old" }, entry("kept")]),
    );
    expect(readViewed().map((viewed) => viewed.slug)).toEqual(["kept"]);
  });

  it("returns no history rather than throwing when storage is unavailable", () => {
    // A private window can throw on access rather than return null.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(() => readViewed()).not.toThrow();
    expect(readViewed()).toEqual([]);
  });

  it("swallows a write failure rather than failing the page", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => recordViewed(entry("a"))).not.toThrow();
  });

  it("forgets everything when cleared", () => {
    recordViewed(entry("a"));
    clearViewed();
    expect(readViewed()).toEqual([]);
  });
});
