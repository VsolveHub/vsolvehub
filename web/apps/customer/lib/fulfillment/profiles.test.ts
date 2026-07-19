import { describe, expect, it } from "vitest";
import { toPublicProfiles } from "./profiles";
import type { CandidatePartner } from "./matching";

const at = (id: string, lat: number, lng: number, over: Partial<CandidatePartner> = {}): CandidatePartner => ({
  id, lat, lng, rating: 4.5, availability: [], trade: { slug: "electrician" }, skills: [], ...over,
});

const addr = { addrLat: 17.4, addrLng: 78.47 };
const names = new Map([
  ["a", { name: "Raju K.", jobsCompleted: 128 }],
  ["b", { name: "Anil R.", jobsCompleted: 40 }],
]);

describe("toPublicProfiles", () => {
  it("preserves matcher order and maps names/jobs", () => {
    const out = toPublicProfiles([at("a", 17.4, 78.47), at("b", 17.5, 78.5)], addr, names);
    expect(out.map((p) => p.id)).toEqual(["a", "b"]);
    expect(out[0]).toMatchObject({ id: "a", name: "Raju K.", jobsCompleted: 128, rating: 4.5 });
  });

  it("computes a non-negative distance and an ETA at/above the floor", () => {
    const [near] = toPublicProfiles([at("a", 17.4, 78.47)], addr, names);
    expect(near!.distanceKm).toBeGreaterThanOrEqual(0);
    expect(near!.etaMins).toBeGreaterThanOrEqual(10);
    const [far] = toPublicProfiles([at("a", 17.9, 79.1)], addr, names);
    expect(far!.distanceKm).toBeGreaterThan(near!.distanceKm);
    expect(far!.etaMins).toBeGreaterThan(near!.etaMins);
  });

  it("falls back to distance 0 for a partner with no geo", () => {
    const [p] = toPublicProfiles([at("a", null as unknown as number, null as unknown as number)], addr, names);
    expect(p!.distanceKm).toBe(0);
    expect(p!.etaMins).toBe(10);
  });

  it("uses a placeholder name when the partner has none", () => {
    const [p] = toPublicProfiles([at("z", 17.4, 78.47)], addr, new Map());
    expect(p!.name.length).toBeGreaterThan(0);
    expect(p!.jobsCompleted).toBe(0);
  });
});
