// ─────────────────────────────────────────────────────────────────────────────
// Turn matcher-ranked candidates into customer-facing professional profiles for
// the "choose your professional" step. The matcher (matching.ts) deliberately
// carries no PII on CandidatePartner; the caller supplies names/jobs from one
// scoped query, and this pure function adds the distance/ETA the customer sees.
//
// Reuses the same haversine + service radius as the matcher so distances agree.
// ─────────────────────────────────────────────────────────────────────────────

import { haversineKm, type CandidatePartner } from "./matching";

/** Reused profile shape (was the old nearby-providers type). */
export type PublicProfile = {
  id: string;
  name: string;
  rating: number;
  jobsCompleted: number;
  distanceKm: number;
  etaMins: number;
};

/** Rough on-road speed used to turn distance into a friendly ETA. */
const AVG_KMPH = 22;
/** Minimum ETA shown, so a very-near pro never reads as "0 min". */
const MIN_ETA_MINS = 10;

export type PartnerIdentity = { name: string; jobsCompleted: number };

/**
 * Enrich ranked candidates (already capped by the caller) into display
 * profiles, preserving matcher order. `identities` maps partner id → name/jobs;
 * a missing entry falls back to a neutral label so a row is never blank.
 */
export function toPublicProfiles(
  ranked: CandidatePartner[],
  addr: { addrLat: number; addrLng: number },
  identities: Map<string, PartnerIdentity>,
): PublicProfile[] {
  return ranked.map((p) => {
    const distanceKm =
      p.lat != null && p.lng != null
        ? Math.round(haversineKm(p.lat, p.lng, addr.addrLat, addr.addrLng) * 10) / 10
        : 0;
    const identity = identities.get(p.id);
    return {
      id: p.id,
      name: identity?.name ?? "V Solve Professional",
      rating: p.rating,
      jobsCompleted: identity?.jobsCompleted ?? 0,
      distanceKm,
      etaMins: distanceKm > 0 ? Math.max(MIN_ETA_MINS, Math.round((distanceKm / AVG_KMPH) * 60) + MIN_ETA_MINS) : MIN_ETA_MINS,
    };
  });
}
