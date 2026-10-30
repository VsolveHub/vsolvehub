"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { Button } from "@vsolve/ui";

import { useRequestStartOtp, useVisit } from "@/features/visit/queries";

/**
 * The code the customer reads out to let work begin.
 *
 * This is the only thing standing between "somebody is at my door" and work
 * starting, so it belongs on the screen the customer is already looking at
 * rather than one tap further in.
 *
 * ## Shown only when it can be used
 *
 * The code is meaningless before the professional arrives and spent once work
 * has started. Rendering it at `BOOKED` would invite the customer to hand it
 * over on the phone hours early, which is exactly the thing it exists to
 * prevent — it proves someone is standing there, and that proof is worthless if
 * it can be given away in advance.
 *
 * ## Requested, not polled
 *
 * Django issues the code on demand and rate-limits it. Asking for one on every
 * render would burn the cooldown before the professional reached the door.
 * Asking again inside the cooldown returns the same live code, so a refresh at
 * the door never leaves the customer with nothing to read out.
 *
 * ## On screen, not by SMS
 *
 * The code comes back in the response (contract 1.82.0) to this customer and
 * nobody else. A job never waits on a text message arriving; the SMS, when one
 * is sent, is a copy.
 */
export function VisitStartCode({
  bookingId,
  status,
}: {
  bookingId: string;
  status: Schemas["BookingStatusEnum"];
}) {
  // The visit read carries the version the command has to send, and is already
  // cached by the tracking page.
  const visit = useVisit(bookingId);
  const requestOtp = useRequestStartOtp();

  if (status !== "ARRIVED") return null;

  const code = requestOtp.data?.code ?? null;

  return (
    <div className="rounded-card bg-navy-900 p-4 text-text-inverse">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-warm-300">
            Start code
          </p>
          <p className="mt-0.5 text-sm text-warm-100">
            Read this out to start the work — and only once they are with you.
          </p>
        </div>

        {code === null ? (
          <Button
            variant="outline"
            className="border-warm-300 bg-white text-ink-950 font-bold hover:bg-warm-100"
            loading={requestOtp.isPending}
            loadingLabel="Getting code"
            disabled={visit.data === undefined}
            onClick={() => {
              if (visit.data === undefined) return;
              requestOtp.mutate({ bookingId, expectedVersion: visit.data.version });
            }}
          >
            Show code
          </Button>
        ) : (
          <p
            data-numeric
            className="rounded-control bg-navy-800 px-5 py-2 text-2xl font-bold tracking-[0.35em] text-white"
          >
            {code}
          </p>
        )}
      </div>

      {requestOtp.isError ? (
        <p className="mt-3 text-sm text-warm-100" role="alert">
          {describeError(requestOtp.error, "mutation").message}
        </p>
      ) : null}
    </div>
  );
}
