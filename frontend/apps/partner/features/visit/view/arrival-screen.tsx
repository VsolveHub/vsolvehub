"use client";

import { describeError } from "@vsolve/query";
import { Card, ErrorState, Spinner } from "@vsolve/ui";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { readEnquiryRecord } from "@/features/enquiry/model/wire";
import {
  isEnquiryForbidden,
  usePartnerEnquiry,
  type EnquiryDetail,
} from "@/features/enquiry/queries";

import { ArrivalCodeEntry } from "./arrival-code-entry";
import { useVisitDay } from "./use-visit-day";

/**
 * One job, one screen: type the code the customer is reading out.
 *
 * ## Why the code left the enquiry screen
 *
 * It used to open inside `VisitNowCard`, with its submit button in the sticky
 * bar at the other end of the page. That worked, but it asked a vendor standing
 * in a stranger's doorway — phone in one hand, bag in the other, customer
 * reading digits at them — to do the one thing on that screen that needs full
 * attention while four other cards competed for it.
 *
 * So it is a route of its own (owner decision, 2026-09-01). Nothing on it but
 * the six boxes and what to do with them. It is reached deliberately, in two
 * taps — "I've arrived", then "Start OTP" — because arriving and proving you
 * arrived are two different claims and only the second one starts a clock.
 *
 * ## What gates it
 *
 * `permissions.canConfirmArrival` — the server's own answer — and nothing else.
 * Deliberately *not* the visit-day clock gate that hides the button on the
 * enquiry screen: that gate exists to stop an accidental tap on a job three
 * weeks out, and someone who has navigated here has not tapped anything by
 * accident. The server remains the authority either way; a code for a visit it
 * will not start is refused there.
 *
 * ## Where it goes afterwards
 *
 * Back to the enquiry, replacing this entry in history so the browser's back
 * button does not return a vendor to a code box for a visit that has already
 * started. The enquiry screen re-reads and shows the visit as `IN_PROGRESS`,
 * whose one action is "Finish the visit".
 */

export function ArrivalScreen({ invitationId }: { readonly invitationId: string }) {
  const enquiry = usePartnerEnquiry(invitationId);
  const back = `/work/enquiries/${invitationId}`;

  if (enquiry.isPending) {
    return (
      <Screen>
        <p className="flex items-center justify-center gap-2 py-16 text-text-secondary">
          <Spinner size="sm" />
          Loading this visit…
        </p>
      </Screen>
    );
  }

  if (enquiry.isError || enquiry.data === undefined) {
    const forbidden = isEnquiryForbidden(enquiry.error);
    const presentation = enquiry.error ? describeError(enquiry.error, "read") : null;
    return (
      <Screen>
        <ErrorState
          title={forbidden ? "This visit is not yours" : (presentation?.title ?? "We could not load this visit")}
          message={
            forbidden
              ? "Vsolve has no visit with this reference on your account."
              : (presentation?.message ?? "Check your connection and try again.")
          }
          severity={presentation?.severity}
          actionLabel={forbidden ? undefined : "Try again"}
          onAction={forbidden ? undefined : () => void enquiry.refetch()}
          reference={presentation?.reference}
        />
      </Screen>
    );
  }

  return <ArrivalEntry back={back} detail={enquiry.data} />;
}

function ArrivalEntry({
  back,
  detail,
}: {
  readonly back: string;
  readonly detail: EnquiryDetail;
}) {
  const router = useRouter();
  const enquiry = readEnquiryRecord(detail);
  const controls = useVisitDay(enquiry);

  if (controls === null || !controls.permissions.canConfirmArrival) {
    return (
      <Screen>
        <ErrorState
          severity="info"
          title="This visit is not waiting on an arrival code"
          message={
            controls === null
              ? "There is no booked visit on this enquiry."
              : "It has either already started, or it is not one Vsolve can start yet."
          }
          actionLabel="Back to the enquiry"
          onAction={() => router.replace(back)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card className="flex flex-col gap-5 p-5">
        <h1 className="text-xl font-extrabold tracking-[-0.02em] text-text">
          Ask {enquiry.customerName ?? "the customer"} for their arrival code
        </h1>

        <ArrivalCodeEntry
          description="They can read it from their Vsolve app. Entering it starts the visit."
          onSubmit={(code) =>
            controls.arrival.mutate(
              { siteVisitId: controls.visit.id, code },
              // `replace`, not `push`: see the note above on the back button.
              { onSuccess: () => router.replace(back) },
            )
          }
          isSubmitting={controls.arrival.isPending}
          error={
            controls.arrival.error
              ? describeError(controls.arrival.error, "mutation").message
              : null
          }
        />
      </Card>

      <button
        type="button"
        onClick={() => router.push(back)}
        className="mx-auto inline-flex min-h-11 items-center rounded-control px-3 text-sm font-semibold text-text-secondary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        Not there yet
      </button>
    </Screen>
  );
}

function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex min-h-[calc(100dvh-9rem)] flex-col gap-4 bg-canvas px-4 py-6">
      {children}
    </main>
  );
}
