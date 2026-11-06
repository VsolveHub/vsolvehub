// Ported from frontend/apps/customer/features/engagement/view/today-card.tsx
import { canRecordCrewDay, describeError, isNotAShiftDay, type ShortfallChoice } from "@vsolve/query/native";
import { Button, Dialog, Skeleton, Text, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { useConfirmCrewArrival, useRateCardState, useReportCrewNoShow } from "@/features/crew/queries";
import { toShiftDayView, type ShiftDayView } from "@/features/shift-day/adapters";
import { useConfirmDaySettled, useRespondToAttendance, useShiftDay } from "@/features/shift-day/queries";
import type { AmendmentView, StageView } from "../adapters";
import { useAcceptAmendment, useDeclineAmendment } from "../queries";

export interface TodayCardProps {
  engagementId: string;
  requirementId: string;
  day: StageView;
  pendingAmendment: AmendmentView | null;
  onDone: () => void;
  onNotRight: (shift: ShiftDayView) => void;
}

const SHORTFALL_ROWS: readonly { choice: ShortfallChoice; label: string }[] = [
  { choice: "CONTINUE_SHORT", label: "Carry on short" },
  { choice: "ADD_DAY", label: "Ask for an extra day" },
  { choice: "CANCEL_SHORTFALL", label: "Cancel the missing" },
];

export function TodayCard({
  engagementId,
  requirementId,
  day,
  pendingAmendment,
  onDone,
  onNotRight,
}: TodayCardProps) {
  const dayQuery = useShiftDay(engagementId, day.stageId, true);

  if (dayQuery.isPending) {
    return (
      <View className="rounded-card border border-line bg-surface p-4">
        <Text className="sr-only">Loading today</Text>
        <Skeleton className="h-24 w-full" />
      </View>
    );
  }

  if (dayQuery.data === undefined) {
    if (isNotAShiftDay(dayQuery.error)) return null;
    const presentation = describeError(dayQuery.error, "read");
    return (
      <View className="rounded-card border border-danger-line bg-danger-surface p-4">
        <Text className="text-sm font-semibold text-text">{presentation.title}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void dayQuery.refetch()}
          className="mt-2"
        >
          <Text className="text-sm font-semibold text-text-link underline">Try again</Text>
        </Pressable>
      </View>
    );
  }

  const shift = toShiftDayView(dayQuery.data);
  const refresh = () => {
    void dayQuery.refetch();
    onDone();
  };

  return (
    <TodayCardBody
      engagementId={engagementId}
      requirementId={requirementId}
      day={day}
      shift={shift}
      pendingAmendment={pendingAmendment}
      onDone={refresh}
      onNotRight={onNotRight}
    />
  );
}

