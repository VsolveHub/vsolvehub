import type { Schemas } from "@vsolve/api-client";

import { PROJECT_WORKSPACE, WORKFORCE_WORKSPACE } from "@/features/workspace/registry";

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
 * The engagement detail route each workspace owns.
 *
 * Both route files say in their own docblocks that they are "keyed by the
 * engagement rather than by the enquiry it came from, so a notification opened
 * weeks later resolves without the request behind it" — these two paths were
 * written for exactly this link.
 */
const ENGAGEMENT_ROUTES: ReadonlyArray<readonly [workspaceKey: string, basePath: string]> = [
  [WORKFORCE_WORKSPACE, "/workforce/shifts"],
  [PROJECT_WORKSPACE, "/projects/stages"],
];

/**
 * Where a Partner should be sent for one notice, or `null` for nowhere.
 *
 * ## Why the workspace keys are an argument rather than something inferred
 *
 * `NotificationTarget` is `{kind, id}` and carries **no archetype**. An A3 shift
 * booking and an A5 project are both `ENGAGEMENT`, and the Partner app routes them
 * to different screens with deliberately different vocabulary — `/workforce/shifts`
 * speaks in shift-days, `/projects/stages` speaks in stages. `M2-FE-111` forbids
 * flattening those two into one noun, so picking the wrong one is not a cosmetic
 * miss: it is the erasure the registry exists to prevent, rendered over real work.
 *
 * The one thing that *does* narrow it is what Django authorized. A Partner holding
 * only the workforce capability has no project engagements to be notified about, so
 * their `ENGAGEMENT` targets are unambiguous — and the overwhelming majority of
 * Partners hold exactly one. The grants come from `usePartnerWorkspaceGrants`,
 * which is a server answer; this never guesses a capability from a route or a
 * category.
 *
 * ## What happens when it is genuinely ambiguous, and why it is not a guess
 *
 * A Partner holding **both** capabilities gets `null` and an unlinked row. That is
 * a real, named gap rather than an oversight: closing it needs the server to say
 * which lifecycle the engagement belongs to — an `archetype` on
 * `NotificationTarget`, or a `commercial_mode` — and until it does, the two
 * available answers are "unlinked row" and "coin-flip between two screens, one of
 * which describes the work in the wrong words". Reading the notice and opening the
 * right workspace tab is two taps. Being told your project has shift-days is a
 * support ticket.
 *
 * ## `REQUIREMENT` leads nowhere on this side, and that is not a bug
 *
 * There is no Partner route keyed by a requirement id. A Partner's door into a
 * customer request is the **invitation** — `/workforce/enquiries/[invitationId]`
 * — and an invitation id is not a requirement id, so composing that path would
 * produce a URL that resolves to a 404 or, worse, to somebody else's enquiry.
 * The two requirement-scoped notices a Partner can receive
 * (`m2_proposal_selected`, `m2_proposal_rejected`) both carry their own answer in
 * the body, and the Enquiries tab is where the follow-up lives.
 *
 * Invitation notices are different: Django publishes an explicit
 * `PROJECT_INVITATION` or `WORKFORCE_INVITATION`, because that id is the
 * Partner's actual route into the customer's request.
 */
export function targetHref(
  target: NotificationTarget | null,
  workspaceKeys: readonly string[] = [],
): string | null {
  if (target === null) return null;
  if (target.kind === "PROJECT_INVITATION") return `/projects/enquiries/${target.id}`;
  if (target.kind === "WORKFORCE_INVITATION") return `/workforce/enquiries/${target.id}`;
  if (target.kind !== "ENGAGEMENT") return null;

  const held = ENGAGEMENT_ROUTES.filter(([key]) => workspaceKeys.includes(key));
  const only = held.length === 1 ? held[0] : undefined;
  if (only === undefined) return null;

  return `${only[1]}/${target.id}`;
}

/** True once this notice has been read. `read_at` is the record; nothing local overrides it. */
export function isUnread(notification: Schemas["Notification"]): boolean {
  return notification.read_at === null;
}
