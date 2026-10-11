"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, ConfirmAction, ErrorState, Field, Input, Spinner, Textarea } from "@vsolve/ui";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { isStepUpRequired, type StepUpSession } from "@/features/finance/queries";
import { StepUpGate } from "@/features/finance/view/step-up-gate";
import { isUuid } from "@/features/shared/identifiers";

import {
  VISIT_STATUS_LABEL,
  useAssistedStart,
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
 * Look up one home-service visit by its booking id — usually copied from a case — and take the
 * two Operations actions a visit can need: hand it to a replacement partner, or start it during
 * an OTP outage.
 */
export function VisitLookup() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("id");
  const bookingId = current && isUuid(current) ? current : null;
  const [typed, setTyped] = useState(current ?? "");
  const [submitted, setSubmitted] = useState(false);
  const visit = useVisit(bookingId);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-900">Visit lookup</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Paste a booking id from a case or a customer message to see where a home-service visit
          stands and act on it.
        </p>
      </header>
      <Card className="p-5">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (isUuid(typed)) router.replace(`${pathname}?id=${typed.trim()}`);
          }}
        >
          <Field
            label="Booking id"
            className="min-w-72 flex-1"
            error={submitted && !isUuid(typed) ? "That is not a booking id." : undefined}
          >
            <Input value={typed} spellCheck={false} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
          </Field>
          <Button type="submit">Open visit</Button>
        </form>
      </Card>

      {bookingId === null ? null : visit.isPending ? (
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

function VisitRecord({ booking }: { booking: OperationsBooking }) {
  const actions = visitActions(booking);
  return (
    <>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold text-navy-900">{when(booking.scheduled_start)}</p>
            <p className="text-sm text-text-secondary">
              Partner: {booking.partner_display_name} · about {booking.estimated_duration_minutes} min
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge tone={booking.status === "RECOVERY_REQUIRED" || booking.status === "DISPUTED" ? "danger" : "info"}>
              {VISIT_STATUS_LABEL[booking.status ?? ""] ?? booking.status}
            </Badge>
            {booking.payout_hold ? <Badge tone="warning">Partner payout on hold</Badge> : null}
          </div>
        </div>
        {booking.cancellation_reason ? (
          <p className="mt-2 text-sm text-text-secondary">Cancelled: {booking.cancellation_reason}</p>
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
            <dd className="break-all font-mono text-xs">{booking.fulfilment_unit_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Order</dt>
            <dd className="break-all font-mono text-xs">{booking.order_id ?? "—"}</dd>
          </div>
        </dl>
      </Card>

      {actions.findReplacement ? (
        <Card className="border-warning-line bg-warning-surface p-5 text-sm text-warning-text">
          <p className="font-semibold">This visit needs a new partner.</p>
          <p className="mt-1">
            Open <Link className="underline" href="/operations/dispatch">Dispatch</Link>, paste the
            fulfilment unit id above and run recovery. Once a replacement accepts, come back here to
            confirm them.
          </p>
        </Card>
      ) : null}
      {actions.confirmReplacement ? <ConfirmReplacement booking={booking} /> : null}
      {actions.assistedStart ? <AssistedStart booking={booking} /> : null}

      <Card className="p-5">
        <h2 className="text-base font-bold text-text">History</h2>
        {booking.status_history.length === 0 ? (
          <p className="mt-2 text-sm text-text-secondary">No changes recorded yet.</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {booking.status_history.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="text-text">
                  {VISIT_STATUS_LABEL[entry.from_status] ?? entry.from_status} →{" "}
                  {VISIT_STATUS_LABEL[entry.to_status] ?? entry.to_status}
                </span>
                <span className="ml-2 text-text-secondary">{when(entry.created_at)}</span>
                {entry.reason ? <p className="text-text-secondary">{entry.reason}</p> : null}
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
      <h2 className="text-base font-bold text-text">A replacement partner has accepted</h2>
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
      <h2 className="text-base font-bold text-text">Start without the customer&apos;s code</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Only when the start code cannot reach the customer (SMS or app outage). It is recorded with
        your name and reason, and needs a fresh identity check.
      </p>
      {needsStepUp || session === null ? (
        <div className="mt-3">
          <StepUpGate session={session} onSteppedUp={setSession} />
        </div>
      ) : null}
      <Field label="What is down" required className="mt-3">
        <Textarea value={reason} maxLength={480} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <Button
        className="mt-3"
        variant="danger"
        disabled={reason.trim() === ""}
        loading={start.isPending}
        onClick={() =>
          start.mutate({ bookingId: booking.id, outageReason: reason.trim(), expectedVersion: booking.version })
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
