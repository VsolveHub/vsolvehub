import "server-only";

import { request, type Schemas } from "@vsolve/api-client";

import { createPublicApi } from "@/lib/api/public";

export type PublishedCancellationPolicy = Schemas["PublishedCancellationPolicy"];

/**
 * The cancellation ladder new bookings get today (contract 1.78.0).
 *
 * Read from the API rather than typed into the page, so the public policy can never quote a fee
 * the checkout no longer charges. `null` when it cannot be read: the page then says so and points
 * to the confirm step, which always states the exact fee — it never prints a remembered number.
 */
export async function getPublishedCancellationPolicy(): Promise<PublishedCancellationPolicy | null> {
  try {
    const api = createPublicApi({ revalidate: 300, tags: ["legal:cancellation-policy"] });
    return await request(() => api.GET("/api/v1/legal/cancellation-policy/"));
  } catch {
    return null;
  }
}
