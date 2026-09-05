import "server-only";

import { cache } from "react";
import { request } from "@vsolve/api-client";

import { CACHE_TAGS, CATALOG_REVALIDATE_SECONDS } from "@/lib/api/config";
import { createPublicApi } from "@/lib/api/public";

import type { ServiceIndexItem } from "../queries";

/**
 * The whole published catalogue, in one request.
 *
 * ## Why this is not `getServicesByCategory`
 *
 * The search page's index is a fan-out: one `GET /categories/{slug}/services/`
 * per category, issued in parallel. That is the right shape when the caller
 * already needs a category's full `ServiceCard` — cover image, price band,
 * archetypes — and when the pages that browse those categories have already
 * warmed the same cache entries.
 *
 * The icon catalogue needs none of that. It renders a glyph and a name, so
 * `ServiceCard` is almost entirely payload it throws away, and a screen that
 * lists *every* service has no reason to pay N round trips to assemble one
 * list. `catalog_service_index` exists for exactly this: contract 1.43.0
 * publishes it as "the complete icon catalogue's intentionally small row
 * contract" — identity, ordering, and an icon key. No media, no money, no prose.
 *
 * So this is one cacheable request for the whole catalogue, tagged `catalog`
 * like every other public read, and it invalidates with the same publish.
 *
 * ## No 404 branch, deliberately
 *
 * The sibling reads in `../queries` translate a 404 into `null` because they
 * address a single record by slug and "no such category" is a real answer. This
 * endpoint takes no parameters — there is no row to miss. A failure here means
 * the catalogue is unreachable, and that must reach `error.tsx` rather than
 * render an empty grid that tells the customer Vsolve Hub sells nothing.
 */
export const getServiceIndex = cache(async (): Promise<ServiceIndexItem[]> => {
  const api = createPublicApi({
    revalidate: CATALOG_REVALIDATE_SECONDS,
    tags: [CACHE_TAGS.catalog],
  });
  return request(() => api.GET("/api/v1/services/"));
});
