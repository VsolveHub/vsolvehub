"use client";

import { Button, Card, ConfirmAction, ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import { categorizeError, describeError } from "@vsolve/query";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DeclineDialog } from "@/features/enquiry/view/decline-dialog";
import { permissionsFor } from "@/features/enquiry/model/enquiry-state";
import { planVisitOf } from "@/features/enquiry/model/wire";
import type { EnquiryRecord } from "@/features/enquiry/model/wire";
import {
  isCommandInProgress,
  isEnquiryExpired,
  isKycRequired,
  isSlotConflict,
  useDeclineEnquiry,
} from "@/features/enquiry/queries";

import { readSlotGrid, type SlotOption } from "../model/slot-grid";
import { CONFIRM_COMMITMENT, describeConfirmation } from "../model/visit-state";
import {
  isCapacityUnavailable,
  isKycRequired as isSlotKycRequired,
  isNotAVisitLifecycle,
  isPolicyUnavailable,
  isSlotUnavailable,
  isSlotsExhausted,
  isVisitPlanRequired,
  useConfirmVisitSlot,
  usePartnerVisitSlots,
} from "../queries";
import { VisitSlotPicker } from "./visit-slot-picker";

/**
 * The A5 enquiry response: a visit-slot confirmation, on one screen.
 *
 * Closes `M2-FE-314`. This replaces Accept/Decline for a project request,
 * because for A5 **confirming a slot *is* acceptance** — `confirm_visit_slot`
 * takes the quote slot, the soft capacity hold and a hard reservation on the
 * shared availability grid in one command. There is no separate Accept to press
 * first, and offering one would be offering a button that takes a commitment
 * without a time attached to it.
 *
 * ## One screen, because this is a decision about travelling
 *
 * A vendor reads this standing in the street: what is being asked for, when they
 * would have to be there, and what they are agreeing to. The reading order is
 * the decision order and the whole thing is one scroll — the requirement summary
 * sits above this component, and everything that commits the vendor is here.
 *
 * ## Stale tokens are the ordinary case, not an error
 *
 * Every slot id is a signed token that expires, and the grid says so itself
 * through `availability_is_preliminary`. So `m2_visit_slot_unavailable` is
 * handled as a routine outcome: the selection is dropped, the grid is re-read,
 * and the vendor is asked to pick again. **The same id is never resent.**
 *
 * ## An entirely closed grid is still a grid
 *
 * An ineligible vendor gets one where every slot reads `NO_CAPACITY`. That is
 * rendered, with the reason, rather than turned into an error state or an empty
 * screen — see `model/slot-grid.ts › gridShape`.
 */

export interface VisitResponseProps {
  readonly enquiry: EnquiryRecord;
}

