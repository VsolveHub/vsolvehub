"use client";

import { friendlyErrorMessage, queryKeys } from "@vsolve/query";
import { Button, Dialog, Field, Textarea } from "@vsolve/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { isSelfReview, isVersionConflict, useTransitionApplication } from "@/features/partner-review/queries";

import type { PartnerRecord } from "../queries";

type Target = "SUSPENDED" | "APPROVED" | "OFFBOARDED";

interface StandingAction {
  target: Target;
  label: string;
  title: string;
  description: string;
  danger: boolean;
  reasonRequired: boolean;
}

const SUSPEND: StandingAction = {
  target: "SUSPENDED",
  label: "Suspend",
  title: "Suspend this partner?",
  description: "They go offline at once and get no new work until they are reinstated.",
  danger: true,
  reasonRequired: true,
};
const REINSTATE: StandingAction = {
  target: "APPROVED",
  label: "Reinstate",
  title: "Reinstate this partner?",
  description: "They can go online and take work again.",
  danger: false,
  reasonRequired: false,
};
const OFFBOARD: StandingAction = {
  target: "OFFBOARDED",
  label: "Offboard",
  title: "Offboard this partner?",
  description: "This ends their time on the platform. It cannot be undone from the console.",
  danger: true,
  reasonRequired: true,
};

/** What can be done to a partner's standing from here. Application decisions stay on Applications. */
export function standingActions(status: string): StandingAction[] {
  if (status === "APPROVED") return [SUSPEND, OFFBOARD];
  if (status === "SUSPENDED") return [REINSTATE, OFFBOARD];
  return [];
}

const IN_REVIEW = new Set(["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUIRED"]);

/**
 * Call, suspend, reinstate and offboard from the partner's own record. These used to be reachable
 * only from Applications, so suspending a working partner meant finding their old application.
 */
export function PartnerStanding({ partner }: { partner: PartnerRecord }) {
  const queryClient = useQueryClient();
  const transition = useTransitionApplication();
  const [action, setAction] = useState<StandingAction | null>(null);
  const [reason, setReason] = useState("");
  const actions = standingActions(partner.application_status);

  function close() {
    if (transition.isPending) return;
    setAction(null);
    setReason("");
    transition.reset();
  }

  function confirm() {
    if (!action) return;
    transition.mutate(
      {
        applicationId: partner.application_id,
        targetStatus: action.target,
        expectedVersion: partner.application_version,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
      {
        onSuccess: () => {
          setAction(null);
          setReason("");
        },
        onSettled: () => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.operations.partnerRecord(partner.id) });
          void queryClient.invalidateQueries({
            queryKey: [...queryKeys.operations.all, "partner-directory"],
          });
        },
      },
    );
  }

  const failure = transition.error
    ? isVersionConflict(transition.error)
      ? "Someone else changed this partner a moment ago. The record has been refreshed; check it and try again."
      : isSelfReview(transition.error)
        ? "You cannot change your own partner account."
        : friendlyErrorMessage(transition.error)
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {partner.phone_number ? (
        <a
          href={`tel:${partner.phone_number}`}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line px-3 text-sm font-semibold text-text hover:bg-surface-sunken"
        >
          <Phone aria-hidden className="size-4" /> Call {partner.phone_number}
        </a>
      ) : null}
      {actions.map((entry) => (
        <Button
          key={entry.target}
          size="sm"
          variant={entry.danger ? "outline" : "primary"}
          onClick={() => {
            transition.reset();
            setReason("");
            setAction(entry);
          }}
        >
          {entry.label}
        </Button>
      ))}
      {IN_REVIEW.has(partner.application_status) ? (
        <Link href="/reviews" className="text-sm font-semibold text-text-link hover:underline">
          Decide on Applications
        </Link>
      ) : null}

      {action ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title={action.title}
          description={action.description}
          footer={
            <>
              <Button variant="outline" disabled={transition.isPending} onClick={close}>
                Cancel
              </Button>
              <Button
                variant={action.danger ? "danger" : "primary"}
                disabled={action.reasonRequired && !reason.trim()}
                loading={transition.isPending}
                loadingLabel="Saving"
                onClick={confirm}
              >
                {action.label}
              </Button>
            </>
          }
        >
          <Field
            label="Reason"
            description="Kept in the partner's history. Not shown to the partner."
            required={action.reasonRequired}
          >
            <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {failure ? (
            <p role="alert" className="mt-3 text-sm text-danger-text">
              {failure}
            </p>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
