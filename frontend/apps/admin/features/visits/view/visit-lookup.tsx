"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import {
  Badge,
  Button,
  Card,
  ConfirmAction,
  Dialog,
  ErrorState,
  Field,
  Spinner,
  Textarea,
  formatMoney,
} from "@vsolve/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  isStepUpRequired,
  useRequestRefund,
  type StepUpSession,
} from "@/features/finance/queries";
import { StepUpGate } from "@/features/finance/view/step-up-gate";
import { useDispatchExplanation } from "@/features/dispatch-recovery/queries";
import { DispatchCommands } from "@/features/dispatch-recovery/view/dispatch-commands";
import { DispatchExplanation } from "@/features/dispatch-recovery/view/dispatch-explanation";
import {
  isNotOfferable,
  useCreateManualOffer,
} from "@/features/manual-offer/queries";
import {
  PartnerPicker,
  type PickedPartner,
} from "@/features/partners/view/partner-picker";
import { isUuid } from "@/features/shared/identifiers";

import {
  VISIT_STATUS_LABEL,
  useAssistedStart,
  useCancelVisit,
  useConfirmReplacement,
  useVisit,
  visitActions,
  type OperationsBooking,
} from "../queries";

const WHEN = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function when(value: string | null | undefined): string {
  return value ? WHEN.format(new Date(value)) : "—";
}

/**
 * One home-service visit, opened from a booking row or a case link, with the actions a visit can
 * need. Operations finds a visit by searching Home services › Bookings, not by typing an id here.
 */
export function VisitLookup() {
  const params = useSearchParams();
  const current = params.get("id");
  const bookingId = current && isUuid(current) ? current : null;
  const visit = useVisit(bookingId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header>
        <Link
          href="/operations/home-services"
          className="text-sm font-semibold text-text-link hover:underline"
        >
          ← All home-service bookings
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-navy-900">Visit</h1>
      </header>

      {bookingId === null ? (
        <Card className="p-5">
          <p className="text-sm text-text-secondary">
            Find the visit in{" "}
            <Link
              href="/operations/home-services"
              className="font-semibold text-text-link hover:underline"
            >
              Home services › Bookings
            </Link>
            , where you can search by customer or partner name, phone or booking
            number.
          </p>
        </Card>
      ) : visit.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" /> Loading the visit…
        </p>
      ) : visit.isError || !visit.data ? (
        <ErrorState
          severity="warning"
          title="No visit with that id"
          message="Check the id. Rentals and stays have their own pages."
        />
      ) : (
        <VisitRecord booking={visit.data} />
      )}
    </div>
  );
}

/**
 * Where the visit is and how to reach both people.
 *
 * Not on the Partner's two-hour clock: an operator working a case the day
 * before — a customer asking who is coming, a partner who cannot find the
 * building — needs these whenever the case is open (contract 1.82.0).
 */
