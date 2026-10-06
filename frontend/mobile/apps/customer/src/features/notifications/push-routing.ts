// Customer push tap routing. targetHref first; unknown opens notifications.
import type { Schemas } from "@vsolve/api-client";

import { targetHref } from "./model/feed";

export type PushTarget = { kind: string; id?: string } | null;

export function resolveCustomerPush(target: PushTarget): { type: "route"; href: string } | { type: "notifications" } {
  if (target && typeof target.id === "string") {
    const href = targetHref(target as Schemas["NotificationTarget"]);
    if (href) return { type: "route", href };
  }
  return { type: "notifications" };
}
