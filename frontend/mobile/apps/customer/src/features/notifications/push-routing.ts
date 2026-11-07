// Customer push tap routing. targetHref first; unknown opens notifications.
import type { Schemas } from "@vsolve/api-client";
import type { PushPayload } from "@vsolve/mobile-core";
import { pushedAppPath } from "@vsolve/mobile-core/push-routing";

import { targetHref } from "./model/feed";

/** The customer app's top-level routes, the ones a pushed web link may open. */
const CUSTOMER_APP_ROOTS = [
  "/account",
  "/activity",
  "/book",
  "/bookings",
  "/cart",
  "/catalog",
  "/checkout",
  "/engagements",
  "/jobs",
  "/listings",
  "/projects",
  "/rentals",
  "/requests",
  "/stays",
] as const;

/**
 * Where a tapped OneSignal notification opens: the feed's own target, then the web link's screen
 * when the app has it, else the notifications panel.
 */
export function resolveCustomerPushData(data: PushPayload): { type: "route"; href: string } | { type: "notifications" } {
  const target = data.target as PushTarget | undefined;
  if (target) {
    const destination = resolveCustomerPush(target);
    if (destination.type === "route") return destination;
  }
  const path = pushedAppPath(data.url, CUSTOMER_APP_ROOTS);
  return path === null ? { type: "notifications" } : { type: "route", href: path };
}

export type PushTarget = { kind: string; id?: string } | null;

export function resolveCustomerPush(target: PushTarget): { type: "route"; href: string } | { type: "notifications" } {
  if (target && typeof target.id === "string") {
    const href = targetHref(target as Schemas["NotificationTarget"]);
    if (href) return { type: "route", href };
  }
  return { type: "notifications" };
}
