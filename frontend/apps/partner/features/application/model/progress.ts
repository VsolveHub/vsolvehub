import type { Schemas } from "@vsolve/api-client";

import { requirements, type Requirement } from "./readiness";
import { getApplicationSteps, type ApplicationStep } from "./steps";
import { isRentalPartner } from "./rental";

/**
 * How far through the application somebody actually is.
 *
 * ## Why this exists
 *
 * The onboarding navigation was a horizontally scrolling strip of eight
 * identical chips. It marked the current step and nothing else — so it could not
 * answer either of the two questions an applicant asks constantly: *how much is
 * left*, and *which of these have I already done*. On a 360px phone about three
 * chips are visible at a time, which means the answer to "where am I" required
 * scrolling a navigation bar sideways to look for a highlight.
 *
 * ## Completion is derived, never declared
 *
 * There is deliberately no second table mapping steps to "done". `requirements`
 * already knows what the application needs and which step satisfies each item —
 * it carries an `href` per requirement precisely so the readiness summary can be
 * actionable. This groups those same requirements by that same `href`.
 *
 * The consequence worth stating: a step is complete exactly when the things it
 * collects are present on the server's own record. It is never complete because
 * somebody visited it, and never incomplete because they have not. An applicant
 * who filled in their name on a previous device sees "About you" as done, which
 * is the truth.
 *
 * ## Steps that collect nothing required
 *
 * `/apply/schedule` has no entry in `requirements` — hours are genuinely
 * optional at review time, and Django does not refuse a submission without them.
 * Grouping alone would therefore report it complete (zero requirements, zero
 * unmet), which would be a lie of the most annoying kind: a tick against
 * something the applicant has not done.
 *
 * So a step with no requirements is `optional`, a third state, rendered as
 * neither done nor outstanding. `/apply` and `/apply/review` are `waypoint` for
 * the same reason in reverse — they collect nothing because they are the way in
 * and the way out, not stops on the path.
 */

type Application = Schemas["PartnerApplication"];

export type StepState =
  /** Everything this step collects is on the record. */
  | "done"
  /** This step collects something required and the record does not have it. */
  | "todo"
  /** Collects nothing required. Worth doing, never blocking. */
  | "optional"
  /** The overview and the review screen: not stops on the path. */
  | "waypoint";

export interface StepProgress extends ApplicationStep {
  readonly state: StepState;
  /** The requirements this step is responsible for. Empty for the two waypoints. */
  readonly requirements: readonly Requirement[];
  /** How many of them are still missing. */
  readonly outstanding: number;
}

/** Steps that bracket the path rather than sitting on it. */
const WAYPOINTS: readonly string[] = ["/apply", "/apply/review"];

export function stepProgress(application: Application | null): StepProgress[] {
  /*
    `requirements` takes `null` directly and reports everything unmet.

    This used to substitute an empty array for the no-application case, which
    silently broke the grouping below: with nothing to group, every step matched
    zero requirements and therefore fell through to `optional` — so a brand-new
    applicant saw a bar reading "everything is filled in". Asking the one source
    of truth what an application *needs*, rather than inferring it from what one
    *has*, removes that whole class of mistake.
  */
  const met = requirements(application);
  const isRental = isRentalPartner(application?.skill_codes ?? []);
  const steps = getApplicationSteps(isRental);

  return steps.map((step) => {
    const mine = met.filter((requirement) => requirement.href === step.href);
    const outstanding = mine.filter((requirement) => !requirement.isMet).length;

    const state: StepState = WAYPOINTS.includes(step.href)
      ? "waypoint"
      : mine.length === 0
        ? "optional"
        : outstanding === 0
          ? "done"
          : "todo";

    return { ...step, state, requirements: mine, outstanding };
  });
}

export interface ProgressSummary {
  /** Steps that collect something required. The denominator an applicant counts in. */
  readonly total: number;
  readonly done: number;
  /** 0–1, for a progress bar. `total` is never zero, so this needs no guard. */
  readonly fraction: number;
  /** The first step still needing something, or `null` when the path is clear. */
  readonly nextIncomplete: StepProgress | null;
}

/**
 * The one-line answer: how much of this is finished.
 *
 * Counts only the steps that gate a submission. Including the overview, the
 * review screen and the optional hours step would make "3 of 8" mean something
 * different from "3 things left to do", and the applicant would be reading two
 * numbers that never agree.
 */
export function progressSummary(application: Application | null): ProgressSummary {
  const steps = stepProgress(application);
  const gating = steps.filter((step) => step.state === "done" || step.state === "todo");
  const done = gating.filter((step) => step.state === "done").length;

  return {
    total: gating.length,
    done,
    fraction: gating.length === 0 ? 0 : done / gating.length,
    nextIncomplete: steps.find((step) => step.state === "todo") ?? null,
  };
}

/**
 * The step before this one, for a Back control.
 *
 * `nextStep` already exists in `./steps` and this is its mirror. Onboarding had
 * only a forward control and a "Back to your application" link that jumped to
 * the overview — so the one gesture an applicant reaches for after realising
 * they mistyped something on the previous screen was the one gesture the flow
 * did not offer.
 */
export function previousStep(pathname: string, isRentalOnly: boolean = false): ApplicationStep | null {
  const normalised =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const steps = getApplicationSteps(isRentalOnly);
  const index = steps.findIndex((step) => step.href === normalised);
  if (index <= 0) return null;
  return steps[index - 1] ?? null;
}
