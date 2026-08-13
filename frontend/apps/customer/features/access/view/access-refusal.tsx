"use client";

import { isAccessPriceUnavailable, isPolicyUnavailable, describeError } from "@vsolve/query";
import { ErrorState } from "@vsolve/ui";
import type { ReactNode } from "react";

/**
 * The two refusals that arrive on a **well-formed request**, and how they read.
 *
 * `m2_access_price_unavailable` and `m2_policy_unavailable` are `409`s, neither
 * is a field error and neither is retryable by the Customer. They exist because
 * every owner-blocked value in M2 fails closed by design: no effective price row
 * means nothing can be sold, and an unset cap or disposition rule means a
 * promise the platform has not decided how to keep.
 *
 * ## Why they are handled here rather than in the error layer
 *
 * `packages/api-client/src/errors.ts` is frozen and carries neither code, so
 * `ApiRequestError.recovery` falls back to `defaultRecoveryForStatus(409)` and
 * `describeError` offers **"Choose another option"** — advice that is wrong in
 * the one direction that matters, because there is no other option and pressing
 * anything changes nothing. Adding both codes to the table is requested in
 * `frontend-execution-plan.md` §7; until that lands, every screen in this wave
 * routes its refusals through this component so the wrong affordance cannot
 * appear.
 *
 * ## What the copy may and may not say
 *
 * It may say we cannot offer this yet and that support can help. It may not
 * apologise for a fault the Customer might think is theirs, and it may not
 * offer a retry — a "Try again" on a missing price row teaches somebody to
 * press a button that will refuse them every time.
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

  if (isAccessPriceUnavailable(error)) {
    return (
      <UnavailableNotice
        title="We cannot offer this yet"
        message={`We have not set a price for this, so we cannot let you ${attempting}. Nothing has been charged. This is on us to finish, not something you can fix by trying again.`}
        supportAction={supportAction}
        inline={inline}
      />
    );
  }

  if (isPolicyUnavailable(error)) {
    return (
      <UnavailableNotice
        title="We cannot do that yet"
        message={`We have not finished setting the rules this depends on, so we cannot ${attempting}. Nothing has been charged and nothing has changed.`}
        supportAction={supportAction}
        inline={inline}
      />
    );
  }

  const presentation = describeError(error, "financial");
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      actionLabel={onRetry === undefined ? undefined : (presentation.action?.label ?? "Try again")}
      onAction={onRetry}
      reference={presentation.reference}
      inline={inline}
    />
  );
}

/**
 * A refusal with no action on it.
 *
 * `ErrorState` renders `actionLabel`/`onAction` as a pair, so omitting both is
 * how a state says "there is nothing to press". The support route is rendered
 * beneath rather than as the primary action, because contacting support is a
 * choice and not the next step in a flow.
 */
function UnavailableNotice({
  title,
  message,
  supportAction,
  inline,
}: {
  title: string;
  message: string;
  supportAction?: ReactNode;
  inline: boolean;
}) {
  return (
    <div>
      <ErrorState title={title} message={message} severity="warning" inline={inline} />
      {supportAction !== undefined ? <div className="mt-3">{supportAction}</div> : null}
    </div>
  );
}
