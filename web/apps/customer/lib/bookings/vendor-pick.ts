import type { VendorOption } from "./types";

/** Pure scoring helper — safe for client components (no DB). */
export function pickBestVendor(vendors: VendorOption[]) {
  if (vendors.length === 0) return null;
  return [...vendors].sort((a, b) => {
    const scoreA = a.rating * 10 - a.distanceKm;
    const scoreB = b.rating * 10 - b.distanceKm;
    return scoreB - scoreA;
  })[0];
}
