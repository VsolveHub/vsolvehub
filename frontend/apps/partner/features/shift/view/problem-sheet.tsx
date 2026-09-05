"use client";

import { Button, ConfirmAction, ErrorState, Sheet, Textarea, cn } from "@vsolve/ui";
import {
  SHIFT_SAFETY_SEVERITIES,
  describeError,
  isPolicyUnavailable,
  type ShiftSafetyCategory,
  type ShiftSafetySeverity,
} from "@vsolve/query";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

import { Pictogram, type PictogramName } from "@/components/pictogram";
import { usePartnerEngagement } from "@/features/engagement/queries";
import { BookingSupport } from "@/features/support/view/booking-support";

import {
  useReportCrewNoShow,
  useReportSafetyIncident,
  type PartnerCrewNoShowReason,
} from "../queries";
import {
  CALL_SUPPORT_TO_CANCEL,
  NO_SHOW_REASON_LABEL,
  SAFETY_KIND_TILES,
  SAFETY_LOGGED,
  SEVERITY_LABEL,
} from "../model/shift-copy";

/**
 * The one "Problem" button, on the job hub and on every day screen.
 *
 * Four tiles, each routed to the thing that actually records it:
 *
 * - **Fewer people today** is the attendance count. The day screen hands us
 *   `onFewerPeople` to jump to its who-came grid; the hub, which has no grid,
 *   gets a line saying where to go.
 * - **Can't come at all** has no partner-side endpoint. `useReportCrewNoShow`
 *   sends only the `CUSTOMER` party — a vendor cancelling their own job is a
 *   money command against themselves, and it stays with support until
 *   `request_cancellation` has a screen. So the tile says so, and shows support.
 * - **Injury / safety** is `useReportSafetyIncident`: a record, never a
 *   cancellation, and the footer says the job continues.
 * - **Customer issue**: gate locked and nobody home on day one, before arrival,
 *   are the day-one no-show (`POST /requirements/{id}/crew/no-show/`) — it moves
 *   the booking fee, so it sits behind a ConfirmAction. Everything else goes to
 *   support.
 */

export interface ProblemSheetProps {
  readonly engagementId: string;
  /** The requirement the booking fee lives on. Empty disables the no-show route. */
  readonly requirementId: string;
  /** The day this was opened from, when it was opened from one. */
  readonly stageId?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The day screen's jump to its who-came grid. Absent on the hub. */
  readonly onFewerPeople?: () => void;
}

type View = "menu" | "fewer" | "cancel" | "safety" | "customer";

const TILE =
  "flex min-h-24 flex-col items-start justify-between gap-2 rounded-card border border-line bg-surface p-3 text-left transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

const CHIP =
  "min-h-11 rounded-control border px-3 py-2 text-sm text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";
const CHIP_ON = "border-selected bg-selected-surface font-semibold text-text";
const CHIP_OFF = "border-line-strong bg-surface font-medium text-text-secondary hover:bg-surface-hover";

export function ProblemSheet({
  engagementId,
  requirementId,
  stageId,
  open,
  onOpenChange,
  onFewerPeople,
}: ProblemSheetProps) {
  const [view, setView] = useState<View>("menu");
  const engagement = usePartnerEngagement(engagementId, open);

  // Day one, before anybody arrived, is the only moment the no-show route exists.
  const shiftStages = (engagement.data?.stages ?? []).filter((stage) => stage.shift_summary !== null);
  const firstDay = shiftStages[0] ?? null;
  const thisDay = stageId === undefined ? firstDay : (shiftStages.find((stage) => stage.id === stageId) ?? null);
  const isDayOne = thisDay !== null && firstDay !== null && thisDay.id === firstDay.id;
  const dayOneNotStarted = isDayOne && thisDay.shift_summary?.arrived_at == null;

  const close = () => {
    onOpenChange(false);
    setView("menu");
  };

  const titles: Record<View, string> = {
    menu: "Problem",
    fewer: "Fewer people today",
    cancel: "Can't come at all",
    safety: "Injury / safety",
    customer: "Customer issue",
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())} title={titles[view]}>
      <div className="flex flex-col gap-3 pb-4">
        {view === "menu" ? (
          <div className="grid grid-cols-2 gap-3">
            <ProblemTile icon="crew" label="Fewer people today" onClick={() => (onFewerPeople ? (close(), onFewerPeople()) : setView("fewer"))} />
            {isDayOne || thisDay === null ? (
              <ProblemTile icon="stopped" label="Can't come at all" onClick={() => setView("cancel")} />
            ) : null}
            <ProblemTile icon="held" label="Injury / safety" onClick={() => setView("safety")} />
            <ProblemTile icon="call" label="Customer issue" onClick={() => setView("customer")} />
          </div>
        ) : (
          <BackRow onBack={() => setView("menu")} />
        )}

        {view === "fewer" ? (
          <p className="text-sm text-text-secondary">Open today&rsquo;s day and tick who came.</p>
        ) : null}

        {view === "cancel" ? (
          <>
            <p className="text-sm text-text-secondary">{CALL_SUPPORT_TO_CANCEL}</p>
            <BookingSupport reference={engagementId} />
          </>
        ) : null}

        {view === "safety" ? (
          <SafetyReport engagementId={engagementId} stageId={stageId ?? null} onDone={close} />
        ) : null}

        {view === "customer" ? (
          <CustomerIssue
            engagementId={engagementId}
            requirementId={requirementId}
            noShowAllowed={dayOneNotStarted && requirementId !== ""}
            onDone={close}
          />
        ) : null}
      </div>
    </Sheet>
  );
}

