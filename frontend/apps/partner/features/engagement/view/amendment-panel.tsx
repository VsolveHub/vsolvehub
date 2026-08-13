"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Textarea, formatMoney } from "@vsolve/ui";
import {
  MAXIMUM_AMENDMENT_LINES,
  MAXIMUM_EXTENSION_DAYS,
  acceptsAmendments,
  amendmentDeltaPaise,
  amendmentShapeFor,
  describeError,
  isAmendmentLive,
  isAmendmentNotActionable,
  isAmendmentRequired,
  isPolicyUnavailable,
  liveAmendment,
  orderedStages,
  validateAmendmentDraft,
  type AmendmentDraft,
  type AmendmentDraftLine,
  type AmendmentProblemField,
  type AmendmentShape,
  type Engagement,
  type EngagementAmendment,
} from "@vsolve/query";
import { FilePlus2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { shortDate } from "@/lib/format";

import { usePartnerEngagementAmendments, useProposeAmendment } from "../queries";
import { stageTitle, type StageWording } from "../model/engagement-copy";

/**
 * Change requests — `M2-FE-604`, and one screen rather than two.
 *
 * ## Same screen, two pricing rules, and it says which one applies
 *
 * A3 time extensions and A5 change orders are both scope amendments on one
 * engine, one status machine, one expiry rule. What differs is **who prices
 * them**:
 *
 * - **A3 (`LEAD_ONLY`) is server-priced.** The vendor names days and never money.
 *   The server multiplies by the worker-day rate frozen at reconfirmation,
 *   because a vendor who could name the money could re-price a job the customer
 *   already committed to. The composer therefore has no amount field at all —
 *   not a disabled one, and not one whose value is thrown away.
 * - **A5 (`MANAGED_PAYMENT_REQUIRED`) is vendor-priced per line.** A bespoke
 *   outcome has no catalog rate. The server still sums the lines and rejects a
 *   client-supplied total, so the figure shown while composing is labelled as the
 *   vendor's own arithmetic and no total is ever sent.
 *
 * Which rule applies is read from `commercial_mode` — the field the server itself
 * branches on — and stated on screen in words, because a vendor who does not know
 * whether they are naming a price or naming days will get one of them wrong.
 *
 * ## A proposal is not approved scope
 *
 * Said in those words wherever a live request is rendered. `CUSTOMER_APPROVED` is
 * the state worth being careful about: the customer has said yes and the money
 * has not moved, so the agreement has **not** changed and the extra days do not
 * exist yet. The vendor accepts nothing here — the decision routes are the
 * customer's, and a vendor who could accept their own change request could
 * re-price a committed job.
 *
 * ## A reduction that empties a stage is refused here, not at the server
 *
 * `validateAmendmentDraft` refuses to compose one. It is a cancellation, vendor
 * abandonment is `M2-BE-545` in Wave C5 and does not exist, and submitting it to
 * find out would teach a vendor that a cancellation is a change request that
 * happened to fail.
 *
 * ## The owner-blocked refusal
 *
 * `m2_policy_unavailable` on this route means `amendment_response_hours` is unset
 * and `ScopeAmendment.expires_at` is not nullable — so an amendment with no
 * deadline would be an open-ended claim on somebody's money and is refused rather
 * than invented. It is not a fault the vendor can clear and no retry helps, which
 * is why `errors.ts` classifies it `contact_support`.
 */

export interface AmendmentPanelProps {
  readonly engagement: Engagement;
  readonly wording: StageWording;
}

export function AmendmentPanel({ engagement, wording }: AmendmentPanelProps) {
  const shape = amendmentShapeFor(engagement);
  const query = usePartnerEngagementAmendments(engagement.id);

  if (shape === null) {
    return (
      <Card className="p-4">
        <h2 className="mb-1 text-base font-semibold text-text">Change requests</h2>
        <p className="text-sm leading-6 text-text-secondary">
          This {wording.parent} is on a payment arrangement this version of the app does not
          recognise, so it cannot say which kind of change request applies. Updating the app
          usually resolves it; contact support if it does not.
        </p>
      </Card>
    );
  }

  if (query.isPending) return null;

  if (query.isError) {
    const presentation = describeError(query.error, "read");
    return (
      <Card className="p-4">
        <h2 className="mb-1 text-base font-semibold text-text">Change requests</h2>
        <ErrorState
          title="Vsolve could not read your change requests"
          message={`${presentation.message} The form stays closed until this read works — proposing one now could be a second request on top of one already open.`}
          severity={presentation.severity}
          actionLabel="Try again"
          onAction={() => void query.refetch()}
          reference={presentation.reference}
        />
      </Card>
    );
  }

  const amendments = query.data.amendments;
  const open = liveAmendment(amendments);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-text">
          {shape.kind === "TIME_EXTENSION" ? "Ask for more time" : "Ask to change the work"}
        </h2>
        <p className="text-sm leading-6 text-text-secondary">
          {shape.pricing === "server_from_frozen_rate"
            ? "You name the extra days. Vsolve prices them at the daily rate you both agreed when this booking was confirmed — you do not set a new price, and nobody can change the agreed one."
            : "You price each line yourself, because there is no catalogue rate for bespoke work. Vsolve adds them up; the total on your side is only a preview."}
        </p>
      </header>

      <AmendmentHistory amendments={amendments} wording={wording} />

      {open ? (
        <p className="text-sm leading-6 text-text-secondary">
          One change request is already open on this {wording.parent}. Vsolve takes one at a time,
          so the next one can be raised after the customer decides this one.
        </p>
      ) : acceptsAmendments(engagement) ? (
        <AmendmentComposer engagement={engagement} shape={shape} wording={wording} />
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          This {wording.parent} is not open to changes any more.
        </p>
      )}
    </Card>
  );
}

