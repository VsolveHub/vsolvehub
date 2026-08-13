"use client";

import { Button, Card, ErrorState, Field, Input, Textarea, formatMoney } from "@vsolve/ui";
import { describeError } from "@vsolve/query";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { shortDate } from "@/lib/format";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import { isVisitNotCompleted } from "@/features/visit/queries";
import type { SiteVisit } from "@/features/visit/model/visit-state";

import {
  EMPTY_MATERIAL,
  EMPTY_ONSITE_STAGE,
  clearOnsiteDraft,
  hasErrors,
  loadOnsiteDraft,
  materialsTotal,
  onsiteTotal,
  prefillOnsiteDraft,
  saveOnsiteDraft,
  scheduleFor,
  toOnsiteRequest,
  totalWorkingDays,
  validateOnsite,
  type MaterialDraft,
  type OnsiteDraft,
  type OnsiteStageDraft,
} from "../model/onsite-draft";
import { paiseToRupeeInput, readCount, rupeesToPaise, type TaxBasis } from "../model/proposal-draft";
import { useSubmitProposal, type Proposal } from "../queries";
import { ProposalTerms } from "./proposal-terms";
import { ProposalTotal } from "./proposal-total";

/**
 * The A5 composer's **on-site mode**.
 *
 * Closes `M2-FE-315`. Same endpoint and same wire shape as the remote A5
 * composer; a different screen, because the person using it is different. They
 * are standing in the customer's half-built bathroom holding a phone in one
 * hand, and they will not finish a form that asks them to count out calendar
 * dates.
 *
 * ## Four decisions this screen is made of
 *
 * 1. **Working days are the schedule.** The vendor types days; the screen shows
 *    the date they land on and says how it counted. See
 *    `model/onsite-draft.ts › scheduleFor`.
 * 2. **Material lines are their own rows**, entered separately from labour and
 *    totalled separately, so a vendor can see what the job costs before
 *    materials. They reach the customer as rows on the estimate — the wire has
 *    one row type — and the screen says so rather than letting the vendor
 *    discover it.
 * 3. **Every money and count field is a numeric keyboard** and every target is
 *    at least 44px. `inputMode="decimal"` for rupees, `inputMode="numeric"` for
 *    days.
 * 4. **Save on blur.** Leaving a field writes the whole draft to this device.
 *    A locked screen, a dropped signal or an accidental reload does not cost the
 *    vendor their estimate — which under the revision-3 rules would cost them
 *    the visit payout too.
 *
 * ## The completed-visit guard is explained, never a dead button
 *
 * An A5 estimate may only be submitted against a `COMPLETED` visit;
 * `m2_visit_not_completed` is the refusal. The submit stays **enabled** even
 * when this screen believes the visit is still open, because this screen's copy
 * of that fact can be a minute old — the vendor may have closed the visit in
 * another tab, or the customer may have. Disabling on a stale read is precisely
 * the dead button the task forbids. Instead the state is explained above the
 * form, with the one action that fixes it, and the server's own refusal is
 * routed to the same explanation.
 */

export interface OnsiteComposerProps {
  readonly enquiry: EnquiryRecord;
  /** The plan visit this estimate is written against, if one exists yet. */
  readonly visit: SiteVisit | null;
  /** Where the enquiry lives, for the link that closes the visit. */
  readonly enquiryHref: string;
  readonly supersedesRevision: number;
  readonly onSubmitted: (proposal: Proposal) => void;
}

