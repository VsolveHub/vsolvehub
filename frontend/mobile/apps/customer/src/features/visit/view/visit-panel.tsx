// Ported from frontend/apps/customer/features/visit/view/visit-panel.tsx
import { useCompleteOrOpenCheckout } from "@vsolve/mobile-core";
import { Badge, Button, Card, ErrorState, Spinner, Text, Textarea, buttonStyles, formatMoney } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { useBookingGroup, type FulfilmentUnit } from "@/features/bookings/queries";
import {
  formatBookingDate,
  formatBookingTime,
  serviceLinesOf,
} from "@/features/bookings/view/booking-format";
import { UnitStatusBadge } from "@/features/bookings/view/group-status";
import { MockProfessionalCard } from "@/features/bookings/view/mock-professional-card";
import { PaidVisitPaymentCard } from "@/features/bookings/view/paid-visit-cards";
import { ProfessionalCard } from "@/features/bookings/view/professional-card";
import { VisitProgress } from "@/features/bookings/view/visit-progress";
import { VisitStartCode } from "@/features/bookings/view/visit-start-code";
import { Money } from "@/features/payment/view/money";
import { CompletionRating } from "@/features/ratings/view/completion-rating";
import {
  isVisitWorkComplete,
  VisitFeedbackForm,
} from "@/features/ratings/view/visit-feedback-form";
import { BookingSupport } from "@/features/support/view/booking-support";

import {
  canRequestStartOtp,
  canRespondToCompletion,
  useApproveAmendment,
  useConfirmCompletion,
  useDeclineAmendment,
  useDisputeCompletion,
  useRequestStartOtp,
  useVisit,
  type ScopeAmendment,
  type Visit,
} from "../queries";
import { VisitActions } from "./visit-actions";
import { VISIT_STATUS_DESCRIPTIONS, VisitStatusBadge } from "./visit-status";

function VisitTasksPaymentCard({ visit }: { visit: Visit }) {
  if (visit.work_tasks.length === 0) return null;

  const currency = visit.work_tasks[0]?.currency ?? "INR";
  const totalPaise = visit.work_tasks.reduce((sum, task) => sum + task.amount_paise, 0);

  return (
    <Card className="p-5 shadow-xs">
      <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Payment summary
      </Text>
      <View className="mt-4 gap-2">
        {visit.work_tasks.map((task) => (
          <View key={task.id} className="flex-row justify-between gap-3">
            <View className="flex-row items-center flex-1 pr-2">
              <Text className="text-sm text-text-secondary">
                {task.label}
                {task.quantity > 1 ? ` × ${task.quantity}` : ""}
              </Text>
              {task.kind === "AMENDMENT" ? (
                <Badge tone="action" className="ml-2">
                  Added
                </Badge>
              ) : null}
            </View>
            <Text className="text-sm tabular-nums text-text font-medium">
              {formatMoney(task.amount_paise)}
            </Text>
          </View>
        ))}
      </View>
      <View className="mt-4 flex-row justify-between border-t border-line pt-3">
        <Text className="text-sm font-semibold text-text">Visit total</Text>
        <Money
          value={{ amount_paise: totalPaise, currency }}
          className="text-sm font-semibold tabular-nums text-text"
        />
      </View>
    </Card>
  );
}

function StartCodePrompt({ visit }: { visit: Visit }) {
  const requestOtp = useRequestStartOtp();
  const [requested, setRequested] = useState(false);

  return (
    <View className="mt-6 rounded-control bg-surface-sunken p-4 gap-2">
      <Text className="text-sm font-semibold text-text">Your start code</Text>
      <Text className="text-sm leading-6 text-text-secondary">
        We will text you a {requestOtp.data?.code_length ?? 4}-digit code. Read it out to your
        professional so they can start — it is how we confirm the right person is at your door.
      </Text>
      {requestOtp.isError ? (
        <ErrorState
          inline
          className="mt-2"
          title="We could not send the code"
          message="Nothing has changed. Try again in a moment."
        />
      ) : null}
      <View className="mt-2 self-start">
        <Button
          variant={requested ? "outline" : "primary"}
          loading={requestOtp.isPending}
          loadingLabel="Sending"
          onPress={() =>
            requestOtp.mutate(
              { bookingId: visit.id, expectedVersion: visit.version },
              { onSuccess: () => setRequested(true) },
            )
          }
        >
          {requested ? "Send again" : "Send my start code"}
        </Button>
      </View>
    </View>
  );
}

