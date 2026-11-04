// Partner push tap routing. targetHref first, then the push-only kinds.
import type { Schemas } from "@vsolve/api-client";
import type { PushPayload } from "@vsolve/mobile-core";
import { pushedAppPath } from "@vsolve/mobile-core/push-routing";

import { targetHref } from "./model/feed";

/** The partner app's top-level routes, the ones a pushed web link may open. */
const PARTNER_APP_ROOTS = ["/apply", "/dispatch", "/home", "/listings", "/me", "/money", "/rentals", "/stays", "/work"] as const;

export type PushTarget = { kind: string; id?: string } | null;

export type PushDestination =
  | { readonly type: "route"; readonly href: string }
  | { readonly type: "alerts" };

export function resolvePartnerPush(target: PushTarget): PushDestination {
  if (target && "id" in target && typeof target.id === "string") {
    const href = targetHref(target as Schemas["NotificationTarget"]);
    if (href) return { type: "route", href };
  }
  if (target?.kind === "DISPATCH_OFFER" && "id" in target && target.id) return { type: "route", href: `/dispatch/${target.id}` };
  if (target?.kind === "PARTNER_OFFERS") return { type: "route", href: "/work/offers" };
  if (target?.kind === "PARTNER_WORK") return { type: "route", href: "/work/all" };
  return { type: "alerts" };
}

export function isOfferCreatedPush(data: { purpose?: unknown } | null | undefined): boolean {
  return data?.purpose === "partner.offer_created";
}

/** The instant job offer a push is about, from Django's OneSignal data or the old Expo data. */
function offerIdOf(data: PushPayload): string | null {
  const id = data.type === "DISPATCH_OFFER" ? data.offer_id : data.dispatch_offer_id;
  return typeof id === "string" && id !== "" ? id : null;
}

/**
 * Where a tapped OneSignal notification opens: the job offer, then the feed's own target, then the
 * web link's screen when the app has it, else the alerts panel.
 */
export function resolvePartnerPushData(data: PushPayload): PushDestination {
  const offerId = offerIdOf(data);
  if (offerId !== null) return { type: "route", href: `/dispatch/${offerId}` };
  const target = data.target as PushTarget | undefined;
  if (target) {
    const destination = resolvePartnerPush(target);
    if (destination.type === "route") return destination;
  }
  const path = pushedAppPath(data.url, PARTNER_APP_ROOTS);
  return path === null ? { type: "alerts" } : { type: "route", href: path };
}

/** Whether a push is a new job offer, so the open offer lists refresh at once. */
export function isOfferPush(data: PushPayload): boolean {
  return isOfferCreatedPush(data) || offerIdOf(data) !== null || data.purpose === "partner.offer";
}
