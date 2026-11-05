import { resolveImageUrl } from "@/features/catalog/category-artwork";

/**
 * A job listing's own photo, reachable from a phone, or null when it has none.
 *
 * Never a stand-in chosen from the job title: the card shows its honest empty state instead.
 */
export function getCareerImage(listing?: { media?: { url?: string }[] }): string | null {
  const mediaUrl = Array.isArray(listing?.media) ? listing.media[0]?.url : undefined;
  return resolveImageUrl(mediaUrl);
}