function TodayCardBody({
  engagementId,
  requirementId,
  day,
  shift,
  pendingAmendment,
  onDone,
  onNotRight,
}: {
  engagementId: string;
  requirementId: string;
  day: StageView;
  shift: ShiftDayView;
  pendingAmendment: AmendmentView | null;
  onDone: () => void;
  onNotRight: (shift: ShiftDayView) => void;
}) {
  const rateQuery = useRateCardState(requirementId, day.position === 1);
  const arrival = useConfirmCrewArrival();
  const noShow = useReportCrewNoShow();
  const respond = useRespondToAttendance();
  const settle = useConfirmDaySettled();
  const [confirmingNoShow, setConfirmingNoShow] = useState(false);
  const [shortfallChoice, setShortfallChoice] = useState<ShortfallChoice | null>(null);
  const [confirmingShortfall, setConfirmingShortfall] = useState(false);
  const [paidCash, setPaidCash] = useState(false);

  const supervisorName = shift.crew.find((member) => member.isSupervisor)?.displayName ?? "The supervisor";
  const helperCount = shift.hasCrew ? shift.crew.filter((member) => !member.isSupervisor).length : null;
  const crewLine =
    helperCount === null || helperCount <= 0
      ? supervisorName
      : `${supervisorName} + ${helperCount} coming`;

  const amendmentRow = pendingAmendment !== null && pendingAmendment.isDecidable ? (
    <AmendmentRow engagementId={engagementId} amendment={pendingAmendment} />
  ) : null;

  const canRecordArrival = day.position === 1 && (rateQuery.data === undefined ? false : canRecordCrewDay(rateQuery.data));
  const feeAmountLabel =
    rateQuery.data?.booking_fee != null ? formatMoney(rateQuery.data.booking_fee.amount_paise) : "the booking fee";

  if (shift.attendance === "not_started" || shift.attendance === "awaiting_arrival") {
    if (!canRecordArrival) {
      return (
        <Card>
          {amendmentRow}
          <Text className="text-base text-text">{crewLine}</Text>
          <Text className="mt-1 text-sm text-text-secondary">Not arrived yet.</Text>
        </Card>
      );
    }
    return (
      <Card>
        {amendmentRow}
        <Text className="text-base text-text">{crewLine}</Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          <Button
            onPress={() => arrival.mutate({ requirementId })}
            loading={arrival.isPending}
            loadingLabel="Recording"
          >
            They came
          </Button>
          <Button
            variant="outline"
            onPress={() => setConfirmingNoShow(true)}
            disabled={arrival.isPending || noShow.isPending}
          >
            Nobody came
          </Button>
        </View>
        <Dialog
          open={confirmingNoShow}
          onOpenChange={(open) => {
            if (!open && !noShow.isPending) setConfirmingNoShow(false);
          }}
          title="Nobody came?"
          description={`${feeAmountLabel} refunded and we find another crew at the same rate.`}
        >
          <View className="flex-row justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onPress={() => setConfirmingNoShow(false)}
              disabled={noShow.isPending}
            >
              Go back
            </Button>
            <Button
              variant="danger"
              loading={noShow.isPending}
              loadingLabel="Recording"
              onPress={() => {
                noShow.mutate({ requirementId }, { onSuccess: () => {
                  setConfirmingNoShow(false);
                  onDone();
                }});
              }}
            >
              Nobody came
            </Button>
          </View>
        </Dialog>
      </Card>
    );
  }

  if (shift.attendance === "awaiting_supervisor") {
    return (
      <Card>
        {amendmentRow}
        <Text className="text-base text-text">
          {shift.arrivalConfirmedAt === null
            ? "Arrived · Supervisor sends the count this evening."
            : `Arrived ${shift.arrivalConfirmedAt} · Supervisor sends the count this evening.`}
        </Text>
      </Card>
    );
  }

  if (shift.attendance === "awaiting_you") {
    const present = shift.presentCount ?? 0;
    const expected = shift.expectedCount ?? 0;
    const countLine = `${supervisorName.split(" ")[0]} says ${present} of ${expected} came`;
    const overtimeNote = pendingAmendment !== null && pendingAmendment.kind === "TIME_EXTENSION" ? " · 2 h extra" : "";

    if (shift.mustChooseShortfall) {
      return (
        <Card>
          {amendmentRow}
          <Text className="text-base text-text">
            {countLine}
            {overtimeNote}
          </Text>
          <View className="mt-3 gap-2">
            {SHORTFALL_ROWS.map((row) => (
              <Button
                key={row.choice}
                variant={shortfallChoice === row.choice ? "primary" : "outline"}
                disabled={respond.isPending}
                onPress={() => {
                  setShortfallChoice(row.choice);
                  setConfirmingShortfall(true);
                }}
              >
                {row.label}
              </Button>
            ))}
          </View>
          <Dialog
            open={confirmingShortfall}
            onOpenChange={(open) => {
              if (!open && !respond.isPending) {
                setConfirmingShortfall(false);
                setShortfallChoice(null);
              }
            }}
            title={shortfallChoice === null ? "" : `${SHORTFALL_ROWS.find((row) => row.choice === shortfallChoice)?.label}?`}
            description={`This confirms ${present} of ${expected} came.`}
          >
            <View className="flex-row justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onPress={() => {
                  setConfirmingShortfall(false);
                  setShortfallChoice(null);
                }}
                disabled={respond.isPending}
              >
                Cancel
              </Button>
              <Button
                loading={respond.isPending}
                loadingLabel="Confirming"
                onPress={() => {
                  if (shortfallChoice === null) return;
                  respond.mutate(
                    {
                      engagementId,
                      stageId: day.stageId,
                      response: "CONFIRM",
                      shortfallChoice,
                      workerDetails: [],
                      note: "",
                    },
                    {
                      onSuccess: () => {
                        setConfirmingShortfall(false);
                        setShortfallChoice(null);
                        onDone();
                      },
                    },
                  );
                }}
              >
                Confirm the day
              </Button>
            </View>
          </Dialog>
        </Card>
      );
    }

    return (
      <Card>
        {amendmentRow}
        <Text className="text-base text-text">
          {countLine}
          {overtimeNote}
        </Text>
        <Text className="mt-1 text-sm text-text-secondary">Today&apos;s amount {day.amountLabel}</Text>
        <View className="mt-3 flex-row flex-wrap items-center gap-3">
          <Button
            loading={respond.isPending}
            loadingLabel="Confirming"
            onPress={() =>
              respond.mutate(
                {
                  engagementId,
                  stageId: day.stageId,
                  response: "CONFIRM",
                  shortfallChoice: "",
                  workerDetails: [],
                  note: "",
                },
                { onSuccess: onDone },
              )
            }
          >
            Yes, that&apos;s right
          </Button>
          <Pressable
            accessibilityRole="button"
            onPress={() => onNotRight(shift)}
          >
            <Text className="text-sm font-semibold text-text-link underline">
              Not right?
            </Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  if (shift.attendance === "you_confirmed") {
    const settlement = shift.settlement;
    if (settlement === null) {
      return (
        <Card>
          {amendmentRow}
          <Text className="text-base text-text">Confirmed. Today&apos;s amount is being worked out.</Text>
        </Card>
      );
    }

    if (settlement.phase === "both_agreed") {
      return (
        <Card>
          <Text className="text-base font-semibold text-text">
            ✓ {day.label} · {settlement.amountLabel} paid
          </Text>
        </Card>
      );
    }

    if (settlement.phase === "you_said_settled") {
      return (
        <Card>
          <Text className="text-base text-text">You said paid · waiting for {supervisorName.split(" ")[0]}</Text>
        </Card>
      );
    }

    return (
      <Card>
        {amendmentRow}
        <Text className="text-base font-semibold text-text">{settlement.amountLabel} to pay</Text>
        <View className="mt-3 flex-row flex-wrap gap-2">
          {settlement.paymentLink !== null ? (
            <Button
              onPress={() => {
                if (settlement.paymentLink) {
                  void Linking.openURL(settlement.paymentLink);
                }
              }}
            >
              {`Pay on UPI ${settlement.amountLabel}`}
            </Button>
          ) : null}
          <Button
            variant={settlement.paymentLink === null ? "primary" : "outline"}
            onPress={() => setPaidCash(true)}
          >
            Paid cash
          </Button>
        </View>
        {paidCash || settlement.paymentLink !== null ? (
          <View className="mt-3">
            <Button
              loading={settle.isPending}
              loadingLabel="Recording"
              onPress={() =>
                settle.mutate({ engagementId, stageId: day.stageId }, { onSuccess: onDone })
              }
            >
              Yes, paid
            </Button>
          </View>
        ) : null}
      </Card>
    );
  }

  if (shift.attendance === "you_disputed") {
    return (
      <Card>
        <Text className="text-base font-semibold text-text">Count disputed · support will call</Text>
      </Card>
    );
  }

  return (
    <Card>
      <Text className="text-sm leading-6 text-text-secondary">
        This app cannot describe where today has got to — contact support before you act on it.
      </Text>
    </Card>
  );
}

function AmendmentRow({ engagementId, amendment }: { engagementId: string; amendment: AmendmentView }) {
  const accept = useAcceptAmendment();
  const decline = useDeclineAmendment();
  const busy = accept.isPending || decline.isPending;

  return (
    <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2 rounded-control border border-warning-line bg-warning-surface px-3 py-2">
      <Text className="flex-1 text-sm font-medium text-text">
        Asks {amendment.kind === "TIME_EXTENSION" ? "extra time" : "a change"} · {amendment.deltaLabel}
      </Text>
      <View className="flex-row gap-2">
        <Button
          size="sm"
          loading={accept.isPending}
          loadingLabel="Approving"
          disabled={busy}
          onPress={() => accept.mutate({ engagementId, amendmentId: amendment.amendmentId })}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={decline.isPending}
          loadingLabel="Declining"
          disabled={busy}
          onPress={() => decline.mutate({ engagementId, amendmentId: amendment.amendmentId })}
        >
          Decline
        </Button>
      </View>
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="rounded-card border border-line bg-surface p-4">{children}</View>;
}
