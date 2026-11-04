// Partner push tap routing. targetHref first, then the push-only kinds.
import type { Schemas } from "@vsolve/api-client";

import { targetHref } from "./model/feed";

export type PushTarget = { kind: string; id?: string } | null;

export type PushDestination =
  | { readonly type: "route"; readonly href: string }
  | { readonly type: "alerts" };

export function resolvePartnerPush(target: PushTarget): PushDestination {
  if (target && "id" in target && typeof target.id === "string") {
    const href = targetHref(target as Schemas["NotificationTarget"]);
    if (href) return { type: "route", href };
  }
  if (target?.kind === "DISPATCH_OFFER" && "id" in target && target.id) {
    return { type: "route", href: `/dispatch/${target.id}` };
  }
  if (target?.kind === "PARTNER_OFFERS") return { type: "route", href: "/work/offers" };
  if (target?.kind === "PARTNER_WORK") return { type: "route", href: "/work/all" };
  if (
    target?.kind === "APPLICATION" ||
    target?.kind === "PARTNER_APPLICATION" ||
    target?.kind === "APPLICATION_APPROVED" ||
    target?.kind === "APPLICATION_DECLINED" ||
    target?.kind === "PARTNER_APPLICATION_DECLINED"
  ) {
    return { type: "route", href: "/apply/status" };
  }
  if (target?.kind === "APPLICATION_DOCUMENT" || target?.kind === "DOCUMENT_REUPLOAD") {
    return { type: "route", href: "/apply/documents" };
  }
  return { type: "alerts" };
}

export function isOfferCreatedPush(data: { purpose?: unknown } | null | undefined): boolean {
  return data?.purpose === "partner.offer_created";
}