/**
 * Every change request on this engagement, newest first.
 *
 * A live one is labelled by what it is waiting for, never by what it would do to
 * the money if it landed.
 */
function AmendmentHistory({
  amendments,
  wording,
}: {
  readonly amendments: readonly EngagementAmendment[];
  readonly wording: StageWording;
}) {
  if (amendments.length === 0) return null;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {amendments.map((amendment) => (
        <li key={amendment.id} className="flex flex-col gap-1 py-2">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium tabular-nums text-text">
              {amendment.delta_paise > 0 ? "+" : "−"}
              {formatMoney(Math.abs(amendment.delta_paise))}
            </span>
            <AmendmentStatusBadge amendment={amendment} />
            <span className="text-xs text-text-muted">{shortDate(amendment.created_at)}</span>
          </span>
          <span className="text-sm leading-6 text-text-secondary">{amendment.reason}</span>
          {isAmendmentLive(amendment) ? (
            <span className="text-xs leading-5 text-text-muted">
              Not agreed scope. Nothing about this {wording.parent} changes until the customer
              decides
              {amendment.delta_paise > 0 ? " and the payment clears" : ""}. Their decision is due
              by {shortDate(amendment.expires_at)}.
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function AmendmentStatusBadge({ amendment }: { readonly amendment: EngagementAmendment }) {
  switch (amendment.status) {
    case "PROPOSED":
      return <Badge tone="info">With the customer</Badge>;
    case "CUSTOMER_APPROVED":
      return <Badge tone="info">Accepted, not applied</Badge>;
    case "PAYMENT_PENDING":
      return <Badge tone="info">Waiting on payment</Badge>;
    case "AUTHORIZED":
      return <Badge tone="success">Applied</Badge>;
    case "CUSTOMER_DECLINED":
      return <Badge tone="neutral">Declined</Badge>;
    case "EXPIRED":
      return <Badge tone="neutral">Expired</Badge>;
    default:
      return <Badge tone="neutral">State not recognised</Badge>;
  }
}

const EMPTY_LINE: AmendmentDraftLine = { title: "", quantity: 1, amountPaise: null };

function AmendmentComposer({
  engagement,
  shape,
  wording,
}: {
  readonly engagement: Engagement;
  readonly shape: AmendmentShape;
  readonly wording: StageWording;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [stageId, setStageId] = useState("");
  const [lines, setLines] = useState<AmendmentDraftLine[]>([EMPTY_LINE]);
  const [showProblems, setShowProblems] = useState(false);

  const propose = useProposeAmendment(engagement.id);

  const draft: AmendmentDraft = { reason, stageId: stageId === "" ? null : stageId, lines };
  const problems = validateAmendmentDraft({ engagement, draft, shape });
  const problemFor = (field: AmendmentProblemField) =>
    showProblems ? problems.find((problem) => problem.field === field)?.message : undefined;

  const vendorPriced = shape.pricing === "vendor_per_line";
  const delta = amendmentDeltaPaise(draft);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        icon={<FilePlus2 size={16} aria-hidden />}
      >
        {shape.kind === "TIME_EXTENSION" ? "Ask for more days" : "Propose a change"}
      </Button>
    );
  }

  function onPropose() {
    setShowProblems(true);
    if (problems.length > 0) return;
    propose.mutate(
      { draft, shape },
      {
        onSuccess: () => {
          setOpen(false);
          setReason("");
          setStageId("");
          setLines([EMPTY_LINE]);
          setShowProblems(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Why is this needed?"
        description="The customer reads this and decides on it. Say what changed on site."
        required
        error={problemFor("reason")}
      >
        <Textarea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>

      <Field
        label={`Which ${wording.one}?`}
        description={
          vendorPriced
            ? `Required when you are taking work out. Leave it unset when you are adding work — that creates a new ${wording.one}.`
            : `Optional. Leave it unset unless the extra days belong to one ${wording.one}.`
        }
        error={problemFor("stage")}
      >
        <Select
          value={stageId}
          onChange={(event) => setStageId(event.target.value)}
          placeholder={`No particular ${wording.one}`}
        >
          {orderedStages(engagement).map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stageTitle(stage, wording)} · {formatMoney(stage.amount_paise)}
            </option>
          ))}
        </Select>
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold text-text">
          {vendorPriced ? "What is changing" : "Extra days"}
        </legend>

        {lines.map((line, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-control bg-surface-sunken p-3">
            <Field label={vendorPriced ? "What this covers" : "What the extra days are for"} required>
              <Input
                value={line.title}
                onChange={(event) =>
                  setLines((rows) =>
                    rows.map((row, position) =>
                      position === index ? { ...row, title: event.target.value } : row,
                    ),
                  )
                }
              />
            </Field>

            <div className="flex gap-2">
              <Field
                label={vendorPriced ? "How many" : "Days"}
                className="flex-1"
                required
              >
                <Input
                  inputMode="numeric"
                  value={String(line.quantity)}
                  onChange={(event) =>
                    setLines((rows) =>
                      rows.map((row, position) =>
                        position === index
                          ? { ...row, quantity: Number(event.target.value.replace(/\D/g, "")) || 0 }
                          : row,
                      ),
                    )
                  }
                />
              </Field>

              {vendorPriced ? (
                <Field
                  label="Amount in rupees"
                  className="flex-1"
                  description="Use a minus sign to take work out."
                  required
                >
                  <Input
                    inputMode="decimal"
                    value={line.amountPaise === null ? "" : String(line.amountPaise / 100)}
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      const rupees = raw === "" || raw === "-" ? null : Number(raw);
                      setLines((rows) =>
                        rows.map((row, position) =>
                          position === index
                            ? {
                                ...row,
                                amountPaise:
                                  rupees === null || Number.isNaN(rupees)
                                    ? null
                                    : Math.round(rupees * 100),
                              }
                            : row,
                        ),
                      );
                    }}
                  />
                </Field>
              ) : null}
            </div>

            {lines.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<Trash2 size={16} aria-hidden />}
                onClick={() => setLines((rows) => rows.filter((_row, position) => position !== index))}
              >
                Remove this line
              </Button>
            ) : null}
          </div>
        ))}

        {problemFor("lines") ? (
          <p role="alert" className="text-sm text-danger-text">
            {problemFor("lines")}
          </p>
        ) : null}
        {problemFor("quantity") ? (
          <p role="alert" className="text-sm text-danger-text">
            {problemFor("quantity")}
          </p>
        ) : null}
        {problemFor("amount") ? (
          <p role="alert" className="text-sm text-danger-text">
            {problemFor("amount")}
          </p>
        ) : null}

        {lines.length >= MAXIMUM_AMENDMENT_LINES ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<Plus size={16} aria-hidden />}
            onClick={() => setLines((rows) => [...rows, EMPTY_LINE])}
          >
            Add another line
          </Button>
        )}
      </fieldset>

      {vendorPriced ? (
        <p className="text-sm leading-6 text-text-secondary">
          Your lines come to{" "}
          <span className="font-semibold tabular-nums">
            {delta > 0 ? "+" : delta < 0 ? "−" : ""}
            {formatMoney(Math.abs(delta))}
          </span>
          . Vsolve adds them up itself and its figure is the one on the agreement — this is a
          preview of your own arithmetic.
        </p>
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          Vsolve prices these days at the rate frozen when this booking was confirmed. You will see
          the figure once the request is raised. At most {MAXIMUM_EXTENSION_DAYS} extra days can be
          asked for in one request.
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={onPropose}
          loading={propose.isPending}
          loadingLabel="Sending the change request"
        >
          Send to the customer
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>

      {propose.isError ? <ProposeFailure error={propose.error} wording={wording} /> : null}
    </div>
  );
}

/** The four refusals this composer can genuinely earn, each with its own recovery. */
function ProposeFailure({
  error,
  wording,
}: {
  readonly error: unknown;
  readonly wording: StageWording;
}) {
  const presentation = describeError(error, "mutation");

  if (isPolicyUnavailable(error)) {
    return (
      <ErrorState
        title="Vsolve cannot take change requests yet"
        message="A change request has to carry a deadline for the customer to answer by, and nobody has set how long that is. Vsolve refuses to invent one rather than leave an open claim on somebody's money. Support can raise this for you."
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  if (isAmendmentNotActionable(error)) {
    return (
      <ErrorState
        title="A change request is already open"
        message={`One is already waiting for the customer on this ${wording.parent} — it may have been raised on another device. Reload to see it. Sending this one would be a second request Vsolve does not allow.`}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  if (isAmendmentRequired(error)) {
    return (
      <ErrorState
        title="Vsolve has no agreed daily rate to price this from"
        message={`Extra days are priced from the rate frozen when this ${wording.parent} was confirmed, and none is recorded against it. Nothing you change on this form will fix that — support can.`}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}
