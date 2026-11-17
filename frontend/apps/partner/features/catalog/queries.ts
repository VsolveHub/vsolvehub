import "server-only";

import { cache } from "react";
import { request } from "@vsolve/api-client";
import {
  workCatalogFrom,
  type MainCategory,
  type OfferableService,
  type WorkCatalog,
} from "@vsolve/query/partner-work";

import { createPublicApi } from "@/lib/api/public";

export type { MainCategory, OfferableService, WorkCatalog };

/**
 * The work an applicant can offer: every trade with its services and their variants.
 *
 * One request, shared with the phone app. This used to walk the public catalog (one request per
 * category and one per service, capped at six at a time) and could still outrun the 30 second API
 * client deadline on a cold cache. Django now answers with the same rows in one read, and leaves
 * out the categories that are their own way to join (stays, rentals, hiring, crew work).
 */

const CATALOG_REVALIDATE_SECONDS = 300;

const policy = { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] };

export const getWorkCatalog = cache(async (): Promise<WorkCatalog> => {
  const api = createPublicApi(policy);
  const categories = await request(() => api.GET("/api/v1/partner/work-catalog/"));
  return workCatalogFrom(categories);
});