function VisitContacts({ booking }: { booking: OperationsBooking }) {
  const address = booking.site_address;
  return (
    <Card className="p-5">
      <h2 className="text-sm font-bold text-navy-900">Location and contacts</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <dt className="text-text-muted">Visit address</dt>
          <dd>
            {address === null ? (
              "—"
            ) : (
              <>
                <span className="block">
                  {[address.line1, address.line2]
                    .filter((part) => part.trim() !== "")
                    .join(", ")}
                </span>
                {address.landmark.trim() === "" ? null : (
                  <span className="block text-text-secondary">
                    Near {address.landmark}
                  </span>
                )}
                <span className="block">
                  {[
                    address.locality,
                    address.city,
                    address.state,
                    address.postal_code,
                  ]
                    .filter((part) => part.trim() !== "")
                    .join(", ")}
                </span>
                {address.directions_url ? (
                  <a
                    className="mt-1 inline-block underline"
                    href={address.directions_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Customer</dt>
          <dd>
            {booking.customer_name.trim() || "Name not given"} ·{" "}
            <a className="underline" href={`tel:${booking.customer_phone}`}>
              {booking.customer_phone}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Partner</dt>
          <dd>
            {booking.partner_display_name} ·{" "}
            <a className="underline" href={`tel:${booking.partner_phone}`}>
              {booking.partner_phone}
            </a>
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function VisitRecord({ booking }: { booking: OperationsBooking }) {
  const actions = visitActions(booking);
  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-navy-900">
              {when(booking.scheduled_start)}
            </p>
            <p className="text-sm text-text-secondary">
              Partner: {booking.partner_display_name} · about{" "}
              {booking.estimated_duration_minutes} min
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              tone={
                booking.status === "RECOVERY_REQUIRED" ||
                booking.status === "DISPUTED"
                  ? "danger"
                  : "info"
              }
            >
              {VISIT_STATUS_LABEL[booking.status ?? ""] ?? booking.status}
            </Badge>
            {booking.payout_hold ? (
              <Badge tone="warning">Partner payout on hold</Badge>
            ) : null}
          </div>
        </div>
        {booking.cancellation_reason ? (
          <p className="mt-2 text-sm text-text-secondary">
            Cancelled: {booking.cancellation_reason}
          </p>
        ) : null}
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">On the way</dt>
            <dd>{when(booking.en_route_at)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Arrived</dt>
            <dd>{when(booking.arrived_at)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Fulfilment unit (for Dispatch)</dt>
            <dd className="break-all font-mono text-xs">
              {booking.fulfilment_unit_id ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Order</dt>
            <dd className="break-all font-mono text-xs">
              {booking.order_id ?? "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <VisitContacts booking={booking} />

      {actions.findReplacement ? (
        <Card className="border-warning-line bg-warning-surface p-5 text-sm text-warning-text">
          <p className="font-semibold">This visit needs a new partner.</p>
          <p className="mt-1">
            Run recovery or offer it to a partner under Dispatch below. Once a replacement
            accepts, confirm them here.
          </p>
        </Card>
      ) : null}
      {actions.confirmReplacement ? (
        <ConfirmReplacement booking={booking} />
      ) : null}
      {actions.assistedStart ? <AssistedStart booking={booking} /> : null}
      {booking.fulfilment_unit_id && NEEDS_DISPATCH_HELP.has(booking.status) ? (
        <VisitDispatch unitId={booking.fulfilment_unit_id} />
      ) : null}
      {booking.operations_cancellation ? (
        <CancelVisit
          booking={booking}
          preview={booking.operations_cancellation}
        />
      ) : REFUNDABLE_AFTER_WORK.has(booking.status) &&
        booking.fulfilment_unit_id ? (
        <RefundVisit booking={booking} />
      ) : null}

      <Card className="p-5">
        <h2 className="text-base font-bold text-text">History</h2>
        {booking.status_history.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">
            No changes recorded yet.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {booking.status_history.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="text-text">
                  {VISIT_STATUS_LABEL[entry.from_status] ?? entry.from_status} →{" "}
                  {VISIT_STATUS_LABEL[entry.to_status] ?? entry.to_status}
                </span>
                <span className="ml-2 text-text-secondary">
                  {when(entry.created_at)}
                </span>
                {entry.reason ? (
                  <p className="text-text-secondary">{entry.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}

function ConfirmReplacement({ booking }: { booking: OperationsBooking }) {
  const confirm = useConfirmReplacement();
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">
        A replacement partner has accepted
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Confirm to hand this visit to them. The customer keeps the same booking.
      </p>
      <Button className="mt-3" onClick={() => setOpen(true)}>
        Confirm replacement
      </Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title="Hand this visit to the replacement partner"
        consequence="The visit moves to the new partner at their accepted slot, and the old partner is released."
        confirmLabel="Confirm replacement"
        pending={confirm.isPending}
        onConfirm={() =>
          confirm.mutate(
            {
              bookingId: booking.id,
              offerId: booking.replacement_offer_id as string,
              expectedVersion: booking.version,
            },
            { onSuccess: () => setOpen(false) },
          )
        }
      >
        {confirm.isError ? (
          <p role="alert" className="text-sm text-danger-text">
            {friendlyErrorMessage(confirm.error)}
          </p>
        ) : null}
      </ConfirmAction>
    </Card>
  );
}

function AssistedStart({ booking }: { booking: OperationsBooking }) {
  const start = useAssistedStart();
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [reason, setReason] = useState("");
  const needsStepUp = isStepUpRequired(start.error);
  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">
        Start without the customer&apos;s code
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Only when the start code cannot reach the customer (SMS or app outage).
        It is recorded with your name and reason, and needs a fresh identity
        check.
      </p>
      {needsStepUp || session === null ? (
        <div className="mt-3">
          <StepUpGate session={session} onSteppedUp={setSession} />
        </div>
      ) : null}
      <Field label="What is down" required className="mt-3">
        <Textarea
          value={reason}
          maxLength={480}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
      <Button
        className="mt-3"
        variant="danger"
        disabled={reason.trim() === ""}
        loading={start.isPending}
        onClick={() =>
          start.mutate({
            bookingId: booking.id,
            outageReason: reason.trim(),
            expectedVersion: booking.version,
          })
        }
      >
        Start the work
      </Button>
      {start.isError && !needsStepUp ? (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {friendlyErrorMessage(start.error)}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Cancel the visit for the customer and refund it, here, with the amounts stated. Refunding a
 * visit used to mean copying its order id into the Refunds page and typing fulfilment-unit ids.
 */
function CancelVisit({
  booking,
  preview,
}: {
  booking: OperationsBooking;
  preview: NonNullable<OperationsBooking["operations_cancellation"]>;
}) {
  const cancel = useCancelVisit();
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [fullRefund, setFullRefund] = useState(true);
  const needsStepUp = isStepUpRequired(cancel.error);
  const feeApplies = !fullRefund && preview.policy_fee_paise > 0;
  const refund = feeApplies
    ? Math.max(0, preview.refundable_paise - preview.policy_fee_paise)
    : preview.refundable_paise;

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Cancel and refund</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Cancel this visit for the customer. The partner is released and the
        refund goes back the way they paid.
      </p>
      <Button className="mt-3" variant="outline" onClick={() => setOpen(true)}>
        Cancel this visit
      </Button>
      {open ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !cancel.isPending) setOpen(false);
          }}
          title="Cancel this visit?"
          description={`The customer is refunded ${formatMoney(refund)}. This cannot be undone.`}
          footer={
            <>
              <Button
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => setOpen(false)}
              >
                Keep the visit
              </Button>
              <Button
                variant="danger"
                disabled={reason.trim() === ""}
                loading={cancel.isPending}
                loadingLabel="Cancelling"
                onClick={() =>
                  cancel.mutate(
                    {
                      bookingId: booking.id,
                      reason: reason.trim(),
                      fullRefund,
                      expectedVersion: booking.version,
                    },
                    { onSuccess: () => setOpen(false) },
                  )
                }
              >
                Cancel and refund
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {needsStepUp || session === null ? (
              <StepUpGate session={session} onSteppedUp={setSession} />
            ) : null}
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-semibold text-text">Refund</legend>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refund"
                  checked={fullRefund}
                  onChange={() => setFullRefund(true)}
                />
                Full refund: {formatMoney(preview.refundable_paise)}
              </label>
              {preview.policy_fee_paise > 0 ? (
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="refund"
                    checked={!fullRefund}
                    onChange={() => setFullRefund(false)}
                  />
                  Keep the cancellation fee of{" "}
                  {formatMoney(preview.policy_fee_paise)}: refund{" "}
                  {formatMoney(
                    Math.max(
                      0,
                      preview.refundable_paise - preview.policy_fee_paise,
                    ),
                  )}
                </label>
              ) : null}
            </fieldset>
            <Field
              label="Reason"
              required
              description="Kept in the visit's history."
            >
              <Textarea
                value={reason}
                maxLength={240}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            {cancel.isError && !needsStepUp ? (
              <p role="alert" className="text-sm text-danger-text">
                {friendlyErrorMessage(cancel.error)}
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}

/** Visits that can no longer be cancelled but may still be refunded, for example over quality. */
const REFUNDABLE_AFTER_WORK = new Set([
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "DISPUTED",
  "ABORTED",
]);

/** Why Operations refunds a finished visit. Sent as the refund's reason code. */
const REFUND_REASONS = [
  { code: "quality-issue", label: "The work was not done properly" },
  { code: "service-not-delivered", label: "The service was not delivered" },
  { code: "partner-no-show", label: "The partner did not turn up" },
  { code: "overcharged", label: "The customer was overcharged" },
  { code: "goodwill", label: "Goodwill" },
] as const;

/**
 * Refund a finished visit in full, from the visit itself. It used to need its order id and
 * fulfilment-unit id typed into the Refunds page.
 */
function RefundVisit({ booking }: { booking: OperationsBooking }) {
  const refund = useRequestRefund();
  const [session, setSession] = useState<StepUpSession | null>(null);
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<string>(REFUND_REASONS[0].code);
  const needsStepUp = isStepUpRequired(refund.error);

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Refund this visit</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Refunds what the customer paid for this visit, back the way they paid.
      </p>
      {refund.isSuccess ? (
        <p
          role="status"
          className="mt-3 text-sm font-semibold text-success-text"
        >
          Refund requested. Track it on Money › Refunds.
        </p>
      ) : (
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          Refund this visit
        </Button>
      )}
      {open ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next && !refund.isPending) setOpen(false);
          }}
          title="Refund this visit?"
          description="The customer is refunded in full for this visit. This cannot be undone."
          footer={
            <>
              <Button
                variant="outline"
                disabled={refund.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={refund.isPending}
                loadingLabel="Refunding"
                onClick={() =>
                  refund.mutate(
                    {
                      orderId: booking.order_id,
                      fulfilmentUnitIds: [booking.fulfilment_unit_id as string],
                      reasonCode,
                    },
                    { onSuccess: () => setOpen(false) },
                  )
                }
              >
                Refund
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            {needsStepUp || session === null ? (
              <StepUpGate session={session} onSteppedUp={setSession} />
            ) : null}
            <Field label="Why">
              <select
                className="min-h-10 w-full rounded-control border border-line bg-surface px-3 text-sm"
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
              >
                {REFUND_REASONS.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
            {refund.isError && !needsStepUp ? (
              <p role="alert" className="text-sm text-danger-text">
                {friendlyErrorMessage(refund.error)}
              </p>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </Card>
  );
}

/** Visits whose partner is not settled: where dispatch help and a manual offer belong. */
const NEEDS_DISPATCH_HELP = new Set(["CONFIRMED", "RECOVERY_REQUIRED"]);

/**
 * Why this visit is or is not placed, the dispatch commands, and offering it to a named partner.
 * All of it used to be opened by pasting the visit's fulfilment-unit id and a partner id.
 */
function VisitDispatch({ unitId }: { unitId: string }) {
  const explanation = useDispatchExplanation(unitId);
  const unitVersion = explanation.data?.unit_version ?? null;
  const offer = useCreateManualOffer();
  const [partner, setPartner] = useState<PickedPartner | null>(null);

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Dispatch</h2>
      <div className="mt-3 flex flex-col gap-4">
        <DispatchExplanation unitId={unitId} />
        <DispatchCommands unitId={unitId} unitVersion={unitVersion} />
        <div className="border-t border-line pt-4">
          <h3 className="text-sm font-bold text-text">Offer to a partner</h3>
          <p className="mt-1 text-sm text-text-secondary">
            When dispatch cannot place it, or the customer asked for someone.
            The partner still has to accept.
          </p>
          <div className="mt-3 max-w-md">
            <PartnerPicker
              value={partner}
              onChange={(next) => {
                setPartner(next);
                offer.reset();
              }}
            />
          </div>
          {offer.isSuccess ? (
            <p
              role="status"
              className="mt-3 text-sm font-semibold text-success-text"
            >
              Offer sent to {partner?.display_name}. It is theirs to accept.
            </p>
          ) : (
            <Button
              className="mt-3"
              disabled={partner === null}
              loading={offer.isPending}
              loadingLabel="Sending the offer"
              onClick={() =>
                partner &&
                offer.mutate({
                  target: "fulfilment-unit",
                  targetId: unitId,
                  partnerId: partner.id,
                })
              }
            >
              Send offer
            </Button>
          )}
          {offer.isError ? (
            <p role="alert" className="mt-2 text-sm text-danger-text">
              {isNotOfferable(offer.error)
                ? "This visit cannot be offered right now. It may already have a partner or an open offer."
                : friendlyErrorMessage(offer.error)}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