function CompletionDecision({ visit }: { visit: Visit }) {
  const confirm = useConfirmCompletion();
  const dispute = useDisputeCompletion();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const busy = confirm.isPending || dispute.isPending;

  return (
    <View className="mt-6 rounded-control border border-line p-4 gap-3">
      <Text className="text-sm font-semibold text-text">
        Your professional says the work is done
      </Text>
      {visit.completion?.notes ? (
        <Text className="text-sm leading-6 text-text-secondary">{visit.completion.notes}</Text>
      ) : null}

      {confirm.isError || dispute.isError ? (
        <ErrorState
          inline
          className="mt-2"
          title="We could not record that"
          message="Nothing has changed. We have re-checked the visit — try again."
        />
      ) : null}

      {reporting ? (
        <View className="gap-3">
          <Text className="text-sm font-semibold text-text">What is wrong?</Text>
          <Textarea
            value={reason}
            onChangeText={setReason}
            maxLength={240}
            placeholder="Tell us what is wrong..."
            rows={3}
          />
          <View className="flex-row flex-wrap gap-3">
            <Button
              disabled={reason.trim().length === 0 || busy}
              loading={dispute.isPending}
              loadingLabel="Sending"
              onPress={() =>
                dispute.mutate({
                  bookingId: visit.id,
                  expectedVersion: visit.version,
                  disputeReason: reason.trim(),
                })
              }
            >
              Send report
            </Button>
            <Button variant="ghost" disabled={busy} onPress={() => setReporting(false)}>
              Back
            </Button>
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap gap-3 mt-1">
          <Button
            loading={confirm.isPending}
            loadingLabel="Confirming"
            disabled={busy}
            onPress={() =>
              confirm.mutate({ bookingId: visit.id, expectedVersion: visit.version })
            }
          >
            Confirm it is done
          </Button>
          <Button variant="outline" disabled={busy} onPress={() => setReporting(true)}>
            Report a problem
          </Button>
        </View>
      )}
    </View>
  );
}

