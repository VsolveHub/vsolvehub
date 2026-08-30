"use client";

import { canSubmitAttendanceDispute } from "@vsolve/query";
import { ConfirmAction, Field, QuantityStepper, Sheet, Textarea, buttonStyles } from "@vsolve/ui";
import { useState } from "react";

import type { ShiftDayView } from "../adapters";
import { CashDemandReport } from "./cash-demand-report";
import { useRespondToAttendance } from "../queries";

/**
 * "Not right?" — replaces the inline dispute form and the standalone cash-demand
 * mount. Four tiles: fewer came, left early, asked for extra cash, something
 * else. The customer cannot correct the supervisor's count — only dispute it —
 * so "fewer came" collects the customer's own number as the note on a dispute.
 */

export interface NotRightSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  engagementId: string;
  day: ShiftDayView;
  amendmentHref: string;
  onDone: () => void;
}

type Tile = "fewer" | "left_early" | "cash" | "other" | null;

export function NotRightSheet({ open, onOpenChange, engagementId, day, amendmentHref, onDone }: NotRightSheetProps) {
  const [tile, setTile] = useState<Tile>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) setTile(null);
  }

  return (
    <Sheet open={open} onOpenChange={close} title="What went wrong?" dismissable>
      {tile === null ? (
        <div className="flex flex-col gap-2 pb-2">
          <TileButton label="Fewer came than counted" onClick={() => setTile("fewer")} />
          <TileButton label="Left early" onClick={() => setTile("left_early")} />
          <TileButton label="Asked for extra cash" onClick={() => setTile("cash")} />
          <TileButton label="Something else" onClick={() => setTile("other")} />
        </div>
      ) : tile === "cash" ? (
        <CashDemandReport
          engagementId={engagementId}
          stageId={day.stageId}
          amendmentHref={amendmentHref}
          className="pb-2"
        />
      ) : (
        <DisputeTile
          tile={tile}
          day={day}
          engagementId={engagementId}
          onBack={() => setTile(null)}
          onDone={() => {
            close(false);
            onDone();
          }}
        />
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

/**
 * The dispute path for "Fewer came", "Left early" and "Something else".
 *
 * The customer cannot set a corrected count — `respond_attendance` only ever
 * takes `CONFIRM` or `DISPUTE` — so "fewer came" is a dispute whose note states
 * the customer's own count.
 */
function DisputeTile({
  tile,
  day,
  engagementId,
  onBack,
  onDone,
}: {
  tile: "fewer" | "left_early" | "other";
  day: ShiftDayView;
  engagementId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const respond = useRespondToAttendance();
  const expected = day.expectedCount ?? 0;
  const [countSeen, setCountSeen] = useState(Math.max(0, day.presentCount ?? expected));
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const composedNote =
    tile === "fewer"
      ? `Customer counted ${countSeen} of ${expected} present. ${note.trim()}`.trim()
      : note.trim();
  const canSubmit =
    tile === "fewer" ? composedNote.length > 0 : canSubmitAttendanceDispute([], note);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm font-semibold text-text-link underline underline-offset-2"
      >
        Back
      </button>

      {tile === "fewer" ? (
        <Field label="How many came?" description={`You booked ${expected}.`}>
          <QuantityStepper
            label="People who came"
            value={countSeen}
            onChange={setCountSeen}
            min={0}
            max={expected}
            decrementLabel="Fewer people came"
            incrementLabel="More people came"
          />
        </Field>
      ) : null}

      <Field
        label={tile === "left_early" ? "What happened" : "Tell us what happened"}
        description="We and the supervisor read this first."
        required={tile !== "fewer"}
      >
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            tile === "left_early"
              ? "Left by 3pm, well before the day was done."
              : "Only two people came at nine; the third arrived after lunch."
          }
        />
      </Field>

      <button
        type="button"
        disabled={!canSubmit || respond.isPending}
        onClick={() => setConfirming(true)}
        className={buttonStyles({ variant: "danger", className: "disabled:opacity-60" })}
      >
        Dispute this day
      </button>

      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Dispute this day?"
        destructive
        consequence="This day will not be approved automatically and the amount stays unconfirmed while we look into it. Vsolve holds no wage money, so nothing is held back."
        confirmLabel="Yes, dispute it"
        pending={respond.isPending}
        onConfirm={() =>
          respond.mutate(
            {
              engagementId,
              stageId: day.stageId,
              response: "DISPUTE",
              shortfallChoice: "",
              workerDetails: [],
              note: composedNote,
            },
            { onSuccess: onDone },
          )
        }
      />
    </div>
  );
}
