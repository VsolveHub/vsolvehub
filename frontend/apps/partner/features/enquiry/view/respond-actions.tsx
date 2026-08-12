"use client";

import { Button, Card, ConfirmAction, ErrorState } from "@vsolve/ui";
import { describeError, categorizeError } from "@vsolve/query";
import { useState } from "react";

import { shortDate } from "@/lib/format";
import { readDurationDays } from "../model/requirement-facts";
import { describeStatus, permissionsFor } from "../model/enquiry-state";
import { describeDeclineReason } from "../model/decline-reasons";
import type { EnquiryRecord } from "../model/wire";
import {
  isCommandInProgress,
  isEnquiryExpired,
  isKycRequired,
  isSlotConflict,
  isSlotsExhausted,
  useAcceptEnquiry,
  useDeclineEnquiry,
} from "../queries";
import { DeclineDialog } from "./decline-dialog";

/**
 * Accept, or decline with a reason.
 *
 * Closes `M2-FE-303`. The two commands share a component because they share a
 * failure surface: whichever one was pressed, a refusal has to say what the
 * enquiry's state actually is now, and both are refused by the same four rules.
 *
 * ## Duplicate-click protection, in three layers
 *
 * 1. The control is disabled while its own mutation is in flight.
 * 2. Both commands carry a stable `Idempotency-Key`, so a tap that beats the
 *    disabled state resolves to the same logical command rather than a second
 *    one.
 * 3. `retry: false` on both mutations, so nothing automatic ever mints an
 *    attempt the vendor did not make.
 *
 * ## Stale state
 *
 * A refusal here almost always means the screen is out of date rather than that
 * the vendor did something wrong: the slot went while they were reading, the
 * window closed, a linked account got there first. So every refusal names the
 * new reality and offers a re-read — and the mutation's own `onError` has
 * already invalidated the enquiry, so the screen behind the message is on its
 * way to being right.
 *
 * `m2_kyc_required` is the exception and is treated as one. It is a 403 that is
 * an unfinished form, not a denial — the progressive gate from `M2-FE-102`
 * firing at the first accept, exactly where it was designed to. Routing it to a
 * locked-out screen is how a Partner four fields from working concludes their
 * account is broken.
 */

export interface RespondActionsProps {
  readonly enquiry: EnquiryRecord;
}

function refusalMessage(error: unknown): string | null {
  if (isEnquiryExpired(error)) {
    return "The response window closed before this went through. The slot is back in the pool and this enquiry cannot be accepted now.";
  }
  if (isSlotsExhausted(error)) {
    return "Other vendors took the customer's quote slots first. Nothing was charged and nothing is held against you.";
  }
  if (isSlotConflict(error)) {
    return "Another account linked to the same owner already holds a slot on this request. Vsolve allows one quote per owner.";
  }
  if (isCommandInProgress(error)) {
    return "This is still going through. Give it a moment and re-read the enquiry — do not send it again.";
  }
  return null;
}

export function RespondActions({ enquiry }: RespondActionsProps) {
  const [confirmingAccept, setConfirmingAccept] = useState(false);
  const [decliningOpen, setDecliningOpen] = useState(false);

  const accept = useAcceptEnquiry(enquiry.id);
  const decline = useDeclineEnquiry(enquiry.id);

  const permissions = permissionsFor(enquiry.status);
  const status = describeStatus(enquiry.status);
  const durationDays = readDurationDays(enquiry.answers);

  const inFlight = accept.isPending || decline.isPending;
  const error = accept.error ?? decline.error;
  const presentation = error ? describeError(error, "mutation") : null;
  const named = refusalMessage(error);
  const kycGate = isKycRequired(error);

  // Nothing to offer. The status line is still shown, because "you declined
  // this" with the reason is information the vendor came here for.
  if (!permissions.canAccept && !permissions.canDecline) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold text-text">{status.label}</p>
        <p className="text-sm leading-6 text-text-secondary">{status.meaning}</p>
        {enquiry.declineReasonCode ? (
          <p className="text-sm leading-6 text-text-secondary">
            Reason recorded: {describeDeclineReason(enquiry.declineReasonCode)}
          </p>
        ) : null}
      </Card>
    );
  }

  const holdSentence =
    durationDays !== null && enquiry.requestedStart
      ? `Accepting takes one of the customer's quote slots and holds your availability for ${durationDays} ${durationDays === 1 ? "day" : "days"} from ${shortDate(enquiry.requestedStart)}.`
      : "Accepting takes one of the customer's quote slots and holds your availability for the dates on this request.";

  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="text-sm leading-6 text-text-secondary">
        {holdSentence} The hold is released the moment you decline, quote, or the enquiry closes.
      </p>

      {presentation ? (
        <ErrorState
          inline
          title={kycGate ? "Vsolve needs to verify you first" : presentation.title}
          message={kycGate ? presentation.message : (named ?? presentation.message)}
          severity={categorizeError(error) === "expired" ? "warning" : presentation.severity}
          actionLabel={kycGate ? "Finish verification" : "Re-read this enquiry"}
          onAction={
            kycGate
              ? () => {
                  window.location.assign("/apply");
                }
              : () => {
                  accept.reset();
                  decline.reset();
                }
          }
          reference={presentation.reference}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {permissions.canAccept ? (
          <Button
            onClick={() => setConfirmingAccept(true)}
            disabled={inFlight}
            loading={accept.isPending}
            loadingLabel="Accepting"
          >
            Accept
          </Button>
        ) : null}

        {permissions.canDecline ? (
          <Button
            variant="outline"
            onClick={() => setDecliningOpen(true)}
            disabled={inFlight}
          >
            Decline
          </Button>
        ) : null}
      </div>

      <ConfirmAction
        open={confirmingAccept}
        onOpenChange={setConfirmingAccept}
        title="Accept this enquiry"
        consequence={
          <>
            {holdSentence} Vsolve will ask you to verify your identity first if you have not
            already. You are not committing to a price yet — your quote comes next.
          </>
        }
        confirmLabel="Accept"
        pending={accept.isPending}
        onConfirm={() => {
          accept.mutate(undefined, { onSuccess: () => setConfirmingAccept(false) });
        }}
      />

      <DeclineDialog
        open={decliningOpen}
        onOpenChange={setDecliningOpen}
        pending={decline.isPending}
        error={decline.error ? (named ?? describeError(decline.error, "mutation").message) : null}
        onDecline={(reasonCode) => {
          decline.mutate({ reasonCode }, { onSuccess: () => setDecliningOpen(false) });
        }}
      />
    </Card>
  );
}
