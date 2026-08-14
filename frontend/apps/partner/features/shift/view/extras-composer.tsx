"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Textarea, formatMoney } from "@vsolve/ui";
import {
  describeError,
  isAmendmentRequired,
  isPolicyUnavailable,
  isShiftDayClosed,
  isStageTransitionNotAllowed,
  overtimeIsRetroactive,
  shiftAddOns,
  shiftOvertime,
} from "@vsolve/query";
import { Clock, Plus } from "lucide-react";
import { useState } from "react";

import { usePartnerEngagementAmendments } from "@/features/engagement/queries";
import { timeAgo } from "@/lib/format";

import { useProposeShiftExtra, type ShiftCommandScope, type ShiftDay } from "../queries";

/**
 * Overtime and add-ons, priced by the server — `M2-FE-506`.
 *
 * ## There is no amount box, and there never will be
 *
 * The vendor names *what* and *how much of it*; the server names the money, from
 * the rate card frozen on the engagement at booking. A vendor who could type a
 * figure here could re-price a job the Customer booked at a published rate, which
 * is precisely the on-site renegotiation ADR-0009 exists to leave nowhere to
 * live. The published rate is displayed so the request is not a guess — but no
 * total is multiplied out on this screen either, because the number that matters
 * is the one Django writes on the amendment and a client-computed preview beside
 * it would be a second figure nobody agreed to.
 *
 * ## Unapproved overtime is unpaid, said in those words
 *
 * Overtime proposed while the shift is still running needs no window. Overtime
 * for a shift that has already ended must be approved inside the configured
 * retroactive window — and while the **owner has not set that window at all**, a
 * retroactive request is refused with `m2_policy_unavailable` rather than granted
 * on a guess. Both refusals are read from the server and neither is worked around
 * here: this screen never assumes a window length, never assumes a shift length,
 * and never tells a supervisor their overtime will be paid.
 *
 * ## One amendment engine
 *
 * The answer is an `EngagementAmendment`, so its approval state is read on the
 * ordinary amendment list rather than on the shift-day. There is one amendment
 * subsystem in this codebase and this composer is a caller into it, not a second
 * one — which is why the panel below shows the same statuses the change-request
 * panel on the booking shows.
 */

export interface ExtrasComposerProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  /** False when the grant no longer carries `amendment.propose`. */
  readonly canPropose: boolean;
}

type ExtraKind = "OVERTIME" | "ADD_ON";

