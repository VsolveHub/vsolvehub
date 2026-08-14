"use client";

import { Button, Card, ErrorState } from "@vsolve/ui";
import { describeError, isStageTransitionNotAllowed } from "@vsolve/query";
import { MapPin } from "lucide-react";

import { timeAgo } from "@/lib/format";

import { useConfirmShiftArrival, type ShiftCommandScope, type ShiftDay } from "../queries";
import { ARRIVAL_IS_A_PERSONS_WORD } from "../model/shift-copy";

/**
 * The crew arrived — `M2-FE-504`.
 *
 * ## Non-OTP is the path, not the fallback
 *
 * The task is worded "using the non-OTP fallback path" and the contract corrects
 * it: "**Non-OTP, and that is the default path in M2** rather than a degraded
 * one — the start OTP is M3." So nothing on this screen apologises, warns, or
 * describes the arrival as unverified. On this platform, today, a person who was
 * at the site says so and the server stamps the time. A banner explaining that a
 * better mechanism exists elsewhere would teach a supervisor to distrust the one
 * they have.
 *
 * ## It never claims more than it knows
 *
 * The button reports nothing until the server answers. Three things happen in
 * one server transaction — the arrival is stamped, the stage starts, and **on
 * day one the booking fee is earned** — and an optimistic tick would be this
 * screen asserting all three before any of them happened. On a failure the day
 * is re-read rather than patched, because a timeout after Django committed looks
 * identical to one before it.
 *
 * Retry-safe: the idempotency key is scoped to the stage alone, and the command
 * carries no payload that could turn a retry into a different request. The server
 * is idempotent on its own state besides — an already-stamped arrival answers
 * with the same record rather than a second one.
 *
 * ## Crew first, always
 *
 * "Confirming that people arrived before saying who they are records nothing
 * anybody can act on." So with nobody named this panel states the order rather
 * than offering a button that can only be refused.
 */

export interface ArrivalPanelProps {
  readonly day: ShiftDay;
  readonly scope: ShiftCommandScope;
  /** False when the grant no longer carries `attendance.confirm`. */
  readonly canConfirm: boolean;
}

export function ArrivalPanel({ day, scope, canConfirm }: ArrivalPanelProps) {
  const confirm = useConfirmShiftArrival(scope);
  const confirmedAt = day.attendance?.arrival_confirmed_at ?? null;
  const hasCrew = day.crew.length > 0;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text">
        <MapPin size={18} aria-hidden />
        Arrival
      </h2>

      {confirmedAt !== null ? (
        <p className="text-sm leading-6 text-text-secondary">
          Recorded as arrived {timeAgo(confirmedAt)}. Nothing else needs doing until the end of the
          day.
        </p>
      ) : !hasCrew ? (
        <p className="text-sm leading-6 text-text-secondary">
          Name your crew above first. Confirming that people arrived before saying who they are
          records nothing anybody can act on.
        </p>
      ) : !canConfirm ? (
        <p className="text-sm leading-6 text-text-secondary">
          Your account is not approved to record arrivals at the moment. The customer can still
          record it from their side — you were both there.
        </p>
      ) : (
        <>
          <p className="text-sm leading-6 text-text-secondary">
            Tap this once your crew is on site. {ARRIVAL_IS_A_PERSONS_WORD}
          </p>
          {day.position === 1 ? (
            <p className="text-xs leading-5 text-text-muted">
              This is the first day of the booking, so confirming it is also what earns Vsolve&rsquo;s
              booking fee from the customer. It does not pay out any wages — those are settled
              directly with you at the end of each day.
            </p>
          ) : null}
          <Button
            type="button"
            onClick={() => confirm.mutate()}
            loading={confirm.isPending}
            loadingLabel="Recording"
            disabled={confirm.isPending}
          >
            My crew has arrived
          </Button>
        </>
      )}

      {confirm.isError ? <ArrivalFailure error={confirm.error} /> : null}
    </Card>
  );
}

function ArrivalFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");

  if (isStageTransitionNotAllowed(error)) {
    return (
      <ErrorState
        title="This day is not ready for an arrival"
        message="Vsolve refused it because there is no crew on the day yet, or the booking has already closed. Reload to see where it got to — pressing again would send the same command against the state that just refused it."
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
