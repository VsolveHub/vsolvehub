// Ported from frontend/apps/customer/features/requirement/model/engagement-redirect.ts
import { engagementHref } from "@/lib/routes";

/** A converted request has one canonical destination: its engagement workspace. */
export function engagementDestination(engagementId: string | null): string | null {
  return engagementId === null ? null : engagementHref(engagementId);
}
