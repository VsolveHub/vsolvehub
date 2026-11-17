// Ported from frontend/apps/partner/features/catalog/queries.ts
import { fetchWorkCatalog, type MainCategory, type OfferableService, type WorkCatalog } from "@vsolve/query/native";
import { getApiClient } from "@vsolve/mobile-core";
import { useQuery } from "@tanstack/react-query";

export type { MainCategory, OfferableService, WorkCatalog };

/**
 * The work an applicant can offer: every trade with its services and their variants.
 *
 * One request, shared with the website. It used to walk the public catalog from the phone, one
 * request per category and one per service (about 676 in all, uncapped), which is why opening
 * "Your work" was slow on a mobile connection. Django now answers with the same rows in one read,
 * and leaves out the categories that are their own way to join (stays, rentals, hiring, crew work).
 */
export function getWorkCatalog(): Promise<WorkCatalog> {
  return fetchWorkCatalog(getApiClient());
}

export function useWorkCatalog() {
  return useQuery({
    queryKey: ["catalog", "work"],
    queryFn: getWorkCatalog,
    staleTime: 300_000,
  });
}
