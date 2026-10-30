import { cache } from "react";
import { ApiNetworkError, request, type Schemas } from "@vsolve/api-client";

import { createPublicApi } from "@/lib/api/public";

export type SafetyStoryItem = Schemas["PublicSafetyStory"];

/**
 * Live safety stories shown in the customer home feed.
 *
 * Safety stories are short-lived (24h) marketing/safety awareness content.
 * Reads may fail gracefully to empty list so a transient network glitch never
 * breaks the home screen. Revalidated every 60 seconds so expired stories drop off promptly.
 */
export const getActiveSafetyStories = cache(async (): Promise<SafetyStoryItem[]> => {
  const api = createPublicApi({ revalidate: 60, tags: ["safety-stories"] });
  try {
    const stories = await request(() => api.GET("/api/v1/safety-stories/"));
    return Array.isArray(stories) ? stories : [];
  } catch (error) {
    if (error instanceof ApiNetworkError) {
      return [];
    }
    // Return empty on error to preserve uninterrupted customer browsing
    return [];
  }
});
