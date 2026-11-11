"use client";

import { friendlyErrorMessage } from "@vsolve/query";
import { Badge, Button, Card, Dialog, ErrorState, Field, Input, Spinner, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import {
  ACTOR_LABEL,
  CANCEL_REASON_MAX,
  OFFER_LABEL,
  canForceCancel,
  cancelReasonError,
  distanceText,
  stateLabel,
  stateTone,
} from "../model";
import { useForceCancel, useOpsRide, type OpsRideDetail } from "../queries";

const WHEN = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kolkata" });

function when(value: string | null | undefined): string {
  return value ? WHEN.format(new Date(value)) : "—";
}

function ForceCancel({ ride }: { ride: OpsRideDetail }) {
  const cancel = useForceCancel(ride.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const problem = cancelReasonError(reason);

  function close() {
    if (cancel.isPending) return;
    setOpen(false);
    setReason("");
    setTouched(false);
    cancel.reset();
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Force cancel
      </Button>
      {open ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
          title="Cancel this ride?"
          description={
            ride.state === "IN_TRIP"
              ? "The trip is under way. The rider and captain are told at once, and the captain becomes free. This can't be undone."
              : "The rider and captain are told at once, and any captain becomes free. This can't be undone."
          }
          footer={
            <>
              <Button variant="outline" disabled={cancel.isPending} onClick={close}>
                Keep the ride
              </Button>
              <Button
                variant="danger"
                disabled={problem !== null}
                loading={cancel.isPending}
                loadingLabel="Cancelling"
                onClick={() => cancel.mutate(reason.trim(), { onSuccess: close })}
              >
                Cancel ride
              </Button>
            </>
          }
        >
          <Field
            label="Reason"
            description={`Required, up to ${CANCEL_REASON_MAX} characters.`}
            error={cancel.error ? friendlyErrorMessage(cancel.error) : touched ? (problem ?? undefined) : undefined}
          >
            <Input
              value={reason}
              maxLength={CANCEL_REASON_MAX}
              onChange={(e) => {
                setReason(e.target.value);
                setTouched(true);
              }}
            />
          </Field>
        </Dialog>
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-medium text-text">{children}</span>
    </div>
  );
}

/** One ride for Operations: both people, fares, every state change and every offer. */
export function RideDetail({ rideId }: { rideId: string }) {
  const ride = useOpsRide(rideId);

  if (ride.isPending) return <Spinner />;
  if (ride.isError) {
    return (
      <ErrorState
        title="We couldn't load this ride"
        message={friendlyErrorMessage(ride.error)}
        actionLabel="Try again"
        onAction={() => void ride.refetch()}
      />
    );
  }

  const data = ride.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-navy-900">{data.vehicle_type} ride</h1>
          <Badge tone={stateTone(data.state)}>{stateLabel(data.state)}</Badge>
        </div>
        {canForceCancel(data.state) ? <ForceCancel ride={data} /> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-2 font-semibold text-text">People</h2>
          <Row label="Rider">
            {data.rider.name} · <a className="text-text-link" href={`tel:${data.rider.phone_number}`}>{data.rider.phone_number}</a>
          </Row>
          <Row label="Captain">
            {data.captain ? (
              <>
                {data.captain.name} ·{" "}
                <a className="text-text-link" href={`tel:${data.captain.phone_number}`}>
                  {data.captain.phone_number}
                </a>
              </>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Vehicle">
            {data.vehicle ? `${data.vehicle.registration_number} · ${data.vehicle.make_model}, ${data.vehicle.colour}` : "—"}
          </Row>
          <Row label="Rider rated captain">{data.ratings.RIDER ? `★ ${data.ratings.RIDER}` : "—"}</Row>
          <Row label="Captain rated rider">{data.ratings.CAPTAIN ? `★ ${data.ratings.CAPTAIN}` : "—"}</Row>
        </Card>

        <Card className="p-4">
          <h2 className="mb-2 font-semibold text-text">Trip</h2>
          <Row label="From">{data.pickup.address}</Row>
          <Row label="To">{data.drop.address}</Row>
          <Row label="Fare">{formatMoney(data.fare_paise)}</Row>
          <Row label="Waiting">{formatMoney(data.waiting_paise)}</Row>
          <Row label="Final fare">{data.final_fare_paise != null ? formatMoney(data.final_fare_paise) : "—"}</Row>
          <Row label="Payment">{data.payment_status === "COLLECTED" ? "Collected by captain" : "Due"}</Row>
          <Row label="Wrong start codes">{data.otp_attempts}</Row>
          {data.cancelled_by ? (
            <Row label="Cancelled by">
              {ACTOR_LABEL[data.cancelled_by] ?? data.cancelled_by}
              {data.cancel_reason ? ` · ${data.cancel_reason}` : ""}
            </Row>
          ) : null}
        </Card>
      </div>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold text-text">What happened</h2>
        <ol className="flex flex-col gap-2 text-sm">
          {data.transitions.map((step, index) => (
            <li key={`${step.at}-${index}`} className="flex flex-wrap gap-x-3">
              <span className="w-44 shrink-0 text-text-secondary">{when(step.at)}</span>
              <span className="font-medium text-text">
                {step.from_state ? `${stateLabel(step.from_state)} → ` : ""}
                {stateLabel(step.to_state)}
              </span>
              <span className="text-text-secondary">
                by {ACTOR_LABEL[step.actor_kind] ?? step.actor_kind}
                {step.actor_name ? ` (${step.actor_name})` : ""}
                {step.reason ? ` · ${step.reason}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold text-text">Offers sent</h2>
        {data.offers.length === 0 ? (
          <p className="text-sm text-text-secondary">No captain was offered this ride.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-text-secondary">
                <tr>
                  <th className="py-2 pr-4">Round</th>
                  <th className="py-2 pr-4">Captain</th>
                  <th className="py-2 pr-4">Distance</th>
                  <th className="py-2 pr-4">Answer</th>
                  <th className="py-2 pr-4">Offered</th>
                </tr>
              </thead>
              <tbody>
                {data.offers.map((offer) => (
                  <tr key={`${offer.captain_id}-${offer.round}`} className="border-t border-line">
                    <td className="py-2 pr-4">{offer.round}</td>
                    <td className="py-2 pr-4">{offer.captain_name}</td>
                    <td className="py-2 pr-4">{distanceText(offer.pickup_distance_m)}</td>
                    <td className="py-2 pr-4">{OFFER_LABEL[offer.status] ?? offer.status}</td>
                    <td className="py-2 pr-4">{when(offer.offered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
