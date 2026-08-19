"use client";

import { Badge, Button, Disclosure } from "@vsolve/ui";
import type { ReactNode } from "react";

import { MobileScreen, ScreenHeading } from "@/features/booking/view/mobile-screen";
import { formatVisitSlot, type VisitTrackerView } from "@/features/access/adapters";
import { SlotRow } from "./parts/slot-row";

/**
 * A5 · 5 — Visits.
 *
 * The screen a customer lands on once a professional has offered a time. Its job
 * is to make one thing obvious: what they are being asked to pay for, and what
 * happens to the half of it whose slot is still empty.
 *
 * ## Both facts on one screen, deliberately
 *
 * The unfilled slot sits directly above the amount. That is the question people
 * actually have — *why am I paying for two visits when one time is confirmed* —
 * and answering it a screen away is how that question becomes a support message.
 *
 * ## The visit fee is not part of the project price
 *
 * Said here and on every screen that names it. It buys travel, the professional's
 * time on site and a written estimate the customer keeps whether or not they
 * hire — and the project itself is funded stage by stage, later, against an
 * estimate nobody has written yet.
 */

export interface VisitsScreenProps {
  serviceName: string;
  tracker: VisitTrackerView;
  onBack: () => void;
  /** Absent until the server says the checkout may be opened. */
  onPay?: () => void;
  /** The one-line recap of the brief, behind the disclosure. */
  briefSummary: string | null;
  /** When the request was sent, already formatted. */
  sentOn: string | null;
  notice?: ReactNode;
}

export function VisitsScreen({
  serviceName,
  tracker,
  onBack,
  onPay,
  briefSummary,
  sentOn,
  notice,
}: VisitsScreenProps) {
  // Filled rows first, then the waiting ones — a customer scanning this wants
  // the confirmed times together, and the empty slots are all the same state.
  const rows = [...tracker.rows].sort((left, right) => {
    const leftFilled = left.scheduledFor === null ? 1 : 0;
    const rightFilled = right.scheduledFor === null ? 1 : 0;
    if (leftFilled !== rightFilled) return leftFilled - rightFilled;
    return left.position - right.position;
  });

  const held = rows.find((row) => row.state === "held") ?? null;
  const heldTime = held === null ? null : formatVisitSlot(held.scheduledFor, held.timeZone);
  const filled = rows.filter((row) => row.scheduledFor !== null).length;

  return (
    <MobileScreen
      title={serviceName}
      onBack={onBack}
      badge={
        <Badge tone="info">
          {tracker.planSize === 1 ? "1 visit" : `${tracker.planSize} visits`}
        </Badge>
      }
      reassurance={
        onPay !== undefined && heldTime !== null
          ? `The ${heldTime} slot is held until you do.`
          : undefined
      }
      action={
        onPay === undefined ? undefined : (
          <Button
            block
            variant="secondary"
            onClick={onPay}
            className="h-[50px] rounded-[11px] text-[15px]"
          >
            Pay {tracker.priceLabel} and lock the visits
          </Button>
        )
      }
    >
      {notice}

      <div>
        <ScreenHeading
          title={
            filled === 0
              ? "We are inviting professionals"
              : filled === 1
                ? "One pro has a time for you"
                : `${filled} pros have times for you`
          }
        />
        <p className="mt-1.5 text-[13.5px] leading-5 text-text-secondary">
          {tracker.planSize === 1
            ? "Pay once and the visit is locked in."
            : "Pay once and all the visits are locked in."}
        </p>
      </div>

      <ul className="list-none overflow-hidden rounded-[14px] border border-line p-0">
        {rows.map((row, index) => (
          <SlotRow key={row.id} row={row} isFirst={index === 0} />
        ))}
      </ul>

      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="flex items-baseline justify-between gap-3 px-3.5 py-3">
          <p className="text-[13.5px] font-semibold text-text">
            {tracker.planSize === 1 ? "1-visit plan" : `${tracker.planSize}-visit plan`}
          </p>
          <p className="shrink-0 text-[15px] font-bold tabular-nums text-text">
            {tracker.priceLabel}
          </p>
        </div>
        {tracker.openSlots > 0 ? (
          <p className="border-t border-line bg-warm-50 px-3.5 py-2.5 text-[12.5px] leading-5 text-text-muted">
            A visit that never happens refunds its share on its own.
          </p>
        ) : null}
      </div>

      {briefSummary !== null ? (
        <Disclosure summary="Your request" hint={sentOn === null ? undefined : `Sent ${sentOn}`}>
          <p>{briefSummary}</p>
        </Disclosure>
      ) : null}
    </MobileScreen>
  );
}
