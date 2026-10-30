import { BRAND_CARD_ALT, BRAND_CARD_SIZE, brandCard } from "@/features/seo/brand-card";

export const alt = BRAND_CARD_ALT;
export const size = BRAND_CARD_SIZE;
export const contentType = "image/png";

export default function TwitterImage() {
  return brandCard();
}
