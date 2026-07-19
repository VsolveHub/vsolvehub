import { describe, expect, it } from "vitest";
import { filterEligible, rankPartners, slotMatchesAvailability, type CandidatePartner, type MatchContext } from "./matching";

const scheduledCtx: MatchContext = {
  addrLat: 17.4,
  addrLng: 78.47,
  scheduleType: "scheduled",
  slot: new Date(Date.now() + 26 * 3600_000).toISOString(),
  service: { slug: "switch-socket-repair", subCategory: { slug: "electrician" } },
};

const instantCtx: MatchContext = {
  ...scheduledCtx,
  scheduleType: "instant",
  slot: new Date(Date.now() + 45 * 60_000).toISOString(),
};

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

describe("slotMatchesAvailability", () => {
  it("is open when there are no availability rows", () => {
    expect(slotMatchesAvailability(scheduledCtx.slot, [])).toBe(true);
  });

  it("is blocked on a matching day-of-week block", () => {
    const dow = new Date(scheduledCtx.slot).getDay();
    expect(
      slotMatchesAvailability(scheduledCtx.slot, [
        { type: "blocked", dayOfWeek: dow, date: null, startTime: null, endTime: null },
      ]),
    ).toBe(false);
  });

  it("respects a same-day time window", () => {
    const slotDate = new Date(scheduledCtx.slot);
    const dow = slotDate.getDay();
    const hh = String(slotDate.getHours()).padStart(2, "0");
    const rows = [{ type: "available", dayOfWeek: dow, date: null, startTime: "00:00", endTime: "23:59" }];
    expect(slotMatchesAvailability(scheduledCtx.slot, rows)).toBe(true);
    expect(
      slotMatchesAvailability(scheduledCtx.slot, [
        { type: "available", dayOfWeek: dow, date: null, startTime: `${hh}:00`, endTime: `${hh}:00` },
      ]).toString(),
    ).toBeDefined();
  });
});

describe("filterEligible", () => {
  it("keeps a matching partner in range", () => {
    expect(filterEligible([partner()], scheduledCtx, new Set())).toHaveLength(1);
  });

  it("drops a partner outside the 25 km radius", () => {
    expect(filterEligible([partner({ lat: 18.5, lng: 80.0 })], scheduledCtx, new Set())).toHaveLength(0);
  });

  it("drops a partner whose trade and skills do not match", () => {
    expect(
      filterEligible([partner({ trade: { slug: "pet-grooming" }, skills: [] })], scheduledCtx, new Set()),
    ).toHaveLength(0);
  });

  it("keeps a partner matched via a skill instead of trade", () => {
    const p = partner({ trade: null, skills: [{ skill: { slug: "switch-socket-repair" } }] });
    expect(filterEligible([p], scheduledCtx, new Set())).toHaveLength(1);
  });

  it("drops a partner whose availability windows block the slot", () => {
    const dow = new Date(scheduledCtx.slot).getDay();
    const p = partner({
      availability: [{ type: "blocked", dayOfWeek: dow, date: null, startTime: null, endTime: null }],
    });
    expect(filterEligible([p], scheduledCtx, new Set())).toHaveLength(0);
  });

  it("excludes a partner id passed in the exclude set", () => {
    expect(filterEligible([partner({ id: "busy" })], scheduledCtx, new Set(["busy"]))).toHaveLength(0);
  });

  it("treats a partner with no coordinates as always in range", () => {
    expect(filterEligible([partner({ lat: null, lng: null })], scheduledCtx, new Set())).toHaveLength(1);
  });

  it("falls back to matching everyone when the service has no sub-category", () => {
    const ctx: MatchContext = { ...scheduledCtx, service: { slug: "misc", subCategory: null } };
    expect(filterEligible([partner({ trade: { slug: "anything" } })], ctx, new Set())).toHaveLength(1);
  });
});

describe("rankPartners", () => {
  it("prefers the closer partner, all else equal", () => {
    const near = partner({ id: "near" });
    const far = partner({ id: "far", lat: 17.55 });
    const ranked = rankPartners([far, near], scheduledCtx, new Map());
    expect(ranked[0]!.id).toBe("near");
  });

  it("prefers the higher-rated partner at equal distance", () => {
    const good = partner({ id: "good", rating: 4.9 });
    const ok = partner({ id: "ok", rating: 3.5 });
    expect(rankPartners([ok, good], scheduledCtx, new Map())[0]!.id).toBe("good");
  });

  it("boosts a partner with fewer recent assignments (fairness)", () => {
    const fresh = partner({ id: "fresh", rating: 4.0 });
    const loaded = partner({ id: "loaded", rating: 4.4 });
    const recent = new Map([["loaded", 6]]);
    expect(rankPartners([loaded, fresh], scheduledCtx, recent)[0]!.id).toBe("fresh");
  });

  it("is a pure sort — does not mutate the input array", () => {
    const far = partner({ id: "far", lat: 17.55 });
    const near = partner({ id: "near" });
    const input = [far, near];
    rankPartners(input, scheduledCtx, new Map());
    expect(input[0]!.id).toBe("far");
  });
});
