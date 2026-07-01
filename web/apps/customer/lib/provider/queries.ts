import { OFFER_TTL_SECONDS } from "./constants";

/** When a freshly created job offer expires (the partner's accept window). */
export function offerExpiresAt(from = new Date()) {
  return new Date(from.getTime() + OFFER_TTL_SECONDS * 1000);
}
