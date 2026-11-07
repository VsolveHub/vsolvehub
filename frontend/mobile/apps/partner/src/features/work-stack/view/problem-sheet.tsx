// Ported from frontend/apps/partner/features/shift/view/problem-sheet.tsx
import {
  SHIFT_SAFETY_SEVERITIES,
  describeError,
  isPolicyUnavailable,
  type ShiftSafetyCategory,
  type ShiftSafetySeverity,
} from "@vsolve/query/native";
import { Button, ConfirmAction, ErrorState, Sheet, Text, Textarea, cn } from "@vsolve/mobile-ui";
import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { usePartnerEngagement } from "@/features/engagement/queries";
import {
  useReportCrewNoShow,
  useReportSafetyIncident,
  type PartnerCrewNoShowReason,
} from "@/features/shift/queries";
import {
  CALL_SUPPORT_TO_CANCEL,
  NO_SHOW_REASON_LABEL,
  SAFETY_KIND_TILES,
  SAFETY_LOGGED,
  SEVERITY_LABEL,
} from "@/features/shift/model/shift-copy";

import { BookingSupport } from "./booking-support";
import { Pictogram, type PictogramName } from "./pictogram";

export interface ProblemSheetProps {
  readonly engagementId: string;
  readonly requirementId: string;
  readonly stageId?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onFewerPeople?: () => void;
}

type ViewName = "menu" | "fewer" | "cancel" | "safety" | "customer";

export function ProblemSheet({
  engagementId,
  requirementId,
  stageId,
  open,
  onOpenChange,
  onFewerPeople,
}: ProblemSheetProps) {
  const [view, setView] = useState<ViewName>("menu");
  const engagement = usePartnerEngagement(engagementId, open);
  const shiftStages = (engagement.data?.stages ?? []).filter((stage) => stage.shift_summary !== null);
  const firstDay = shiftStages[0] ?? null;
  const thisDay = stageId === undefined ? firstDay : (shiftStages.find((stage) => stage.id === stageId) ?? null);
  const isDayOne = thisDay !== null && firstDay !== null && thisDay.id === firstDay.id;
  const dayOneNotStarted = isDayOne && thisDay.shift_summary?.arrived_at == null;

  const close = () => {
    onOpenChange(false);
    setView("menu");
  };

  const titles: Record<ViewName, string> = {
    menu: "Problem",
    fewer: "Fewer people today",
    cancel: "Can't come at all",
    safety: "Injury / safety",
    customer: "Customer issue",
  };

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())} title={titles[view]}>
      <View className="flex-col gap-3 pb-4">
        {view === "menu" ? (
          <View className="flex-row flex-wrap gap-3">
            <View className="w-[48%]">
              <ProblemTile icon="crew" label="Fewer people today" onPress={() => (onFewerPeople ? (close(), onFewerPeople()) : setView("fewer"))} />
            </View>
            {isDayOne || thisDay === null ? (
              <View className="w-[48%]">
                <ProblemTile icon="stopped" label="Can't come at all" onPress={() => setView("cancel")} />
              </View>
            ) : null}
            <View className="w-[48%]">
              <ProblemTile icon="held" label="Injury / safety" onPress={() => setView("safety")} />
            </View>
            <View className="w-[48%]">
              <ProblemTile icon="call" label="Customer issue" onPress={() => setView("customer")} />
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setView("menu")} className="min-h-11 flex-row items-center gap-2">
            <ArrowLeft size={16} color="#f87000" />
            <Text className="text-sm font-semibold text-action">All problems</Text>
          </Pressable>
        )}
        {view === "fewer" ? <Text className="text-sm text-text-secondary">Open today’s day and tick who came.</Text> : null}
        {view === "cancel" ? (
          <View className="gap-3">
            <Text className="text-sm text-text-secondary">{CALL_SUPPORT_TO_CANCEL}</Text>
            <BookingSupport reference={engagementId} />
          </View>
        ) : null}
        {view === "safety" ? <SafetyReport engagementId={engagementId} stageId={stageId ?? null} onDone={close} /> : null}
        {view === "customer" ? (
          <CustomerIssue
            engagementId={engagementId}
            requirementId={requirementId}
            noShowAllowed={dayOneNotStarted && requirementId !== ""}
            onDone={close}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

function ProblemTile({ icon, label, onPress }: { readonly icon: PictogramName; readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="min-h-24 flex-col items-start justify-between gap-2 rounded-card border border-line bg-surface p-3">
      <Pictogram name={icon} size="lg" className="text-action" />
      <Text className="text-sm font-semibold text-text">{label}</Text>
    </Pressable>
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
    <View className="flex-col gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: value === option.value, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            className={cn(
              "min-h-11 w-[48%] items-center justify-center rounded-control border px-3 py-2",
              value === option.value ? "border-selected bg-selected-surface" : "border-line-strong bg-surface",
            )}
          >
            <Text className={cn("text-center text-sm", value === option.value ? "font-semibold text-text" : "font-medium text-text-secondary")}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

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
      <View className="flex-col gap-3">
        <Text className="text-sm font-semibold text-text">{SAFETY_LOGGED}</Text>
        <Button onPress={onDone}>Done</Button>
      </View>
    );
  }

  const severityOptions = SHIFT_SAFETY_SEVERITIES.map((value) => ({ value, label: SEVERITY_LABEL[value] }));
  const kindLabel = SAFETY_KIND_TILES.find((tile) => tile.value === kind)?.label ?? kind;

  return (
    <View className="flex-col gap-4">
      <TileRow label="How bad?" options={severityOptions} value={severity} onChange={setSeverity} disabled={report.isPending} />
      <TileRow label="What?" options={SAFETY_KIND_TILES} value={kind} onChange={setKind} disabled={report.isPending} />
      <Textarea accessibilityLabel="Note (optional)" placeholder="Note (optional)" value={note} onChangeText={setNote} maxLength={8000} rows={2} editable={!report.isPending} />
      <Button
        onPress={() =>
          severity === null
            ? undefined
            : report.mutate({
                severity,
                categoryCode: kind,
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
      <Text className="text-xs text-text-muted">{SAFETY_LOGGED}</Text>
      {report.isError ? <Failure error={report.error} /> : null}
    </View>
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
      <View className="flex-col gap-3">
        <Text className="text-sm font-semibold text-text">Reported. Vsolve settles the booking fee; nothing more to do today.</Text>
        <Button onPress={onDone}>Done</Button>
      </View>
    );
  }

  return (
    <View className="flex-col gap-4">
      <TileRow label="What happened?" options={CUSTOMER_ISSUE_TILES} value={kind} onChange={setKind} disabled={noShow.isPending} />
      {kind === null ? null : viaNoShow ? (
        <View className="gap-3">
          <Button variant="danger" onPress={() => setConfirming(true)} disabled={noShow.isPending}>Report it</Button>
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
        </View>
      ) : (
        <View className="gap-3">
          <Text className="text-sm text-text-secondary">
            {kind === "gate_locked" || kind === "customer_no_show"
              ? "After day one starts this goes to support."
              : "Keep the rate as agreed — support sorts this out with the customer."}
          </Text>
          <BookingSupport reference={engagementId} />
        </View>
      )}
      {noShow.isError ? <NoShowFailure error={noShow.error} /> : null}
    </View>
  );
}

function Failure({ error }: { readonly error: unknown }) {
  const presentation = describeError(error, "mutation");
  return <ErrorState title={presentation.title} message={presentation.message} severity={presentation.severity} reference={presentation.reference} />;
}

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
