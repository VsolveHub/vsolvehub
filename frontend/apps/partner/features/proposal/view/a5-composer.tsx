"use client";

import { Button, Card, ErrorState, Field, Input, Textarea, formatMoney } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  EMPTY_A5_DRAFT,
  EMPTY_STAGE,
  a5Total,
  hasErrors,
  paiseToRupeeInput,
  rupeesToPaise,
  toA5Request,
  validateA5,
  type A5Draft,
  type StageDraft,
  type TaxBasis,
} from "../model/proposal-draft";
import { useSubmitProposal, type Proposal } from "../queries";
import { ProposalTerms } from "./proposal-terms";
import { ProposalTotal } from "./proposal-total";

/**
 * The A5 project quote: stages, what each one delivers, and the terms around
 * them.
 *
 * ## Not mounted, as of revision 3 — and kept rather than deleted
 *
 * ADR-0008 makes A5 **visit-first**: an estimate must reference a `COMPLETED`
 * site visit, and `m2_visit_not_completed` (reachable since 1.24.0 published
 * `site_visit_id`) refuses one that does not. This composer sends no visit, so
 * mounting it would be offering a vendor a long form the server now declines.
 * `features/proposal/view/onsite-composer.tsx` replaced it on the A5 route.
 *
 * It stays in the tree because the remote path is retired at the *flow* level
 * and not on the wire — `POST /proposals/` still accepts a submission without a
 * visit, which is what an Operations-assisted capture would use — and because
 * deleting a composer to re-derive it at Wave B4 is worse than an unmounted file
 * that says why it is unmounted.
 *
 * Closes `M2-FE-309`. Longer than the A3 composer on purpose — a project quote
 * is what the customer compares against two others and what the engagement's
 * stages are later funded from, so the flow-weight budget names only the A3
 * response as one screen.
 *
 * ## Stages are the line items
 *
 * There is no separate line-item field on the wire, and adding one would mean
 * inventing a second unpublished structure beside the one already invented for
 * stages. Each stage carries what it delivers and what it costs, and
 * `_assert_a5_shape` reconciles the amounts against the total — which makes the
 * stage list the only part of an A5 quote the server actually checks.
 *
 * ## Two fields `M2-FE-309` names and the wire does not carry
 *
 * **Assumptions.** `ProposalCreateRequest` has `inclusions`, `exclusions`,
 * `warranty_terms` and `valid_until` — and nothing for assumptions. A DRF
 * serializer silently drops unknown keys, so a field here would take a vendor's
 * caveats and discard them without an error, which is worse than not offering
 * one. Not built; requested in `frontend-execution-plan.md` §7. Exclusions are
 * offered instead and are not relabelled to stand in for it — "not included"
 * and "assumed true" are different promises and a customer reads them
 * differently in a dispute.
 *
 * **Per-stage dates** are carried inside the client-authored stage shape, which
 * is the same gap as the shape itself rather than a second one.
 */

export interface A5ComposerProps {
  readonly invitationId: string;
  readonly requirementId: string;
  readonly supersedesRevision: number;
  readonly onSubmitted: (proposal: Proposal) => void;
}