export function ExtrasComposer({ day, scope, canPropose }: ExtrasComposerProps) {
  const propose = useProposeShiftExtra(scope);
  const overtime = shiftOvertime(day);
  const addOns = shiftAddOns(day);
  const retroactive = overtimeIsRetroactive(day);
  const closed = isShiftDayClosed(day);

  const [kind, setKind] = useState<ExtraKind>(overtime.isPublished ? "OVERTIME" : "ADD_ON");
  const [hours, setHours] = useState("");
  const [addOnCode, setAddOnCode] = useState("");
  const [workerDays, setWorkerDays] = useState("");
  const [reason, setReason] = useState("");

  const hoursValue = Number.parseInt(hours, 10);
  const workerDayValue = Number.parseInt(workerDays, 10);
  const ready =
    reason.trim() !== "" &&
    (kind === "OVERTIME"
      ? overtime.isPublished && Number.isInteger(hoursValue) && hoursValue > 0
      : addOnCode !== "" && Number.isInteger(workerDayValue) && workerDayValue > 0);

  const canOffer = !closed && canPropose && (overtime.isPublished || addOns.length > 0);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text">
        <Clock size={18} aria-hidden />
        Overtime and extras
      </h2>

      <PublishedTerms day={day} />

      <ExistingExtras engagementId={scope.engagementId} stageId={scope.stageId} />

      {closed ? (
        <p className="text-sm leading-6 text-text-secondary">
          This day is settled. Anything extra belongs on a day that is still open.
        </p>
      ) : !canPropose ? (
        <p className="text-sm leading-6 text-text-secondary">
          Your account is not approved to send change requests at the moment.
        </p>
      ) : !canOffer ? (
        <p className="text-sm leading-6 text-text-secondary">
          This booking publishes no overtime rate and no add-on prices, so there is nothing to ask
          for at a set price. That is normal on a booking that came through a quote rather than
          Vsolve&rsquo;s published rate card — anything extra is a conversation with the customer
          and a change request on the booking itself.
        </p>
      ) : (
        <>
          {retroactive === true ? (
            <p className="rounded-control border border-warning-line bg-warning-surface px-3 py-2 text-sm leading-6 text-warning-text">
              This shift has already ended. Overtime can still be approved, but only inside the
              window Vsolve allows after a shift closes — past it the request is refused and the
              hours are not paid. Ask before the shift ends whenever you can.
            </p>
          ) : null}

          <Field label="What are you asking for?">
            <Select
              value={kind}
              onChange={(event) => setKind(event.target.value as ExtraKind)}
            >
              {overtime.isPublished ? <option value="OVERTIME">Overtime hours</option> : null}
              {addOns.length > 0 ? <option value="ADD_ON">An add-on from the rate card</option> : null}
            </Select>
          </Field>

          {kind === "OVERTIME" ? (
            <Field
              label="How many overtime hours were worked?"
              description="Per worker, past the published shift length. Vsolve works out the amount from the published rate — you never name a figure."
            >
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </Field>
          ) : (
            <>
              <Field label="Which add-on?">
                <Select
                  value={addOnCode}
                  placeholder="Choose one"
                  onChange={(event) => setAddOnCode(event.target.value)}
                >
                  {addOns.map((addOn) => (
                    <option key={addOn.code} value={addOn.code}>
                      {addOn.code.replace(/[_-]+/g, " ")} — {formatMoney(addOn.ratePaise)} per
                      worker-day
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="How many worker-days does it cover?">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={workerDays}
                  onChange={(event) => setWorkerDays(event.target.value)}
                />
              </Field>
            </>
          )}

          <Field
            label="Why?"
            description="The customer reads this before deciding. Say what happened, not what it costs."
            required
          >
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
            />
          </Field>

          <Button
            type="button"
            onClick={() =>
              propose.mutate(
                {
                  kind,
                  hours: kind === "OVERTIME" ? hoursValue : 0,
                  addOnCode: kind === "ADD_ON" ? addOnCode : "",
                  workerDays: kind === "ADD_ON" ? workerDayValue : 0,
                  reason,
                },
                {
                  onSuccess: () => {
                    setHours("");
                    setWorkerDays("");
                    setReason("");
                  },
                },
              )
            }
            loading={propose.isPending}
            loadingLabel="Sending"
            disabled={!ready || propose.isPending}
            icon={<Plus size={16} aria-hidden />}
          >
            Ask the customer to approve this
          </Button>

          <p className="text-xs leading-5 text-text-muted">
            <strong className="font-semibold">Overtime the customer has not approved is not
            paid.</strong>{" "}
            Vsolve prices this from the rate published on your booking and asks them to agree. Until
            they do, it is a request and nothing more.
          </p>
        </>
      )}

      {propose.isError ? <ExtraFailure error={propose.error} /> : null}
    </Card>
  );
}

/**
 * What this booking actually publishes.
 *
 * `null` on both is the quote-flow fallback: a vendor quoted a day rate and
 * nobody published an overtime rate or a day length. Stated rather than filled
 * in — an assumed shift length decides when overtime *starts*, and inventing one
 * here would be this app doing on a screen the thing the published rate card
 * exists to stop somebody doing on site.
 */
function PublishedTerms({ day }: { readonly day: ShiftDay }) {
  const overtime = shiftOvertime(day);
  const addOns = shiftAddOns(day);

  return (
    <dl className="flex flex-col gap-1 rounded-control border border-line bg-surface-sunken px-3 py-2 text-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <dt className="text-text-secondary">Published shift length</dt>
        <dd className="font-semibold tabular-nums text-text">
          {overtime.standardDayHours === null
            ? "Not published on this booking"
            : `${overtime.standardDayHours} hours`}
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <dt className="text-text-secondary">Overtime rate</dt>
        <dd className="font-semibold tabular-nums text-text">
          {overtime.hourlyPaise === null
            ? "Not published on this booking"
            : `${formatMoney(overtime.hourlyPaise)} an hour`}
        </dd>
      </div>
      <div className="flex flex-wrap justify-between gap-2">
        <dt className="text-text-secondary">Add-ons on the card</dt>
        <dd className="font-semibold tabular-nums text-text">
          {addOns.length === 0 ? "None" : `${addOns.length}`}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Change requests already sitting against this day, with their approval state.
 *
 * Read off the engagement's own amendment list rather than the shift-day: the
 * extras command is a caller into the one amendment engine, so its answers live
 * where every other amendment lives. Filtered to this stage so a supervisor
 * standing on Tuesday does not read Monday's approvals as their own.
 */
function ExistingExtras({
  engagementId,
  stageId,
}: {
  readonly engagementId: string;
  readonly stageId: string;
}) {
  const query = usePartnerEngagementAmendments(engagementId);
  if (query.isPending || query.isError) return null;

  const mine = query.data.amendments.filter((amendment) => amendment.stage_id === stageId);
  if (mine.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {mine.map((amendment) => (
        <li
          key={amendment.id}
          className="flex flex-col gap-1 rounded-control border border-line px-3 py-2"
        >
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-text">
              {amendment.lines.map((line) => line.title).join(", ") || amendment.reason}
            </span>
            <AmendmentBadge status={amendment.status} />
          </span>
          <span className="text-xs text-text-muted">
            {/* Server-sent paise, formatted and never computed. */}
            {formatMoney(amendment.delta_paise)} · asked {timeAgo(amendment.created_at)}
            {amendment.applied_at === null
              ? ` · expires ${timeAgo(amendment.expires_at)}`
              : ` · approved ${timeAgo(amendment.applied_at)}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AmendmentBadge({ status }: { readonly status: string }) {
  switch (status) {
    case "ACCEPTED":
    case "APPLIED":
      return <Badge tone="success">Approved</Badge>;
    case "REJECTED":
      return <Badge tone="warning">Turned down</Badge>;
    case "EXPIRED":
      return <Badge tone="warning">Expired — not paid</Badge>;
    case "PROPOSED":
      return <Badge tone="info">Waiting on the customer</Badge>;
    default:
      return <Badge tone="neutral">{status.replace(/[_-]+/g, " ").toLowerCase()}</Badge>;
  }
}

/**
 * Three refusals, three different sentences.
 *
 * `m2_policy_unavailable` is the one that must not be dressed up as a fault of
 * the vendor's: Vsolve has not decided how long after a shift overtime may be
 * approved, and the honest answer is to say so and give them the path that still
 * works — ask before the shift ends.
 */
function ExtraFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  if (isPolicyUnavailable(error)) {
    return (
      <ErrorState
        title="Vsolve cannot approve this after the shift yet"
        message="We have not set how long overtime can be approved for once a shift has ended, so this request is refused rather than accepted on a guess. Ask for overtime before the shift ends, or contact support."
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  if (isAmendmentRequired(error)) {
    return (
      <ErrorState
        title="This booking has no published price for that"
        message={presentation.message}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title="This day cannot carry that extra"
        message={presentation.message}
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
