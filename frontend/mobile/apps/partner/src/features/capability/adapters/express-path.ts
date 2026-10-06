// Ported from frontend/apps/partner/features/capability/adapters/express-path.ts
import type { Schemas } from "@vsolve/api-client";

import type { BusinessProfile } from "./wire";

/**
 * The short way in: phone, name, one service, one city — then real demand.
 *
 * Closes `M2-FE-101`, and holds the line on `FLOW-06`.
 *
 * ## The budget is the specification
 *
 * `03-frontend-tasks.md` fixes it: *Partner steps before seeing a real lead —
 * phone, name, one service, one city.* Four. Not "about four", and not four plus
 * a small one. `MAX_STEPS_TO_DEMAND` is asserted by a test rather than written in
 * a comment, because a budget nobody can fail is a preference.
 *
 * Business type rides on the identity step rather than taking one of its own.
 * `M2-FE-103` puts it on the entry path and the budget has no room for it, and
 * those only look like a contradiction: it is one radio group beside the name
 * field, on a screen the Partner was already filling in. A fifth screen for
 * three options would be the regression.
 *
 * ## What this path is not
 *
 * It is not a second onboarding tree. The existing `/apply` steps are the same
 * records at the same endpoints — this selects the shortest subset of them that
 * ends somewhere useful, and everything else (documents, agreements, hours,
 * skills, experience) is asked for later, at the moment it becomes necessary.
 * A second tree is how two definitions of "verified" appear, which is why
 * `08-frontend-information-architecture.md` §2 requires registration to stay on
 * `/apply`.
 *
 * It is also not a gate. Reaching the end of this path proves nothing and
 * authorizes nothing; it earns a look at *masked* demand. KYC is still checked
 * at the first accept (`gates.ts`), and the capability is still reviewed.
 */

type Application = Schemas["PartnerApplication"];

export type ExpressStepKey = "PHONE" | "IDENTITY" | "SERVICE" | "AREA";

export interface ExpressStep {
  readonly key: ExpressStepKey;
  readonly href: string;
  readonly label: string;
  /** What the Partner is told they are giving, in one short line. */
  readonly ask: string;
}

/**
 * The whole path, in order.
 *
 * `PHONE` is listed even though `/login` is not part of `/apply`: it is a step
 * the person experiences, and a budget that quietly excludes the step everyone
 * finds hardest is not measuring the thing it claims to.
 */
export const EXPRESS_PATH: readonly ExpressStep[] = [
  {
    key: "PHONE",
    href: "/login",
    label: "Your number",
    ask: "We text you a code. No password to remember.",
  },
  {
    key: "IDENTITY",
    href: "/apply/about",
    label: "Your name",
    ask: "What customers will see, and whether you work alone or run a team.",
  },
  {
    key: "SERVICE",
    href: "/apply/work",
    label: "One service",
    ask: "Pick one thing you do. You can add more later.",
  },
  {
    key: "AREA",
    href: "/apply/areas",
    label: "One city",
    ask: "Where you want work. You can add more later.",
  },
] as const;

/** The hard limit from the flow-weight table. Exceeding it is a design regression. */
export const MAX_STEPS_TO_DEMAND = 4;

/** Where the path ends: masked live requirement summaries. */
export const DEMAND_HREF = "/apply/demand";

export interface ExpressProgress {
  /** Signed in — the session, not the application. */
  readonly hasPhone: boolean;
  readonly application: Application | null;
  /** `null` when the Partner has no business profile yet, which is the default. */
  readonly businessProfile: BusinessProfile | null;
}

/**
 * Whether one step is done.
 *
 * Each check is the *minimum* the step claims to collect, never the full M1
 * requirement. `SERVICE` is satisfied by one service variant, not by the skills,
 * documents and consents `readiness.ts` needs before review — deferring those is
 * the entire point, and reusing the submission checklist here would rebuild the
 * long path under a short name.
 *
 * `IDENTITY` does not require a business profile. It is genuinely optional: the
 * server defaults a Partner to `INDIVIDUAL`, so someone who skipped the radio
 * group has an answer, and blocking on an explicit choice would add back the
 * step this design just removed.
 */
export function isStepComplete(step: ExpressStepKey, progress: ExpressProgress): boolean {
  const application = progress.application;

  switch (step) {
    case "PHONE":
      return progress.hasPhone;
    case "IDENTITY":
      return (application?.display_name.trim().length ?? 0) > 0;
    case "SERVICE":
      return (application?.service_variant_ids.length ?? 0) > 0;
    case "AREA":
      return (application?.service_area_ids.length ?? 0) > 0;
  }
}

/**
 * The first step still outstanding, or null when demand is reachable.
 *
 * First-outstanding rather than furthest-reached, so someone who filled in a
 * later screen and lost an earlier one is sent back to the gap instead of
 * forward to a dead end. That is also what makes the path resumable across a
 * dropped connection or a new device without storing any local progress —
 * `M2-FE-108`'s draft persistence is the server record, and this reads it.
 */
export function nextExpressStep(progress: ExpressProgress): ExpressStep | null {
  return EXPRESS_PATH.find((step) => !isStepComplete(step.key, progress)) ?? null;
}

/** True when the Partner has earned the masked demand screen. */
export function canSeeDemand(progress: ExpressProgress): boolean {
  return nextExpressStep(progress) === null;
}

/** How many steps remain. Shown as "2 left", which is the only honest progress claim. */
export function stepsRemaining(progress: ExpressProgress): number {
  return EXPRESS_PATH.filter((step) => !isStepComplete(step.key, progress)).length;
}

/**
 * Where to send the Partner next.
 *
 * One function so the entry card, the post-save continue and the resume link
 * cannot disagree. They previously could: the M1 `/apply` shell held the order
 * and the editor held none, which is how a button labelled "continue" did not
 * continue (`model/steps.ts`). One answer, three callers.
 */
export function expressDestination(progress: ExpressProgress): string {
  return nextExpressStep(progress)?.href ?? DEMAND_HREF;
}

/* ---------------------------------------------------------------------------
   View model
   --------------------------------------------------------------------------- */

export interface ExpressStepView {
  readonly key: ExpressStepKey;
  readonly href: string;
  readonly label: string;
  readonly ask: string;
  readonly isComplete: boolean;
  /** The one step the Partner is on. At most one is true. */
  readonly isCurrent: boolean;
}

export interface ExpressPathView {
  readonly steps: readonly ExpressStepView[];
  readonly remaining: number;
  readonly destination: string;
  readonly canSeeDemand: boolean;
}

/**
 * The path as something a screen can render.
 *
 * Exists so no component imports `ExpressProgress` — which holds a server
 * payload — and so the "which step am I on" answer is computed once. Two
 * components deciding that independently is how a checklist highlights one step
 * and a button navigates to another.
 */
export function describeExpressPath(progress: ExpressProgress): ExpressPathView {
  const current = nextExpressStep(progress);

  return {
    steps: EXPRESS_PATH.map((step) => ({
      key: step.key,
      href: step.href,
      label: step.label,
      ask: step.ask,
      isComplete: isStepComplete(step.key, progress),
      isCurrent: current?.key === step.key,
    })),
    remaining: stepsRemaining(progress),
    destination: expressDestination(progress),
    canSeeDemand: current === null,
  };
}