export function OnsiteComposer({
  enquiry,
  visit,
  enquiryHref,
  supersedesRevision,
  onSubmitted,
}: OnsiteComposerProps) {
  const [draft, setDraft] = useState<OnsiteDraft>(() => {
    // A draft this vendor already started on this device wins over the prefill:
    // it is their own newer input. It is validated before it is trusted — see
    // `loadOnsiteDraft`.
    const saved = loadOnsiteDraft(enquiry.id);
    return (
      saved ??
      prefillOnsiteDraft({
        answers: enquiry.answers,
        requestedStart: enquiry.requestedStart,
        requiredTaxBasis: enquiry.requiredTaxBasis,
      })
    );
  });
  const [exclusionsText, setExclusionsText] = useState(() => draft.exclusions.join("\n"));
  const [attempted, setAttempted] = useState(false);

  const submit = useSubmitProposal();

  const withLines: OnsiteDraft = useMemo(
    () => ({ ...draft, exclusions: exclusionsText.split("\n") }),
    [draft, exclusionsText],
  );

  const errors = useMemo(() => validateOnsite(withLines), [withLines]);
  const shown = attempted ? errors : {};
  const total = onsiteTotal(withLines);
  const materials = materialsTotal(withLines);
  const schedule = scheduleFor(withLines);
  const days = totalWorkingDays(withLines);

  /** Writes the whole draft to this device. Attached to every field's `onBlur`. */
  const persist = useCallback(() => {
    saveOnsiteDraft(enquiry.id, withLines);
  }, [enquiry.id, withLines]);

  const updateStage = (index: number, patch: Partial<OnsiteStageDraft>) =>
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage, position) =>
        position === index ? { ...stage, ...patch } : stage,
      ),
    }));

  const updateMaterial = (index: number, patch: Partial<MaterialDraft>) =>
    setDraft((current) => ({
      ...current,
      materials: current.materials.map((material, position) =>
        position === index ? { ...material, ...patch } : material,
      ),
    }));

  const visitOpen = visit === null || visit.status !== "COMPLETED";
  const guardRefused = isVisitNotCompleted(submit.error);

  return (
    <Card className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="text-base font-semibold text-text">Your estimate</h2>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Write this before you leave the site. The customer reads it in full — there is nothing
          else for them to unlock — and they choose between it and the other estimates they paid
          for.
        </p>
      </div>

      {visitOpen || guardRefused ? (
        <VisitGuardNotice enquiryHref={enquiryHref} visit={visit} refused={guardRefused} />
      ) : null}

      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          setAttempted(true);
          if (hasErrors(errors) || submit.isPending) return;
          if (visit === null) return;
          submit.mutate(
            {
              body: toOnsiteRequest({
                invitationId: enquiry.id,
                siteVisitId: visit.id,
                draft: withLines,
              }),
              supersedesRevision,
              requirementId: enquiry.requirementId,
              invitationId: enquiry.id,
            },
            {
              onSuccess: (proposal) => {
                clearOnsiteDraft(enquiry.id);
                onSubmitted(proposal);
              },
            },
          );
        }}
      >
        <Field
          label="When can you start?"
          description="Everything below is counted forward from this day."
        >
          <Input
            type="date"
            className="min-h-12"
            value={draft.startsOn ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                startsOn: event.target.value === "" ? null : event.target.value,
              }))
            }
            onBlur={persist}
            disabled={submit.isPending}
          />
        </Field>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="text-sm font-semibold text-text">The work</legend>
          <p className="text-sm leading-6 text-text-secondary">
            Break it into the pieces you would actually be paid for one at a time. Vsolve holds the
            money for each piece and releases it when the customer signs that piece off.
          </p>

          {withLines.stages.map((stage, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-control border border-line bg-surface-sunken p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Part {index + 1}
                </span>
                {withLines.stages.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        stages: current.stages.filter((_, position) => position !== index),
                      }));
                      persist();
                    }}
                    disabled={submit.isPending}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-text-secondary hover:text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    <Trash2 size={16} aria-hidden />
                    Remove
                    <span className="sr-only"> part {index + 1}</span>
                  </button>
                ) : null}
              </div>

              <Field label="What is this part?" required>
                <Input
                  className="min-h-12"
                  value={stage.title}
                  onChange={(event) => updateStage(index, { title: event.target.value })}
                  onBlur={persist}
                  placeholder="Chase the walls and run the cable"
                  disabled={submit.isPending}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Working days">
                  <Input
                    type="text"
                    inputMode="numeric"
                    className="min-h-12 text-lg"
                    value={stage.workingDays === null ? "" : String(stage.workingDays)}
                    onChange={(event) =>
                      updateStage(index, { workingDays: readCount(event.target.value) })
                    }
                    onBlur={persist}
                    placeholder="3"
                    disabled={submit.isPending}
                  />
                </Field>

                <Field label="Price" required>
                  <Input
                    type="text"
                    inputMode="decimal"
                    className="min-h-12 text-lg"
                    value={paiseToRupeeInput(stage.amountPaise)}
                    onChange={(event) =>
                      updateStage(index, { amountPaise: rupeesToPaise(event.target.value) })
                    }
                    onBlur={persist}
                    placeholder="25000"
                    disabled={submit.isPending}
                  />
                </Field>
              </div>

              <Field
                label="What the customer has at the end of it"
                description="Optional. This is what they sign off before the money moves."
              >
                <Textarea
                  value={stage.deliverable}
                  onChange={(event) => updateStage(index, { deliverable: event.target.value })}
                  onBlur={persist}
                  rows={2}
                  disabled={submit.isPending}
                />
              </Field>

              <p className="text-xs leading-5 text-text-muted">
                {schedule[index]?.endsOn
                  ? `Done by ${shortDate(schedule[index].endsOn as string)} — counting every day from your start date, weekends included.`
                  : "Add a start date and a number of days to show the customer when this part finishes. Leave it blank if you would rather not commit to a day."}
              </p>
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
            icon={<Plus size={18} aria-hidden />}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                stages: [...current.stages, EMPTY_ONSITE_STAGE],
              }))
            }
            disabled={submit.isPending}
          >
            Add another part
          </Button>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <legend className="text-sm font-semibold text-text">Materials</legend>
          <p className="text-sm leading-6 text-text-secondary">
            Anything you buy for this job, priced separately from your labour. Each line appears on
            the customer&rsquo;s estimate as its own row, so name it the way you would on paper.
          </p>

          {withLines.materials.map((material, index) => (
            <div key={index} className="flex flex-col gap-3 rounded-control border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Material {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      materials: current.materials.filter((_, position) => position !== index),
                    }));
                    persist();
                  }}
                  disabled={submit.isPending}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-text-secondary hover:text-danger-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  <Trash2 size={16} aria-hidden />
                  Remove
                  <span className="sr-only"> material {index + 1}</span>
                </button>
              </div>

              <Field label="What is it?" required>
                <Input
                  className="min-h-12"
                  value={material.description}
                  onChange={(event) => updateMaterial(index, { description: event.target.value })}
                  onBlur={persist}
                  placeholder="90m of 2.5mm copper cable"
                  disabled={submit.isPending}
                />
              </Field>

              <Field label="Cost" required>
                <Input
                  type="text"
                  inputMode="decimal"
                  className="min-h-12 text-lg"
                  value={paiseToRupeeInput(material.amountPaise)}
                  onChange={(event) =>
                    updateMaterial(index, { amountPaise: rupeesToPaise(event.target.value) })
                  }
                  onBlur={persist}
                  placeholder="12000"
                  disabled={submit.isPending}
                />
              </Field>
            </div>
          ))}

          {shown.materials ? (
            <p role="alert" className="text-sm leading-6 text-danger-text">
              {shown.materials}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            icon={<Plus size={18} aria-hidden />}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                materials: [...current.materials, EMPTY_MATERIAL],
              }))
            }
            disabled={submit.isPending}
          >
            Add a material
          </Button>

          {materials !== null ? (
            <p className="text-sm leading-6 text-text-secondary">
              Materials come to {formatMoney(materials)}.
            </p>
          ) : null}
        </fieldset>

        <Field
          label="What this does not cover"
          description="One thing per line. Anything the customer would otherwise assume is included."
          error={shown.exclusions}
        >
          <Textarea
            value={exclusionsText}
            onChange={(event) => setExclusionsText(event.target.value)}
            onBlur={persist}
            rows={3}
            disabled={submit.isPending}
          />
        </Field>

        <Field
          label="Warranty"
          description="What you stand behind after sign-off, and for how long."
          error={shown.warrantyTerms}
        >
          <Textarea
            value={draft.warrantyTerms}
            onChange={(event) =>
              setDraft((current) => ({ ...current, warrantyTerms: event.target.value }))
            }
            onBlur={persist}
            rows={2}
            disabled={submit.isPending}
          />
        </Field>

        <Field
          label="Estimate valid until"
          description="After this it expires on its own and the customer can no longer choose it."
        >
          <Input
            type="date"
            className="min-h-12"
            value={draft.validUntil ? draft.validUntil.slice(0, 10) : ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                // End of day, so an estimate valid "until the 20th" is valid on
                // the 20th. Midnight would expire it a day early.
                validUntil:
                  event.target.value === ""
                    ? null
                    : new Date(`${event.target.value}T23:59:59`).toISOString(),
              }))
            }
            onBlur={persist}
            disabled={submit.isPending}
          />
        </Field>

        <RequiredBasisNotice requiredTaxBasis={enquiry.requiredTaxBasis} />

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
          basis={
            days === null
              ? "the parts and materials above, added up"
              : `${days} ${days === 1 ? "working day" : "working days"} of work plus materials`
          }
        />

        {submit.error ? (
          guardRefused ? null : (
            <ErrorState
              inline
              title={describeError(submit.error, "mutation").title}
              // Verbatim. `m2_proposal_invalid_shape` covers a lifecycle
              // mismatch, amounts that do not reconcile, and a tax basis another
              // vendor already fixed — the server's sentence is the only thing
              // that says which.
              message={describeError(submit.error, "mutation").message}
              severity={describeError(submit.error, "mutation").severity}
              reference={describeError(submit.error, "mutation").reference}
            />
          )
        ) : null}

        <Button
          type="submit"
          block
          size="lg"
          // Deliberately not disabled on `visitOpen`: this screen's view of the
          // visit can be a minute old, and a button that refuses on a stale read
          // is the dead submit the task forbids. The guard above explains the
          // state; the server enforces it.
          disabled={submit.isPending || visit === null}
          loading={submit.isPending}
          loadingLabel="Sending your estimate"
        >
          {supersedesRevision > 0 ? "Send a revised estimate" : "Send the estimate"}
        </Button>

        <p className="text-xs leading-5 text-text-muted">
          {total === null
            ? "Your parts and materials have to be priced before this can be sent."
            : `The customer will compare ${formatMoney(total)}. Nothing is overwritten — a revised estimate is kept alongside this one.`}{" "}
          Everything you type here is saved on this phone as you go.
        </p>
      </form>
    </Card>
  );
}

