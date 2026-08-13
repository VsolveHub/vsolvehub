"use client";

import { describeError } from "@vsolve/query";
import { ErrorState } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * The one place a refusal is rendered on the M2 money surfaces.
 *
 * ## The two fail-closed codes are now in the error table, and this got smaller
 *
 * `m2_access_price_unavailable` and `m2_policy_unavailable` are `409`s that
 * arrive on a **well-formed request**, because every owner-blocked value in M2
 * fails closed by design: no effective price row means nothing can be sold, and
 * an unset cap or disposition rule means a promise the platform has not decided
 * how to keep. Neither is a field error and neither is retryable.
 *
 * Wave A2 wrote two branches here with hand-authored copy, because the frozen
 * `errors.ts` carried neither code and `describeError` therefore offered "Choose
 * another option" — the one piece of advice that is wrong on an unset owner
 * decision, since there is no other option and pressing anything changes
 * nothing. The §7 request was granted at the Wave I gate: **both codes now map
 * to `contact_support`**, and the two branches are gone rather than left as a
 * second, drifting copy of a rule the error layer already states. Three
 * transition refusals landed as `choose_again` in the same change.
 *
 * ## What remains, and why the component still exists
 *
 * One rule the error layer cannot express: **an action is offered only when the
 * caller passes one.** `describeError` always returns an `action`, and rendering
 * it unconditionally is how "Try again" appears on a refusal that will refuse
 * every time. `onRetry` is therefore opt-in per call site, and the support route
 * is rendered beneath rather than as the primary action — contacting support is
 * a choice, not the next step in a flow.
 */

export interface AccessRefusalProps {
  error: unknown;
  /** What the Customer was trying to do, for the sentence. "unlock these quotes". */
  attempting: string;
  /** The support route. This feature owns no URL. */
  supportAction?: ReactNode;
  /** Offered only for refusals that a second attempt can genuinely clear. */
  onRetry?: () => void;
  inline?: boolean;
}

export function AccessRefusal({
  error,
  attempting,
  supportAction,
  onRetry,
  inline = true,
}: AccessRefusalProps) {
  if (error === null || error === undefined) return null;

  const presentation = describeError(error, "financial");
  const isSupportOnly = presentation.action?.intent === "contact_support";

  return (
    <div>
      <ErrorState
        title={presentation.title}
        // `attempting` names what the Customer was doing, because the server's
        // message describes the refusal and not the screen it landed on.
        message={
          isSupportOnly
            ? `${presentation.message} We could not let you ${attempting}, and this is not something trying again will fix.`
            : presentation.message
        }
        severity={presentation.severity}
        // `ErrorState` renders `actionLabel`/`onAction` as a pair, so omitting
        // both is how a state says "there is nothing to press".
        actionLabel={onRetry === undefined ? undefined : (presentation.action?.label ?? "Try again")}
        onAction={onRetry}
        reference={presentation.reference}
        inline={inline}
      />
      {supportAction !== undefined ? <div className="mt-3">{supportAction}</div> : null}
    </div>
  );
}
