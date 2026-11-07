import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import type { SafetyStoryItem } from "./model";

export type { SafetyStoryItem };

/**
 * Live safety stories shown in the customer home feed.
 *
 * Safety stories are short-lived (24h) marketing/safety awareness content.
 * Filters out expired items and fails gracefully to an empty list so a transient network glitch
 * never breaks the home screen.
 */
export async function fetchActiveSafetyStories(): Promise<SafetyStoryItem[]> {
  try {
    const stories = await request(() => getApiClient().GET("/api/v1/safety-stories/"));
    if (!Array.isArray(stories)) return [];
    const now = Date.now();
    return (stories as SafetyStoryItem[]).filter(
      (story) => new Date(story.expires_at).getTime() > now,
    );
  } catch {
    return [];
  }
}
