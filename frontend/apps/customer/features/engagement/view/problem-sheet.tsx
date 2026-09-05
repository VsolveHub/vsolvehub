"use client";

import { ConfirmAction, Sheet, formatMoney } from "@vsolve/ui";
import { useState } from "react";

import { useCancelBooking, useConfirmCrewArrival, useRateCardState, useReportCrewNoShow } from "@/features/crew/queries";
import { CashDemandReport } from "@/features/shift-day/view/cash-demand-report";

/**
 * The hub's Problem button — screen 8. Tiles: nobody came (day-1 no-show),
 * crew asked for more money, a safety issue (routed to support — no customer
 * safety-incident mutation exists yet), cancel the booking, call support.
 */

export interface ProblemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  requirementId: string;
  firstDayStageId: string | null;
  /** Whether day one's arrival/no-show is still open to record. */
  canRecordFirstDay: boolean;
  onDone: () => void;
}

type Tile = "nobody_came" | "cash" | "safety" | "cancel" | null;

const SUPPORT_PHONE = "+917330764634";

export function ProblemSheet({
  open,
  onOpenChange,
  engagementId,
  requirementId,
  firstDayStageId,
  canRecordFirstDay,
  onDone,
}: ProblemSheetProps) {
  const [tile, setTile] = useState<Tile>(null);
  const noShow = useReportCrewNoShow();
  const arrival = useConfirmCrewArrival();
  const cancel = useCancelBooking();
  const rateQuery = useRateCardState(requirementId, canRecordFirstDay);
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  // The server's own fee amount, never a figure this sheet invents.
  const feeAmountLabel =
    rateQuery.data?.booking_fee != null ? formatMoney(rateQuery.data.booking_fee.amount_paise) : "Your booking fee";

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setTile(null);
  }

  return (
    <Sheet open={open} onOpenChange={close} title="What's the problem?">
      {tile === null ? (
        <div className="flex flex-col gap-2 pb-2">
          {canRecordFirstDay ? (
            <TileButton label="Nobody came" onClick={() => setTile("nobody_came")} />
          ) : null}
          <TileButton label="Crew asked for more money" onClick={() => setTile("cash")} />
          <TileButton label="Safety issue" onClick={() => setTile("safety")} />
          <TileButton label="Cancel booking" onClick={() => setTile("cancel")} />
          <a
            href={`tel:${SUPPORT_PHONE}`}
            className="flex min-h-14 items-center rounded-card border border-line bg-surface px-4 py-3 text-sm font-semibold text-text hover:bg-surface-hover"
          >
            Call support
          </a>
        </div>
      ) : tile === "nobody_came" ? (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-sm leading-6 text-text-secondary">
            {feeAmountLabel} refunded and we find another crew at the same rate.
          </p>
          <button
            type="button"
            onClick={() => setConfirmingNoShow(true)}
            disabled={noShow.isPending || arrival.isPending}
            className="min-h-11 rounded-control border border-danger-line bg-danger-surface px-4 text-sm font-semibold text-danger-text disabled:opacity-60"
          >
            Nobody came
          </button>
          <ConfirmAction
            open={confirmingNoShow}
            onOpenChange={setConfirmingNoShow}
            title="Nobody came?"
            consequence={`${feeAmountLabel} refunded and we find another crew at the same rate.`}
            confirmLabel="Nobody came"
            cancelLabel="Go back"
            onConfirm={() => {
              noShow.mutate({ requirementId }, { onSuccess: onDone });
              setConfirmingNoShow(false);
              close(false);
            }}
            pending={noShow.isPending}
            destructive
          />
        </div>
      ) : tile === "cash" ? (
        <CashDemandReport
          engagementId={engagementId}
          stageId={firstDayStageId}
          amendmentHref={`#amendments`}
          className="pb-2"
        />
      ) : tile === "safety" ? (
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-sm leading-6 text-text-secondary">
            Call us now and we will deal with it directly — this is not something to
            report in the app.
          </p>
          <a
            href={`tel:${SUPPORT_PHONE}`}
            className="flex min-h-11 items-center justify-center rounded-control bg-action px-4 text-sm font-semibold text-action-text"
          >
            Call support
          </a>
          <p className="text-xs text-text-muted">For immediate danger, contact local emergency services first.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-2">
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            disabled={cancel.isPending}
            className="min-h-11 rounded-control border border-danger-line bg-danger-surface px-4 text-sm font-semibold text-danger-text disabled:opacity-60"
          >
            Cancel this booking
          </button>
          <ConfirmAction
            open={confirmingCancel}
            onOpenChange={setConfirmingCancel}
            title="Cancel this booking?"
            consequence="Your booking fee is refunded in full outside the free-cancellation window, and forfeits in part inside it — we will tell you which applies once you confirm."
            confirmLabel="Cancel booking"
            cancelLabel="Go back"
            pending={cancel.isPending}
            destructive
            onConfirm={() => {
              cancel.mutate({ requirementId }, { onSuccess: onDone });
              setConfirmingCancel(false);
              close(false);
            }}
          />
        </div>
      )}
    </Sheet>
  );
}

function TileButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center justify-between rounded-card border border-line bg-surface px-4 py-3 text-left text-sm font-semibold text-text transition-colors duration-fast hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      {label}
      <svg viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-text-muted">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
