"use client";

import { Button, Card, ErrorState, Field, Input, Textarea } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { useMemo, useState } from "react";

import {
  EMPTY_A3_DRAFT,
  a3Total,
  hasErrors,
  paiseToRupeeInput,
  readCount,
  rupeesToPaise,
  toA3Request,
  validateA3,
  type A3Draft,
  type TaxBasis,
} from "../model/proposal-draft";
import { WAGE_FLOOR_NOTICE } from "../model/terms";
import { isWageFloorRefusal, useSubmitProposal, type Proposal } from "../queries";
import { ProposalTerms } from "./proposal-terms";
import { ProposalTotal } from "./proposal-total";

/**
 * The A3 workforce quote, on one screen.
 *
 * Closes `M2-FE-308`, `M2-FE-310` and `M2-FE-312`. The flow-weight budget is a
 * hard constraint here, not a target: rate per worker per day, minimum days,
 * what is included — and the two things the wire makes unavoidable, headcount
 * and tax basis. `A3_COMPOSER_FIELDS` in the draft model is the list, and
 * `a3-composer.test.tsx` asserts the rendered controls against it, so a sixth
 * field fails a test rather than passing a review.
 *
 * ## Headcount is confirmed, not asked
 *
 * `_assert_a3_shape` requires `worker_count`, so the field cannot be dropped.
 * It is prefilled from the customer's own `worker_count` answer wherever they
 * gave one, which turns it from a question into a confirmation — and a vendor
 * who can only supply four of the six asked for can say so, which is worth more
 * than a hidden assumption.
 *
 * ## The total is computed and never typed
 *
 * Rate x days x headcount. There is no total input, and after submission the
 * figure shown is Django's echoed `total_paise` rather than this arithmetic.
 *
 * ## The wage floor is stated without a number
 *
 * `M2-FE-310` asks for the floor inline. No endpoint publishes one, and the
 * server-side guard is currently unreachable over HTTP — see `model/terms.ts`.
 * So the rule is stated, no figure is invented, and the refusal is routed to the
 * rate field if one ever arrives.
 */

export interface A3ComposerProps {
  readonly invitationId: string;
  readonly requirementId: string;
  /** The customer's stated headcount, when they gave one. Prefills the field. */
  readonly suggestedWorkerCount: number | null;
  /** Revision being replaced. `0` for a first quote; keys the idempotency scope. */
  readonly supersedesRevision: number;
  readonly onSubmitted: (proposal: Proposal) => void;
}

export function A3Composer({
  invitationId,
  requirementId,
  suggestedWorkerCount,
  supersedesRevision,
  onSubmitted,
}: A3ComposerProps) {
  const [draft, setDraft] = useState<A3Draft>({
    ...EMPTY_A3_DRAFT,
    workerCount: suggestedWorkerCount,
  });
  const [inclusionsText, setInclusionsText] = useState("");
  const [attempted, setAttempted] = useState(false);

  const submit = useSubmitProposal();

  const withInclusions: A3Draft = useMemo(
    () => ({ ...draft, inclusions: inclusionsText.split("\n") }),
    [draft, inclusionsText],
  );

  const errors = useMemo(() => validateA3(withInclusions), [withInclusions]);
  const shown = attempted ? errors : {};
  const total = a3Total(withInclusions);

  const serverError = submit.error;
  const rateRefusal =
    serverError && isWageFloorRefusal(serverError)
      ? describeError(serverError, "mutation").message
      : undefined;

  const update = (patch: Partial<A3Draft>) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-text">Your quote</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          A daily rate for one worker, the smallest booking you will take, and what that covers.
        </p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (hasErrors(errors) || submit.isPending) return;
          submit.mutate(
            {
              body: toA3Request({ invitationId, draft: withInclusions }),
              supersedesRevision,
              requirementId,
              invitationId,
            },
            { onSuccess: onSubmitted },
          );
        }}
      >
        <Field
          label="Rate per worker per day"
          description="In rupees, before any tax you add below."
          required
          error={shown.ratePaisePerWorkerDay ?? rateRefusal}
        >
          <Input
            type="text"
            inputMode="decimal"
            value={paiseToRupeeInput(draft.ratePaisePerWorkerDay)}
            onChange={(event) =>
              update({ ratePaisePerWorkerDay: rupeesToPaise(event.target.value) })
            }
            placeholder="900"
            disabled={submit.isPending}
          />
        </Field>

        <p className="text-xs leading-5 text-text-muted">{WAGE_FLOOR_NOTICE}</p>

        <Field
          label="Minimum days"
          description="The shortest booking you will take at this rate."
          required
          error={shown.minimumDays}
        >
          <Input
            type="text"
            inputMode="numeric"
            value={draft.minimumDays === null ? "" : String(draft.minimumDays)}
            onChange={(event) => update({ minimumDays: readCount(event.target.value) })}
            placeholder="2"
            disabled={submit.isPending}
          />
        </Field>

        <Field
          label="Workers you can supply"
          description={
            suggestedWorkerCount === null
              ? "The customer did not say how many they need."
              : `The customer asked for ${suggestedWorkerCount}. Change it if you can supply a different number.`
          }
          required
          error={shown.workerCount}
        >
          <Input
            type="text"
            inputMode="numeric"
            value={draft.workerCount === null ? "" : String(draft.workerCount)}
            onChange={(event) => update({ workerCount: readCount(event.target.value) })}
            disabled={submit.isPending}
          />
        </Field>

        <Field
          label="What the rate includes"
          description="One thing per line — tools, transport, supervision, whatever the customer would otherwise assume."
          required
          error={shown.inclusions}
        >
          <Textarea
            value={inclusionsText}
            onChange={(event) => setInclusionsText(event.target.value)}
            rows={3}
            placeholder={"Own tools\nTransport to site"}
            disabled={submit.isPending}
          />
        </Field>

        <ProposalTerms
          taxBasis={draft.taxBasis}
          onTaxBasisChange={(basis: TaxBasis | null) => update({ taxBasis: basis })}
          taxPaise={draft.taxPaise}
          onTaxPaiseChange={(paise) => update({ taxPaise: paise })}
          errors={shown}
          disabled={submit.isPending}
        />

        <ProposalTotal
          derivedPaise={total}
          basis={
            draft.minimumDays !== null && draft.workerCount !== null
              ? `${draft.workerCount} ${draft.workerCount === 1 ? "worker" : "workers"} for ${draft.minimumDays} ${draft.minimumDays === 1 ? "day" : "days"}`
              : "rate x days x workers"
          }
        />

        {serverError && !rateRefusal ? (
          <ErrorState
            inline
            title={describeError(serverError, "mutation").title}
            // Django's own sentence, verbatim. `m2_proposal_invalid_shape`
            // carries three different causes and the message is the only thing
            // that tells them apart — including which tax basis another vendor
            // already fixed for this request.
            message={describeError(serverError, "mutation").message}
            severity={describeError(serverError, "mutation").severity}
            reference={describeError(serverError, "mutation").reference}
          />
        ) : null}

        <Button
          type="submit"
          block
          disabled={submit.isPending}
          loading={submit.isPending}
          loadingLabel="Sending your quote"
        >
          {supersedesRevision > 0 ? "Send a revised quote" : "Send quote"}
        </Button>

        <p className="text-xs leading-5 text-text-muted">
          {supersedesRevision > 0
            ? "Your previous quote is kept on the record and marked replaced. The customer sees the new one."
            : "You can send a revised quote later. Nothing is ever overwritten, so the customer can always see what they were first offered."}
        </p>
      </form>
    </Card>
  );
}
