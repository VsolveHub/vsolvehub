"use client";

import { Badge, Button, buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { engagementHref } from "@/lib/routes";
import type { ReactNode } from "react";

import type { SelectionView } from "../adapters";

/**
 * Where a chosen vendor stands — `M2-FE-411`, `M2-FE-412`, `M2-FE-414`.
 *
 * ## Choosing is now booking
 *
 * This component used to exist to prevent one thing: a selection read as a
 * booking. Choosing started a reconfirmation clock, and a Customer who read
 * `PENDING_RECONFIRMATION` as confirmed cleared their Saturday for a
 * professional who had never agreed to come.
 *
 * The vendor's second step is gone — every check it made now runs at selection,
 * so a vendor who cannot take the job cannot be chosen — and choosing opens the
 * engagement in the same command. The warning this component was built around no
 * longer describes anything.
 *
 * `PENDING_RECONFIRMATION` is kept, unchanged, for the selections written before
 * that. They are real rows a real Customer can still open, and the warning is
 * still the truthful thing to show them.
 *
 * ## Decline and timeout are one state here and two on the server
 *
 * `M2-FE-412`. For the Customer the next step and the guarantee are identical:
 * the other quotes are still there, the entitlement survives untouched, and the
 * next one **costs nothing more**. They are separate on the server because a
 * vendor reading their own timeout as a rejection would be told the wrong story
 * about their own standing — the quote is marked `LAPSED`, never `REJECTED`.
 *
 * The "no second charge" sentence is not reassurance decoration. It is the
 * behaviour the contract guarantees, and a Customer who suspects otherwise will
 * simply not choose again.
 */

export interface SelectionStatusProps {
  selection: SelectionView;
  vendorName: string | null;
  /**
   * From `useServerCountdown` on `reconfirmBy`. Null when there is no clock.
   *
   * Only ever set for a selection written before choosing opened the engagement.
   * Nothing creates a reconfirmation deadline any more.
   */
  reconfirmRemaining: string | null;
  /** Where the engagement is read, once one exists. */
  /** Offered on a decline or timeout: go back and pick another. */
  onChooseAnother?: () => void;
  supportAction?: ReactNode;
}

export function SelectionStatus({
  selection,
  vendorName,
  reconfirmRemaining,
  onChooseAnother,
  supportAction,
}: SelectionStatusProps) {
  const who = vendorName ?? "the professional you chose";

  switch (selection.status) {
    // Legacy only — see the note above. No selection made after the handshake was
    // removed can reach this branch.
    case "PENDING_RECONFIRMATION":
      return (
        <Panel tone="warning" badge={<Badge tone="warning" dot>Waiting</Badge>} title={`${who} has not confirmed yet`}>
          <p className="max-w-prose text-sm leading-6 text-text">
            <strong className="font-semibold">This is not a booking yet.</strong> We
            have asked them to confirm the price, the date and that they have the
            people free. Do not change your plans until they have.
          </p>
          {reconfirmRemaining !== null ? (
            <p className="mt-2 text-sm text-text-secondary">
              They have {reconfirmRemaining.replace(/ left$/, "")} to answer.
            </p>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">
              We have not set a deadline for this area yet, so we cannot tell you
              when they must answer by.
            </p>
          )}
          <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
            If they say no or run out of time, the other quotes are still yours to
            read and choose from — at no extra charge.
          </p>
        </Panel>
      );

    case "DECLINED":
    case "EXPIRED":
      return (
        <Panel
          tone="warning"
          badge={<Badge tone="warning">Not going ahead</Badge>}
          title={
            selection.status === "DECLINED"
              ? `${who} could not take this on`
              : `${who} did not answer in time`
          }
        >
          <p className="max-w-prose text-sm leading-6 text-text">
            Nothing is lost. Every other quote on this request is still here,
            still readable, and{" "}
            <strong className="font-semibold">choosing another one costs you nothing more</strong> —
            what you already paid still covers it.
          </p>
          {selection.declineReasonCode !== null ? (
            <p className="mt-2 text-sm text-text-secondary">
              Their reason: {selection.declineReasonCode}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {onChooseAnother !== undefined ? (
              <Button onClick={onChooseAnother}>Choose another</Button>
            ) : null}
            {supportAction}
          </div>
        </Panel>
      );

    case "CONFIRMED":
      return (
        <Panel tone="success" badge={<Badge tone="success">Booked</Badge>} title={`${who} is booked`}>
          <p className="max-w-prose text-sm leading-6 text-text">
            <strong className="font-semibold">This is booked.</strong> We checked
            they are approved for this work and free on your dates before letting
            you choose them, so there is nothing left for them to confirm.
          </p>
          {selection.engagementId !== null ? (
            <div className="mt-3">
              <Link
                href={engagementHref(selection.engagementId)}
                className={buttonStyles({ variant: "primary" })}
              >
                See what happens next
              </Link>
            </div>
          ) : (
            // Confirmed with no engagement id is a real intermediate state on
            // A5: the vendor has agreed and the first stage is not funded, so
            // the engagement record is not open yet. Saying so beats a dead link.
            <p className="mt-2 text-sm text-text-secondary">
              We are opening the agreement now. Refresh in a moment.
            </p>
          )}
        </Panel>
      );

    case "WITHDRAWN":
      return (
        <Panel tone="neutral" badge={<Badge tone="neutral">Withdrawn</Badge>} title="You took this choice back">
          <p className="max-w-prose text-sm leading-6 text-text-secondary">
            The other quotes are still here and choosing one costs nothing more.
          </p>
          {onChooseAnother !== undefined ? (
            <div className="mt-3">
              <Button onClick={onChooseAnother}>Choose another</Button>
            </div>
          ) : null}
        </Panel>
      );

    default:
      // A status this build does not know. Says so rather than picking the
      // optimistic reading, because the optimistic reading here is "booked".
      return (
        <Panel tone="neutral" badge={<Badge tone="neutral">Unknown</Badge>} title="We cannot describe this yet">
          <p className="max-w-prose text-sm leading-6 text-text-secondary">
            Something about your choice has changed and this version of the app
            cannot explain it. Nothing has been charged.
          </p>
          {supportAction !== undefined ? <div className="mt-3">{supportAction}</div> : null}
        </Panel>
      );
  }
}

const PANEL_TONES: Record<"warning" | "success" | "neutral", string> = {
  warning: "border-warning-line bg-warning-surface",
  success: "border-success-line bg-success-surface",
  neutral: "border-line bg-surface-sunken",
};

function Panel({
  tone,
  badge,
  title,
  children,
}: {
  tone: "warning" | "success" | "neutral";
  badge: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-card border p-4 ${PANEL_TONES[tone]}`} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-text">{title}</h2>
        <div className="shrink-0">{badge}</div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}