function ProblemTile({
  icon,
  label,
  onClick,
}: {
  readonly icon: PictogramName;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button type="button" className={TILE} onClick={onClick}>
      <Pictogram name={icon} size="lg" className="text-action" />
      <span className="text-sm font-semibold text-text">{label}</span>
    </button>
  );
}

function BackRow({ onBack }: { readonly onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <ArrowLeft size={16} aria-hidden />
      All problems
    </button>
  );
}

function TileRow<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  readonly label: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(CHIP, value === option.value ? CHIP_ON : CHIP_OFF)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Severity tiles, kind tiles, an optional note. The job continues. */
function SafetyReport({
  engagementId,
  stageId,
  onDone,
}: {
  readonly engagementId: string;
  readonly stageId: string | null;
  readonly onDone: () => void;
}) {
  const report = useReportSafetyIncident(engagementId);
  const [severity, setSeverity] = useState<ShiftSafetySeverity | null>(null);
  const [kind, setKind] = useState<ShiftSafetyCategory>("injury");
  const [note, setNote] = useState("");

  if (report.isSuccess) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text">{SAFETY_LOGGED}</p>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  const severityOptions = SHIFT_SAFETY_SEVERITIES.map((value) => ({ value, label: SEVERITY_LABEL[value] }));
  const kindLabel = SAFETY_KIND_TILES.find((tile) => tile.value === kind)?.label ?? kind;

  return (
    <div className="flex flex-col gap-4">
      <TileRow label="How bad?" options={severityOptions} value={severity} onChange={setSeverity} disabled={report.isPending} />
      <TileRow label="What?" options={SAFETY_KIND_TILES} value={kind} onChange={setKind} disabled={report.isPending} />
      <Textarea
        aria-label="Note (optional)"
        placeholder="Note (optional)"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={8000}
        rows={2}
        disabled={report.isPending}
      />
      <Button
        type="button"
        onClick={() =>
          severity === null
            ? undefined
            : report.mutate({
                severity,
                categoryCode: kind,
                // The record needs a body; with no note it says what was tapped.
                description: note.trim() === "" ? `${SEVERITY_LABEL[severity]} — ${kindLabel}` : note,
                occurredAt: null,
                stageId,
              })
        }
        loading={report.isPending}
        loadingLabel="Logging"
        disabled={severity === null || report.isPending}
      >
        Log it
      </Button>
      <p className="text-xs text-text-muted">{SAFETY_LOGGED}</p>
      {report.isError ? <Failure error={report.error} /> : null}
    </div>
  );
}

type CustomerIssueKind = PartnerCrewNoShowReason | "pay_less" | "site_not_ready" | "other";

const CUSTOMER_ISSUE_TILES: readonly { readonly value: CustomerIssueKind; readonly label: string }[] = [
  { value: "gate_locked", label: NO_SHOW_REASON_LABEL.gate_locked },
  { value: "customer_no_show", label: NO_SHOW_REASON_LABEL.customer_no_show },
  { value: "pay_less", label: "Asked to pay less" },
  { value: "site_not_ready", label: "Site not ready" },
  { value: "other", label: "Other" },
];

function isNoShowReason(kind: CustomerIssueKind): kind is PartnerCrewNoShowReason {
  return kind === "gate_locked" || kind === "customer_no_show";
}

function CustomerIssue({
  engagementId,
  requirementId,
  noShowAllowed,
  onDone,
}: {
  readonly engagementId: string;
  readonly requirementId: string;
  readonly noShowAllowed: boolean;
  readonly onDone: () => void;
}) {
  const noShow = useReportCrewNoShow({ requirementId, engagementId });
  const [kind, setKind] = useState<CustomerIssueKind | null>(null);
  const [confirming, setConfirming] = useState(false);

  const viaNoShow = kind !== null && isNoShowReason(kind) && noShowAllowed;

  if (noShow.isSuccess) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text">Reported. Vsolve settles the booking fee; nothing more to do today.</p>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TileRow label="What happened?" options={CUSTOMER_ISSUE_TILES} value={kind} onChange={setKind} disabled={noShow.isPending} />

      {kind === null ? null : viaNoShow ? (
        <>
          <Button type="button" variant="danger" onClick={() => setConfirming(true)} disabled={noShow.isPending}>
            Report it
          </Button>
          <ConfirmAction
            open={confirming}
            onOpenChange={setConfirming}
            title="Report the customer was not there?"
            destructive
            pending={noShow.isPending}
            confirmLabel="Report it"
            consequence="Vsolve keeps the booking fee and pays you a travel share; this cannot be undone."
            onConfirm={() =>
              kind !== null && isNoShowReason(kind)
                ? noShow.mutate({ reasonCode: kind }, { onSuccess: () => setConfirming(false) })
                : undefined
            }
          />
        </>
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            {kind === "gate_locked" || kind === "customer_no_show"
              ? "After day one starts this goes to support."
              : "Keep the rate as agreed — support sorts this out with the customer."}
          </p>
          <BookingSupport reference={engagementId} />
        </>
      )}

      {noShow.isError ? <NoShowFailure error={noShow.error} /> : null}
    </div>
  );
}

function Failure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");
  return (
    <ErrorState
      title={presentation.title}
      message={presentation.message}
      severity={presentation.severity}
      reference={presentation.reference}
    />
  );
}

/** `m2_policy_unavailable` is Vsolve's gap, not the vendor's: the fee stays untouched. */
function NoShowFailure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");
  if (isPolicyUnavailable(error)) {
    return (
      <ErrorState
        title="Vsolve cannot settle this yet"
        message="The fee is untouched; support will settle it by hand."
        severity="warning"
        reference={presentation.reference}
      />
    );
  }
  return <Failure error={error} />;
}
