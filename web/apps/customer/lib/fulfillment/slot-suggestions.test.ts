import { describe, expect, it } from "vitest";
import { suggestSlots } from "./slot-suggestions";
import type { CandidatePartner } from "./matching";

function partner(over: Partial<CandidatePartner> = {}): CandidatePartner {
  return {
    id: "p1",
    lat: 17.4,
    lng: 78.47,
    rating: 4.5,
    availability: [],
    trade: { slug: "electrician" },
    skills: [],
    ...over,
  };
}

// A slot at 8 AM tomorrow, matching how the flow builds block-start ISO strings.
function slotAt(daysFromNow: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

const ctx = {
  addrLat: 17.4,
  addrLng: 78.47,
  scheduleType: "scheduled" as const,
  service: { slug: "switch-socket-repair", subCategory: { slug: "electrician" } },
};

describe("suggestSlots", () => {
  it("suggests the nearest future block an open partner allows", () => {
    const rejected = slotAt(1, 8);
    const suggestions = suggestSlots([partner()], { ...ctx, slot: rejected });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(new Date(suggestions[0]!.slotIso).getTime()).toBeGreaterThan(Date.now());
  });

  it("never suggests the rejected slot itself", () => {
    const rejected = slotAt(1, 8);
    const suggestions = suggestSlots([partner()], { ...ctx, slot: rejected });
    expect(suggestions.some((s) => s.slotIso === rejected)).toBe(false);
  });

  it("never suggests a slot in the past", () => {
    const rejected = slotAt(1, 8);
    const suggestions = suggestSlots([partner()], { ...ctx, slot: rejected });
    for (const s of suggestions) {
      expect(new Date(s.slotIso).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("returns an empty list when no partner in the pool has any open window", () => {
    // Blocked every day of the week.
    const alwaysBlocked = partner({
      availability: Array.from({ length: 7 }, (_, dow) => ({
        type: "blocked",
        dayOfWeek: dow,
        date: null,
        startTime: null,
        endTime: null,
      })),
    });
    const rejected = slotAt(1, 8);
    expect(suggestSlots([alwaysBlocked], { ...ctx, slot: rejected })).toEqual([]);
  });

  it("returns an empty list for an empty pool", () => {
    expect(suggestSlots([], { ...ctx, slot: slotAt(1, 8) })).toEqual([]);
  });

  it("caps suggestions at the requested max", () => {
    const rejected = slotAt(1, 8);
    const suggestions = suggestSlots([partner()], { ...ctx, slot: rejected }, { max: 2 });
    expect(suggestions.length).toBeLessThanOrEqual(2);
  });

  it("reports a count for each suggestion", () => {
    const rejected = slotAt(1, 8);
    const suggestions = suggestSlots([partner(), partner({ id: "p2" })], { ...ctx, slot: rejected });
    expect(suggestions[0]!.count).toBe(2);
  });

  it("gives each suggestion a human-readable label", () => {
    const rejected = slotAt(1, 8);
    const suggestions = suggestSlots([partner()], { ...ctx, slot: rejected });
    expect(suggestions[0]!.label.length).toBeGreaterThan(0);
  });
});
