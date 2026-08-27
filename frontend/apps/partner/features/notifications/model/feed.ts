import type { Schemas } from "@vsolve/api-client";

/**
 * The two decisions the notification bell makes without a server round trip:
 * what the badge is *called*, and where a notice *leads*.
 *
 * Pure, and deliberately so. Both are decisions a test can pin down exactly, and
 * both are the kind that go wrong quietly — an accessible name that says "3"
 * without saying what three of, and a link that 404s a month after the notice
 * arrived.
 *
 * ## Django publishes a target, never a URL, and that is the right split
 *
 * `NotificationSerializer.get_target` returns `{kind, id}` and its docstring says
 * why: "the customer and partner apps route the same engagement to different
 * paths. Publishing a URL here would make Django the owner of two route tables it
 * cannot see." So this file is the Partner half of that contract. The Customer app
 * owns its own, and neither can break the other.
 *
 * ## `null` is an answer, not a missing value
 *
 * The serializer returns `null` for a notice with nothing specific behind it, and
 * says plainly that "a notice about a closed request that no longer has a page to
 * open should lead nowhere rather than to a 404". `targetHref` returns `null` for
 * the same reason and in three more cases below. A row with no link is a complete
 * row: `title` and `body` are rendered server-side from `templates_registry` and
 * already say what happened.
 */

export type NotificationTarget = Schemas["NotificationTarget"];

/* ---------------------------------------------------------------------------
   The badge
   --------------------------------------------------------------------------- */

/**
 * Past this the badge stops being a number and becomes "a lot".
 *
 * Two digits is what fits inside a pill on the top bar of a 360px Android
 * viewport without pushing the Sign Out button off the row. The *accessible*
 * name never caps — a screen-reader user gets the real figure, because nothing
 * about the count is expensive to say out loud.
 */
const BADGE_DISPLAY_CAP = 99;

/**
 * What the badge shows, or `null` where it must show nothing.
 *
 * `null` covers both "we have not asked yet" and "the ask failed", and they are
 * the same rendering on purpose: a zero drawn because a request is in flight is a
 * claim about somebody's inbox that nothing has checked. No badge is the honest
 * state, and the bell is still there to press.
 */
export function unreadBadgeDisplay(count: number | null): string | null {
  if (count === null || count <= 0) return null;
  return count > BADGE_DISPLAY_CAP ? `${BADGE_DISPLAY_CAP}+` : String(count);
}

/**
 * The bell's accessible name, carrying the count inside it.
 *
 * One name rather than a name plus a separate live region. The badge is a visual
 * digit with no meaning of its own — "3" beside a bell glyph is not a sentence —
 * so the count belongs in the control's own name, where it is read on focus and
 * re-read whenever it changes.
 *
 * The unknown case says "Notifications" and stops. It does **not** say "0 unread"
 * or "unread count unavailable": the first is a lie and the second is an error
 * message dressed as a label, on a control that still works.
 */
export function unreadBadgeLabel(count: number | null): string {
  if (count === null) return "Notifications";
  if (count <= 0) return "Notifications, nothing unread";
  return `Notifications, ${count} unread`;
}

/* ---------------------------------------------------------------------------
   Where a notice leads
   --------------------------------------------------------------------------- */

/**
 * Where a Partner should be sent for one notice, or `null` for nowhere.
 *
 * ## Every path here is a live route, not one that redirects
 *
 * This used to compose `/workforce/shifts/{id}`, `/projects/stages/{id}`,
 * `/workforce/enquiries/{id}` and `/projects/enquiries/{id}`. All four are
 * **308 redirects** in `next.config.ts` today, so every notification a Partner
 * tapped cost an extra round trip before it landed anywhere — on the surface
 * whose entire purpose is to be the shortest path to the work. The paths below
 * are the destinations those redirects point at.
 *
 * ## The archetype ambiguity is gone, because the route table changed
 *
 * `NotificationTarget` is `{kind, id}` and carries no archetype. That used to
 * matter enormously: an A3 shift booking and an A5 project were both
 * `ENGAGEMENT` and went to two different screens with deliberately different
 * vocabulary, so a Partner holding **both** capabilities got `null` and an
 * unlinked row rather than a coin-flip that might describe their project in
 * shift-days.
 *
 * `/work/jobs/[id]` resolves both kinds itself. Its own docblock — "One route,
 * two record kinds" — describes asking the engagement endpoint first precisely
 * because that is the one of the two reads that can honestly answer "not mine".
 * So the client no longer has to know which lifecycle an id belongs to, and the
 * documented gap this function used to carry closes without the server
 * publishing anything new.
 *
 * `workspaceKeys` is therefore no longer read. It stays in the signature
 * because the surrounding contract still passes it and because the next
 * target kind may well need it — but nothing routes on a capability any more,
 * and no caller has to get it right for a link to work.
 *
 * ## `REQUIREMENT` leads nowhere on this side, and that is not a bug
 *
 * There is no Partner route keyed by a requirement id. A Partner's door into a
 * customer request is the **invitation**, and an invitation id is not a
 * requirement id, so composing that path would produce a URL that resolves to a
 * 404 or, worse, to somebody else's enquiry. The two requirement-scoped notices
 * a Partner can receive (`m2_proposal_selected`, `m2_proposal_rejected`) both
 * carry their own answer in the body, and the Work tab is where the follow-up
 * lives.
 */
export function targetHref(
  target: NotificationTarget | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  workspaceKeys: readonly string[] = [],
): string | null {
  if (target === null) return null;
  if (target.kind === "PROJECT_INVITATION") return `/work/enquiries/${target.id}`;
  if (target.kind === "WORKFORCE_INVITATION") return `/work/enquiries/${target.id}`;
  if (target.kind === "ENGAGEMENT") return `/work/jobs/${target.id}`;
  return null;
}

/** True once this notice has been read. `read_at` is the record; nothing local overrides it. */
export function isUnread(notification: Pick<Schemas["Notification"], "read_at">): boolean {
  return notification.read_at === null;
}