/**
 * The completed-visit guard, explained.
 *
 * Two ways in and one explanation: this screen can already see that the visit is
 * open, or the server refused with `m2_visit_not_completed`. Both mean the same
 * thing to the vendor and both have the same fix, so they share a component
 * rather than producing two different sentences for one rule.
 */
function VisitGuardNotice({
  enquiryHref,
  visit,
  refused,
}: {
  readonly enquiryHref: string;
  readonly visit: SiteVisit | null;
  readonly refused: boolean;
}) {
  if (visit === null) {
    return (
      <ErrorState
        inline
        title="There is no visit behind this estimate"
        message="Vsolve only takes a project estimate from a professional who has been to the site — it is what the customer paid for. Confirm a visit slot on the enquiry first."
        severity="warning"
      />
    );
  }

  return (
    <div className="rounded-control border border-warning-line bg-warning-surface p-3">
      <p className="text-sm font-semibold text-warning-text">
        {refused ? "Vsolve could not take this estimate yet" : "Close the visit before you send this"}
      </p>
      <p className="mt-1 text-sm leading-6 text-warning-text">
        An estimate has to stand behind a visit that actually happened — that is the whole of what
        the customer bought. Your visit is still open, so mark it closed on the enquiry and then
        send this. Nothing you have typed here is lost.
      </p>
      <Link
        href={enquiryHref}
        className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-action underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        Go to the enquiry and close the visit
      </Link>
    </div>
  );
}

/**
 * Which basis this estimate has to be quoted on.
 *
 * `required_tax_basis` (1.24.0) closed the gap where `_required_tax_basis`
 * refused a mismatch against a vendor the second one could not see. Blank means
 * nobody has quoted yet and **this vendor sets it for everyone**, which is worth
 * saying too — it is a decision, not an absence.
 */
function RequiredBasisNotice({ requiredTaxBasis }: { readonly requiredTaxBasis: string }) {
  if (requiredTaxBasis === "") {
    return (
      <p className="text-sm leading-6 text-text-secondary">
        No one has quoted on this request yet, so whichever way you state tax below is the way every
        estimate on it will be compared.
      </p>
    );
  }

  return (
    <p className="text-sm leading-6 text-text-secondary">
      Another professional has already quoted on this request, so Vsolve compares every estimate the
      same way they did:{" "}
      <span className="font-semibold text-text">
        {requiredTaxBasis === "INCLUSIVE" ? "prices include tax" : "tax is added on top"}
      </span>
      . Choose that below — anything else is refused.
    </p>
  );
}
