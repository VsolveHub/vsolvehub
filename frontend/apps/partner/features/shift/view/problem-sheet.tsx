"use client";

import { Button, ConfirmAction, ErrorState, Sheet, Textarea, cn, useT } from "@vsolve/ui";
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
  const t = useT();
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
    menu: t("work.problemSheet.title.menu"),
    fewer: t("work.problemSheet.title.fewer"),
    cancel: t("work.problemSheet.title.cancel"),
    safety: t("work.problemSheet.title.safety"),
    customer: t("work.problemSheet.title.customer"),
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())} title={titles[view]}>
      <div className="flex flex-col gap-3 pb-4">
        {view === "menu" ? (
          <div className="grid grid-cols-2 gap-3">
            <ProblemTile icon="crew" label={titles.fewer} onClick={() => (onFewerPeople ? (close(), onFewerPeople()) : setView("fewer"))} />
            {isDayOne || thisDay === null ? (
              <ProblemTile icon="stopped" label={titles.cancel} onClick={() => setView("cancel")} />
            ) : null}
            <ProblemTile icon="held" label={titles.safety} onClick={() => setView("safety")} />
            <ProblemTile icon="call" label={titles.customer} onClick={() => setView("customer")} />
          </div>
        ) : (
          <BackRow onBack={() => setView("menu")} />
        )}

        {view === "fewer" ? (
          <p className="text-sm text-text-secondary">{t("work.problemSheet.fewerHint")}</p>
        ) : null}

        {view === "cancel" ? (
          <>
            <p className="text-sm text-text-secondary">{t(CALL_SUPPORT_TO_CANCEL)}</p>
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
  const t = useT();
  return (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-semibold text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      <ArrowLeft size={16} aria-hidden />
      {t("work.problemSheet.allProblems")}
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
  const t = useT();
  const report = useReportSafetyIncident(engagementId);
  const [severity, setSeverity] = useState<ShiftSafetySeverity | null>(null);
  const [kind, setKind] = useState<ShiftSafetyCategory>("injury");
  const [note, setNote] = useState("");

  if (report.isSuccess) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text">{t(SAFETY_LOGGED)}</p>
        <Button type="button" onClick={onDone}>
          {t("common.done")}
        </Button>
      </div>
    );
  }

  const severityOptions = SHIFT_SAFETY_SEVERITIES.map((value) => ({ value, label: t(SEVERITY_LABEL[value]) }));
  const kindOptions = SAFETY_KIND_TILES.map((tile) => ({ value: tile.value, label: t(tile.labelKey) }));
  const kindLabel = kindOptions.find((tile) => tile.value === kind)?.label ?? kind;

  return (
    <div className="flex flex-col gap-4">
      <TileRow label={t("work.problemSheet.safety.howBad")} options={severityOptions} value={severity} onChange={setSeverity} disabled={report.isPending} />
      <TileRow label={t("work.problemSheet.safety.what")} options={kindOptions} value={kind} onChange={setKind} disabled={report.isPending} />
      <Textarea
        aria-label={t("work.problemSheet.safety.note")}
        placeholder={t("work.problemSheet.safety.note")}
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
                description: note.trim() === "" ? `${t(SEVERITY_LABEL[severity])} — ${kindLabel}` : note,
                occurredAt: null,
                stageId,
              })
        }
        loading={report.isPending}
        loadingLabel={t("work.problemSheet.safety.logging")}
        disabled={severity === null || report.isPending}
      >
        {t("work.problemSheet.safety.logIt")}
      </Button>
      <p className="text-xs text-text-muted">{t(SAFETY_LOGGED)}</p>
      {report.isError ? <Failure error={report.error} /> : null}
    </div>
  );
}

type CustomerIssueKind = PartnerCrewNoShowReason | "pay_less" | "site_not_ready" | "other";

/** `labelKey` is a catalogue key; resolve with `t` at render time. */
const CUSTOMER_ISSUE_TILES: readonly { readonly value: CustomerIssueKind; readonly labelKey: string }[] = [
  { value: "gate_locked", labelKey: NO_SHOW_REASON_LABEL.gate_locked },
  { value: "customer_no_show", labelKey: NO_SHOW_REASON_LABEL.customer_no_show },
  { value: "pay_less", labelKey: "work.problemSheet.customer.payLess" },
  { value: "site_not_ready", labelKey: "work.problemSheet.customer.siteNotReady" },
  { value: "other", labelKey: "work.problemSheet.customer.other" },
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
  const t = useT();
  const noShow = useReportCrewNoShow({ requirementId, engagementId });
  const [kind, setKind] = useState<CustomerIssueKind | null>(null);
  const [confirming, setConfirming] = useState(false);

  const viaNoShow = kind !== null && isNoShowReason(kind) && noShowAllowed;

  if (noShow.isSuccess) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text">{t("work.problemSheet.customer.reported")}</p>
        <Button type="button" onClick={onDone}>
          {t("common.done")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TileRow
        label={t("work.problemSheet.customer.whatHappened")}
        options={CUSTOMER_ISSUE_TILES.map((tile) => ({ value: tile.value, label: t(tile.labelKey) }))} value={kind} onChange={setKind} disabled={noShow.isPending} />

      {kind === null ? null : viaNoShow ? (
        <>
          <Button type="button" variant="danger" onClick={() => setConfirming(true)} disabled={noShow.isPending}>
            {t("work.problemSheet.customer.reportIt")}
          </Button>
          <ConfirmAction
            open={confirming}
            onOpenChange={setConfirming}
            title={t("work.problemSheet.customer.confirmTitle")}
            destructive
            pending={noShow.isPending}
            confirmLabel={t("work.problemSheet.customer.reportIt")}
            consequence={t("work.problemSheet.customer.confirmConsequence")}
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
              ? t("work.problemSheet.customer.afterDayOne")
              : t("work.problemSheet.customer.keepRate")}
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
  const t = useT();
  const presentation = describeError(error, "mutation");
  if (isPolicyUnavailable(error)) {
    return (
      <ErrorState
        title={t("work.problemSheet.policyUnavailable.title")}
        message={t("work.problemSheet.policyUnavailable.message")}
        severity="warning"
        reference={presentation.reference}
      />
    );
  }
  return <Failure error={error} />;
}