export function VisitResponse({ enquiry }: VisitResponseProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<SlotOption | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [decliningOpen, setDecliningOpen] = useState(false);

  const permissions = permissionsFor(enquiry.status);
  const planVisit = planVisitOf(enquiry.siteVisits);
  // The grid is only worth drawing while this vendor can still take a slot.
  // A declined or expired invitation would spend a guaranteed refusal on it.
  // ACCEPTED is the recovery path for project enquiries accepted by the older
  // UI before the visit picker was restored to the live route.
  const canTakeSlot =
    (enquiry.status === "INVITED" || enquiry.status === "ACCEPTED") && planVisit === null;

  const slots = usePartnerVisitSlots(enquiry.id, canTakeSlot);
  const confirm = useConfirmVisitSlot(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);

  const outcome = confirm.data ? describeConfirmation(confirm.data) : null;

  if (outcome) {
    return (
      <Card className="flex flex-col gap-1 p-4" role="status">
        <h2 className="text-base font-bold text-text">{outcome.title}</h2>
        <p className="text-sm leading-5 text-text-secondary">
          {outcome.isHeld
            ? "Waiting for customer payment. Do not travel yet."
            : "You are booked. The customer has been notified."}
        </p>
      </Card>
    );
  }

  if (planVisit !== null) {
    // A slot is already taken on this enquiry. The visit panel below owns it —
    // rendering a second picker here would offer a vendor a way to book twice.
    return null;
  }

  if (!canTakeSlot) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-lg font-bold text-text">Book your site visit</h2>
        <p className="mt-0.5 text-sm leading-5 text-text-secondary">
          Choose when you can attend. Confirming this time accepts the project enquiry and books
          the visit in one step.
        </p>
      </div>

      {slots.isPending ? (
        <SkeletonRegion loading label="Loading visit times">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </SkeletonRegion>
      ) : slots.isError ? (
        <GridError error={slots.error} onRetry={() => void slots.refetch()} />
      ) : (
        <>
          <VisitSlotPicker
            grid={readSlotGrid(slots.data)}
            selectedToken={selected?.token ?? null}
            onSelect={setSelected}
            disabled={confirm.isPending}
          />

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshCw size={16} aria-hidden />}
              disabled={slots.isFetching || confirm.isPending}
              loading={slots.isFetching}
              loadingLabel="Refreshing times"
              onClick={() => {
                // A refresh invalidates every token on screen, so the selection
                // goes with it rather than becoming an id the server refuses.
                setSelected(null);
                void slots.refetch();
              }}
            >
              Refresh times
            </Button>
          </div>
        </>
      )}

      {confirm.error ? (
        <ConfirmRefusal
          error={confirm.error}
          onRecover={() => {
            setSelected(null);
            confirm.reset();
            void slots.refetch();
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={selected === null || confirm.isPending || slots.isFetching}
          loading={confirm.isPending}
          loadingLabel="Confirming"
          onClick={() => setConfirming(true)}
        >
          {selected === null ? "Choose a time" : `Accept & book ${selected.label}`}
        </Button>

        {permissions.canDecline ? (
          <Button variant="outline" onClick={() => setDecliningOpen(true)} disabled={confirm.isPending}>
            Decline
          </Button>
        ) : null}
      </div>

      <p className="text-xs leading-5 text-text-muted">
        If customer payment is still needed, the slot is held first. Travel only after the visit is
        confirmed and the exact address appears in your visit workspace.
      </p>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={selected ? `Accept and book ${selected.label}` : "Accept and book this visit"}
        consequence={CONFIRM_COMMITMENT}
        confirmLabel="Accept & book visit"
        pending={confirm.isPending}
        onConfirm={() => {
          if (selected === null) return;
          confirm.mutate(
            // The token, untouched. Nothing about the time is reconstructed
            // from it — the label above came from `starts_at` beside it.
            { slotToken: selected.token },
            {
              onSuccess: () => {
                setConfirming(false);
                router.replace(`/work/enquiries/${enquiry.id}/visit`);
              },
            },
          );
        }}
      />

      <DeclineDialog
        open={decliningOpen}
        onOpenChange={setDecliningOpen}
        pending={decline.isPending}
        error={decline.error ? describeError(decline.error, "mutation").message : null}
        onDecline={(reasonCode) => {
          decline.mutate({ reasonCode }, { onSuccess: () => setDecliningOpen(false) });
        }}
      />
    </Card>
  );
}

/**
 * Why the grid could not be drawn.
 *
 * Two of these are not the vendor's fault and must not read as though they were:
 * a workforce request has no visit grid at all, and `m2_policy_unavailable` means
 * the owner has not set how long a visit takes for this service — the grid cannot
 * be drawn at an invented width, and no amount of retrying fixes it.
 */
function GridError({ error, onRetry }: { readonly error: unknown; readonly onRetry: () => void }) {
  const presentation = describeError(error, "read");

  if (isNotAVisitLifecycle(error)) {
    return (
      <ErrorState
        inline
        title="This request does not book visits"
        message="Visit slots are only offered on project requests. If you are seeing this on a project enquiry, tell support — the request may be classified as workforce."
        severity="warning"
      />
    );
  }

  if (isPolicyUnavailable(error)) {
    return (
      <ErrorState
        inline
        title="Vsolve cannot offer times for this request yet"
        message="Nobody has set how long a visit takes for this service, so we will not guess at one and show you slots of the wrong length. This is on us, not on you — support has been able to see it since you opened this screen."
        severity="warning"
        reference={presentation.reference}
      />
    );
  }

  if (isVisitPlanRequired(error)) {
    return (
      <ErrorState
        inline
        title="The customer has not chosen a visit plan yet"
        message="There is nothing to confirm until they do. Vsolve will let you know when this request is ready for you."
        severity="info"
      />
    );
  }

  return (
    <ErrorState
      inline
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      actionLabel="Try again"
      onAction={onRetry}
      reference={presentation.reference}
    />
  );
}

/**
 * A refused confirmation.
 *
 * Every branch here recovers by re-reading, never by resending. The one that
 * matters most is `m2_visit_slot_unavailable`: it is what a stale token returns,
 * it is expected rather than exceptional, and its only recovery is a fresh grid
 * and a different time.
 */
function ConfirmRefusal({
  error,
  onRecover,
}: {
  readonly error: unknown;
  readonly onRecover: () => void;
}) {
  const presentation = describeError(error, "mutation");

  if (isSlotUnavailable(error)) {
    return (
      <ErrorState
        inline
        title="That time has gone"
        message="Somebody took it, or it sat on this screen long enough to lapse. Nothing was booked and nothing counts against you — pick another time from the refreshed list."
        severity="warning"
        actionLabel="Show me the times that are left"
        onAction={onRecover}
      />
    );
  }

  if (isCapacityUnavailable(error)) {
    return (
      <ErrorState
        inline
        title="You are already committed then"
        message="Vsolve checks this visit against everything else in your calendar, including your task jobs. Pick a time you are actually free."
        severity="warning"
        actionLabel="Show me the times that are left"
        onAction={onRecover}
      />
    );
  }

  if (isSlotsExhausted(error)) {
    return (
      <ErrorState
        inline
        title="Other vendors filled this customer's plan"
        message="Every visit the customer paid for is now taken. Nothing was charged to you and nothing is held against you."
        severity="info"
      />
    );
  }

  if (isSlotConflict(error)) {
    return (
      <ErrorState
        inline
        title="One visit per owner"
        message="Another account linked to the same owner already holds a visit on this request. Vsolve allows one."
        severity="warning"
      />
    );
  }

  if (isEnquiryExpired(error)) {
    return (
      <ErrorState
        inline
        title="The response window closed"
        message="This enquiry went back to the pool before your confirmation landed. Nothing was booked."
        severity="warning"
      />
    );
  }

  if (isSlotKycRequired(error) || isKycRequired(error)) {
    return (
      <ErrorState
        inline
        title="Vsolve needs to verify you first"
        message={presentation.message}
        severity="warning"
        actionLabel="Finish verification"
        onAction={() => {
          window.location.assign("/apply");
        }}
      />
    );
  }

  if (isCommandInProgress(error)) {
    return (
      <ErrorState
        inline
        title="This is still going through"
        message="Give it a moment and re-read this enquiry. Do not confirm again — the same time would be taken twice."
        severity="info"
        actionLabel="Re-read"
        onAction={onRecover}
      />
    );
  }

  return (
    <ErrorState
      inline
      title={presentation.title}
      message={presentation.message}
      severity={categorizeError(error) === "expired" ? "warning" : presentation.severity}
      actionLabel="Re-read the times"
      onAction={onRecover}
      reference={presentation.reference}
    />
  );
}