export function A5Composer({
  invitationId,
  requirementId,
  supersedesRevision,
  onSubmitted,
}: A5ComposerProps) {
  const [draft, setDraft] = useState<A5Draft>(EMPTY_A5_DRAFT);
  const [inclusionsText, setInclusionsText] = useState("");
  const [exclusionsText, setExclusionsText] = useState("");
  const [attempted, setAttempted] = useState(false);

  const submit = useSubmitProposal();

  const withLines: A5Draft = useMemo(
    () => ({
      ...draft,
      inclusions: inclusionsText.split("\n"),
      exclusions: exclusionsText.split("\n"),
    }),
    [draft, inclusionsText, exclusionsText],
  );

  const errors = useMemo(() => validateA5(withLines), [withLines]);
  const shown = attempted ? errors : {};
  const total = a5Total(withLines);

  const updateStage = (index: number, patch: Partial<StageDraft>) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, position) =>
        position === index ? { ...stage, ...patch } : stage,
      ),
    }));

  const addStage = () =>
    setDraft((current) => ({ ...current, stages: [...current.stages, EMPTY_STAGE] }));

  const removeStage = (index: number) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.filter((_, position) => position !== index),
    }));

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-text">Your quote</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Break the work into stages. Vsolve holds the money for each stage and releases it once the
          customer approves that stage, so the split is what you will actually be paid against.
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
              body: toA5Request({ invitationId, draft: withLines }),
              supersedesRevision,
              requirementId,
              invitationId,
            },
            { onSuccess: onSubmitted },
          );
        }}
      >
        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Stages
          </legend>

          {draft.stages.map((stage, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-control border border-line bg-surface-sunken p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Stage {index + 1}
                </span>
                {draft.stages.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeStage(index)}
                    disabled={submit.isPending}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-text-secondary hover:text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    <Trash2 size={14} aria-hidden />
                    Remove
                    <span className="sr-only"> stage {index + 1}</span>
                  </button>
                ) : null}
              </div>

              <Field label={`Stage ${index + 1} name`} required>
                <Input
                  value={stage.title}
                  onChange={(event) => updateStage(index, { title: event.target.value })}
                  placeholder="Site preparation"
                  disabled={submit.isPending}
                />
              </Field>

              <Field
                label="What the customer gets at the end of it"
                description="This is what they approve before the money is released."
              >
                <Textarea
                  value={stage.deliverable}
                  onChange={(event) => updateStage(index, { deliverable: event.target.value })}
                  rows={2}
                  disabled={submit.isPending}
                />
              </Field>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Amount for this stage" required>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={paiseToRupeeInput(stage.amountPaise)}
                    onChange={(event) =>
                      updateStage(index, { amountPaise: rupeesToPaise(event.target.value) })
                    }
                    placeholder="25000"
                    disabled={submit.isPending}
                  />
                </Field>

                <Field label="Done by" description="Optional. Leave blank if you cannot commit.">
                  <Input
                    type="date"
                    value={stage.endsOn ?? ""}
                    onChange={(event) =>
                      updateStage(index, {
                        endsOn: event.target.value === "" ? null : event.target.value,
                      })
                    }
                    disabled={submit.isPending}
                  />
                </Field>
              </div>
            </div>
          ))}

          {shown.stages ? (
            <p role="alert" className="text-sm leading-6 text-danger-text">
              {shown.stages}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Plus size={16} aria-hidden />}
            onClick={addStage}
            disabled={submit.isPending}
          >
            Add a stage
          </Button>
        </fieldset>

        <Field
          label="What the price includes"
          description="One thing per line."
          error={shown.inclusions}
        >
          <Textarea
            value={inclusionsText}
            onChange={(event) => setInclusionsText(event.target.value)}
            rows={3}
            disabled={submit.isPending}
          />
        </Field>

        <Field
          label="What it does not include"
          description="One thing per line. Anything the customer would otherwise assume is covered."
          error={shown.exclusions}
        >
          <Textarea
            value={exclusionsText}
            onChange={(event) => setExclusionsText(event.target.value)}
            rows={3}
            disabled={submit.isPending}
          />
        </Field>

        <Field
          label="Warranty"
          description="What you stand behind after the work is signed off, and for how long."
          error={shown.warrantyTerms}
        >
          <Textarea
            value={draft.warrantyTerms}
            onChange={(event) =>
              setDraft((current) => ({ ...current, warrantyTerms: event.target.value }))
            }
            rows={2}
            disabled={submit.isPending}
          />
        </Field>

        <Field
          label="Quote valid until"
          description="After this the quote expires on its own and the customer can no longer choose it."
        >
          <Input
            type="date"
            value={draft.validUntil ? draft.validUntil.slice(0, 10) : ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                // End of day, so a quote valid "until the 20th" is valid on the
                // 20th. Midnight would expire it a day early.
                validUntil:
                  event.target.value === ""
                    ? null
                    : new Date(`${event.target.value}T23:59:59`).toISOString(),
              }))
            }
            disabled={submit.isPending}
          />
        </Field>

        <ProposalTerms
          taxBasis={draft.taxBasis}
          onTaxBasisChange={(basis: TaxBasis | null) =>
            setDraft((current) => ({ ...current, taxBasis: basis }))
          }
          taxPaise={draft.taxPaise}
          onTaxPaiseChange={(paise) => setDraft((current) => ({ ...current, taxPaise: paise }))}
          errors={shown}
          disabled={submit.isPending}
        />

        <ProposalTotal
          derivedPaise={total}
          basis={`${draft.stages.length} ${draft.stages.length === 1 ? "stage" : "stages"} added up`}
        />

        {submit.error ? (
          <ErrorState
            inline
            title={describeError(submit.error, "mutation").title}
            // Verbatim. `m2_proposal_invalid_shape` covers a lifecycle mismatch,
            // stage amounts that do not reconcile, and a tax basis another
            // vendor already fixed — the server's sentence is the only thing
            // that says which.
            message={describeError(submit.error, "mutation").message}
            severity={describeError(submit.error, "mutation").severity}
            reference={describeError(submit.error, "mutation").reference}
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
          {total === null
            ? "Your stage amounts have to add up before this can be sent."
            : `The customer will compare ${formatMoney(total)}. Nothing is overwritten — a revised quote is kept alongside this one.`}
        </p>
      </form>
    </Card>
  );
}
