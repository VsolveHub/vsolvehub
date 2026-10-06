// Ported from frontend/apps/customer/features/notifications/model/feed.ts
import type { Schemas } from "@vsolve/api-client";

import { engagementHref, requestHref, requestQuotesHref } from "@/lib/routes";

/**
 * What a notice is called, and where it leads — contract 1.34.0.
 *
 * Pure and React-free on purpose. Both answers here are the kind that fail
 * silently in a component: an accessible name that omits the count leaves a
 * screen-reader user with a button that never changes, and a href built by
 * string concatenation from an unrecognised `kind` produces a link to a 404 that
 * looks exactly like a link to a record. Neither shows up in a screenshot, so
 * both live where a test can reach them without a DOM.
 *
 * ## `target` is not a URL, and null is a real answer
 *
 * The server publishes `{kind, id}` and deliberately not a path, because the
 * route for one aggregate differs per app — the Customer's `/requests/{id}` is
 * the Partner's invitation and Operations' queue row. Resolving it here is what
 * keeps the server out of the business of knowing this app's routing table.
 *
 * `null` means the notice **leads nowhere**, and that is a state the server
 * states rather than an omission: a payout-failed or account-level notice is
 * about no single record. `targetHref` returns `null` for it, and the row is
 * expected to render as text rather than inventing a destination — sending
 * somebody to `/requests` because we had nothing better would be a guess
 * dressed as a link.
 *
 * ## Why an unknown `kind` is also null
 *
 * `NotificationTarget.kind` is published as `string`, not an enum, so the
 * server may add a kind this build has never heard of. A row for it still shows
 * its title, body and time — the notice is not hidden — but it is not a link,
 * because the only href this app could build for an unknown kind is one it
 * guessed. That is the same rule `request-timeline.tsx` applies to an event type
 * it does not recognise: render it, dated and neutral, rather than dropping it.
 */

export type NotificationTarget = Schemas["NotificationTarget"];

/**
 * The kinds this build can route, and the route each one takes.
 *
 * A table rather than a `switch` so the set is enumerable — the test asserts
 * every published kind resolves, and adding a kind to the contract without
 * adding it here is then a visible gap rather than a silent fallthrough.
 */
const HREF_BY_KIND: Record<string, (id: string) => string> = {
  ENGAGEMENT: engagementHref,
  REQUIREMENT: requestHref,
  // Both ids here are requirement ids; the kinds differ only in where the notice
  // wants to land. The server chooses `REQUIREMENT_QUOTES` for the two notices
  // that are about quotes rather than about the request — a vendor's quote
  // arriving, and the unlock that was paid to read it — because "unlock to read
  // the full quote" pointing at the request page is a link the reader still has
  // to navigate from.
  REQUIREMENT_QUOTES: requestQuotesHref,
};

/**
 * Where a notice points, or `null` when it points nowhere this app can go.
 *
 * Never throws and never guesses. The two null cases mean different things to a
 * reader — "this notice is not about a record" and "this notice is about a
 * record this build does not know" — and they are deliberately collapsed here,
 * because the row renders identically for both: present, dated, unlinked.
 */
export function targetHref(target: NotificationTarget | null): string | null {
  if (target === null) return null;

  const build = HREF_BY_KIND[target.kind];
  if (build === undefined) return null;

  // An empty id would build `/requests/` — the list, not the record — which is
  // the quiet mis-navigation this guard exists for.
  if (target.id.length === 0) return null;

  return build(target.id);
}

/**
 * The bell's accessible name, count included.
 *
 * The count belongs in the *name* rather than in a separate live region. A
 * visually shown badge that is not in the accessible name gives a screen-reader
 * user a button called "Notifications" that says the same thing whether three
 * things are waiting or none.
 *
 * `null` is "we do not know yet" — the count read is pending, or it failed —
 * and it is a distinct answer from `0`. Rendering "none unread" over a failed
 * read would be a fake count, and it is the worst one to fake: it says nothing
 * is waiting, which is the answer that makes somebody stop looking.
 */
export function unreadBadgeLabel(count: number | null): string {
  if (count === null) return "Notifications";
  if (count <= 0) return "Notifications, none unread";
  return `Notifications, ${count} unread`;
}

/** Above this the badge shows `99+`; the accessible name still carries the truth. */
const MAX_BADGE_DISPLAY = 99;

/**
 * The digits drawn in the badge, or `null` when there is no badge to draw.
 *
 * Capped because a four-digit count would push the badge out of the button, and
 * truncating it in CSS would render `128` as `12`. The cap is a display
 * decision only: `unreadBadgeLabel` is unbounded, so the exact number is always
 * available to anyone reading the name rather than the pixels.
 */
export function unreadBadgeDisplay(count: number | null): string | null {
  if (count === null || count <= 0) return null;
  return count > MAX_BADGE_DISPLAY ? `${MAX_BADGE_DISPLAY}+` : String(count);
}

/** True once the server has stamped `read_at`. The client never decides this. */
export function isUnread(notification: { read_at: string | null }): boolean {
  return notification.read_at === null;
}