function ScopeAmendmentSection({
  amendment,
  bookingId,
}: {
  amendment: ScopeAmendment;
  bookingId: string;
}) {
  const approve = useApproveAmendment();
  const decline = useDeclineAmendment();
  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  const [paying, setPaying] = useState(false);
  const busy = approve.isPending || decline.isPending || paying;

  if (amendment.status !== "PROPOSED" && amendment.status !== "PAYMENT_PENDING") {
    return null;
  }

  async function handleApprove() {
    try {
      const result = await approve.mutateAsync({
        amendmentId: amendment.id,
        bookingId,
      });
      if (result.payment_attempt_id) {
        setPaying(true);
        await completeOrOpenCheckout(String(result.payment_attempt_id));
        setPaying(false);
      }
    } catch {
      setPaying(false);
    }
  }

  return (
    <View className="mt-6 rounded-control border border-action/40 bg-orange-50/40 p-4 gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-text">Scope change requested</Text>
        <Badge tone="warning">
          {amendment.status === "PAYMENT_PENDING" ? "Payment pending" : "Requested"}
        </Badge>
      </View>

      {amendment.reason ? (
        <Text className="text-sm text-text-secondary leading-5">{amendment.reason}</Text>
      ) : null}

      {amendment.lines.length > 0 ? (
        <View className="divide-y divide-line/60 rounded-control border border-line bg-surface p-3 gap-2">
          {amendment.lines.map((line) => (
            <View key={line.id} className="flex-row justify-between items-center py-1">
              <Text className="text-xs text-text">{line.label}</Text>
              <Text className="text-xs font-semibold text-text">
                {formatMoney(line.amount_paise)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View className="flex-row justify-between items-baseline border-t border-line/60 pt-2">
        <Text className="text-xs font-semibold text-text uppercase">Extra total</Text>
        <Text className="text-base font-bold text-text">
          {formatMoney(amendment.total_paise)}
        </Text>
      </View>

      {approve.isError || decline.isError ? (
        <ErrorState
          inline
          title="Could not update scope change"
          message="Check your connection and try again."
        />
      ) : null}

      <View className="flex-row flex-wrap gap-3 mt-1">
        <Button
          loading={approve.isPending || paying}
          loadingLabel={paying ? "Opening checkout" : "Approving"}
          disabled={busy}
          onPress={() => void handleApprove()}
        >
          {amendment.status === "PAYMENT_PENDING" ? "Pay for change" : "Approve and pay"}
        </Button>
        {amendment.status === "PROPOSED" ? (
          <Button
            variant="outline"
            loading={decline.isPending}
            loadingLabel="Declining"
            disabled={busy}
            onPress={() =>
              decline.mutate({
                amendmentId: amendment.id,
                bookingId,
              })
            }
          >
            Decline
          </Button>
        ) : null}
      </View>
    </View>
  );
}

function ProfessionalBlock({
  unit,
  isPaid,
  partnerDisplayName,
  partnerPhone,
}: {
  unit: FulfilmentUnit | null;
  isPaid: boolean;
  partnerDisplayName: string | null;
  partnerPhone: string | null;
}) {
  return (
    <View className="gap-3">
      {unit !== null && unit.professional && isPaid ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-1.5 self-start rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
            <Text className="text-xs font-semibold text-emerald-700">✓ Real Partner Details Unlocked</Text>
          </View>
          <ProfessionalCard professional={unit.professional} embedded />
        </View>
      ) : unit !== null && (unit.professional || unit.status === "HELD" || unit.status === "PAYMENT_PENDING") ? (
        <MockProfessionalCard serviceName={unit.lines[0]?.label} />
      ) : partnerDisplayName ? (
        <Text className="text-sm font-semibold text-text">{partnerDisplayName}</Text>
      ) : (
        <Text className="text-sm text-text-secondary">
          Your professional will appear here once they are assigned.
        </Text>
      )}

      {partnerPhone ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Call your professional"
          onPress={() => void Linking.openURL(`tel:${partnerPhone}`)}
          className={buttonStyles({ variant: "outline", className: "w-full sm:w-auto" })}
        >
          <Text className="text-sm font-semibold text-text">Call your professional</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function VisitPanel({
  bookingId,
  groupId,
}: {
  bookingId: string;
  groupId?: string;
}) {
  const visit = useVisit(bookingId);
  const groupQuery = useBookingGroup(groupId ?? null);

  if (visit.isPending) {
    return (
      <Card className="flex-row items-center gap-2 p-6">
        <Spinner size="sm" />
        <Text className="text-sm text-text-secondary">Loading this visit…</Text>
      </Card>
    );
  }

  if (visit.isError || !visit.data) {
    return (
      <ErrorState
        title="We could not load this visit"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void visit.refetch()}
      />
    );
  }

  const data = visit.data;
  const group = groupQuery.data ?? null;
  const unit = group?.units.find((candidate) => candidate.booking_id === data.id) ?? null;
  const services = unit !== null ? serviceLinesOf(unit) : [];
  const startsAt = unit?.starts_at ?? data.scheduled_start;
  const isPaid =
    group !== null &&
    (group.order_id !== null || group.status === "BOOKED" || group.status === "COMPLETED");
  const showPaymentColumn =
    unit !== null ||
    data.work_tasks.length > 0 ||
    (groupId !== undefined && groupQuery.isPending);

  return (
    <View className="gap-4">
      <Card className="p-5 shadow-xs">
        <View className="flex-row flex-wrap items-start justify-between gap-3">
          <View className="flex-1 min-w-0">
            {unit !== null ? (
              <UnitStatusBadge unit={unit} />
            ) : (
              <VisitStatusBadge status={data.status} />
            )}
            <Text className="mt-2 text-sm leading-6 text-text-secondary">
              {VISIT_STATUS_DESCRIPTIONS[data.status]}
            </Text>
          </View>
        </View>

        <View className="mt-4">
          <VisitProgress status={data.status} />
        </View>

        {unit?.booking_id ? (
          <View className="mt-4">
            <VisitStartCode bookingId={unit.booking_id} status={data.status} />
          </View>
        ) : null}

        {data.status === "RECOVERY_REQUIRED" ? (
          <Text className="mt-4 rounded-control bg-surface-sunken p-3 text-sm leading-6 text-text-secondary">
            Your professional had to step back. We are assigning someone else now — if we cannot,
            this visit is cancelled and refunded in full automatically.
          </Text>
        ) : (
          <View className="mt-6">
            <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Professional
            </Text>
            <View className="mt-2">
              {groupQuery.isPending && unit === null && !data.partner_display_name ? (
                <Text className="text-sm text-text-secondary">Loading professional details…</Text>
              ) : (
                <ProfessionalBlock
                  unit={unit}
                  isPaid={isPaid}
                  partnerDisplayName={data.partner_display_name}
                  partnerPhone={data.partner_phone}
                />
              )}
            </View>
          </View>
        )}

        <View className="mt-6 border-t border-line pt-5">
          <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Schedule
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-y-3">
            <View className="w-[48%]">
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Date</Text>
              <Text className="mt-0.5 text-sm font-medium text-text">
                {formatBookingDate(startsAt)}
              </Text>
            </View>
            <View className="w-[48%]">
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">Time</Text>
              <Text className="mt-0.5 text-sm font-medium text-text">
                {formatBookingTime(startsAt)}
              </Text>
            </View>
            {unit !== null ? (
              <View className="w-[48%]">
                <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Arrival window
                </Text>
                <Text className="mt-0.5 text-sm font-medium text-text">
                  {unit.arrival_window_minutes} min
                </Text>
              </View>
            ) : null}
            <View className="w-[48%]">
              <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Estimated work
              </Text>
              <Text className="mt-0.5 text-sm font-medium text-text">
                about {unit?.estimated_duration_minutes ?? data.estimated_duration_minutes} min
              </Text>
            </View>
          </View>
        </View>

        {unit !== null && services.length > 0 ? (
          <View className="mt-6 border-t border-line pt-5">
            <Text className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Service
            </Text>
            <View className="mt-2 gap-1">
              {services.map((line) => (
                <Text key={line.id} className="text-sm text-text">
                  {line.label}
                  {line.quantity > 1 ? (
                    <Text className="text-text-secondary"> × {line.quantity}</Text>
                  ) : null}
                </Text>
              ))}
            </View>
          </View>
        ) : null}

        {data.active_amendment ? (
          <ScopeAmendmentSection amendment={data.active_amendment} bookingId={data.id} />
        ) : null}

        {canRequestStartOtp(data) ? <StartCodePrompt visit={data} /> : null}
        {canRespondToCompletion(data) ? <CompletionDecision visit={data} /> : null}

        <VisitActions visit={data} />
      </Card>

      {showPaymentColumn ? (
        <View>
          {unit !== null ? (
            <PaidVisitPaymentCard
              unit={unit}
              groupId={groupId ?? group?.id ?? ""}
              orderId={group?.order_id ?? null}
            />
          ) : data.work_tasks.length > 0 ? (
            <VisitTasksPaymentCard visit={data} />
          ) : (
            <Card className="p-5 shadow-xs">
              <View className="flex-row items-center gap-2">
                <Spinner size="sm" />
                <Text className="text-sm text-text-secondary">Loading payment summary…</Text>
              </View>
            </Card>
          )}
        </View>
      ) : null}

      <BookingSupport reference={groupId ?? data.id} />

      {isVisitWorkComplete(data.status) ? (
        <>
          <VisitFeedbackForm bookingId={data.id} isComplete />
          <CompletionRating subject="booking" id={data.id} isComplete />
        </>
      ) : null}
    </View>
  );
}

