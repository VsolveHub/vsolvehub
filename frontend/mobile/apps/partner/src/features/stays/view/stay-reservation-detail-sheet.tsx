import {
  Badge,
  Button,
  Dialog,
  Field,
  Text,
  Textarea,
  Timeline,
  TimelineEvent,
} from "@vsolve/mobile-ui";
import { Linking, ScrollView, View } from "react-native";
import { Phone, User } from "lucide-react-native";
import { useState } from "react";

import {
  type StayReservation,
  formatPaise,
  stayReservationStatusLabel,
  stayReservationTone,
} from "../model";

const CANCELLABLE_RESERVATION_STATUSES = new Set(["HELD", "PAYMENT_PENDING", "CONFIRMED"]);

function localIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function StayReservationDetailSheet({
  reservation,
  open,
  onOpenChange,
  onCheckIn,
  onCheckOut,
  onNoShow,
  onCancel,
  isPending,
  actionError,
}: {
  reservation: StayReservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCheckIn: (id: string) => void;
  onCheckOut: (id: string) => void;
  onNoShow: (id: string) => void;
  onCancel: (id: string, reason: string) => void;
  isPending: boolean;
  actionError?: string | null;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false);

  if (!reservation) return null;

  const stayHasStarted = localIsoDate() >= reservation.check_in;
  const canCancel = CANCELLABLE_RESERVATION_STATUSES.has(reservation.status);
  const nights = reservation.nights ?? 0;
  const total = reservation.total_paise;
  const perNight =
    nights > 0 && typeof total === "number" ? Math.round(total / nights) : null;

  const badgeTone = stayReservationTone(reservation.status);
  const badgeLabel = stayReservationStatusLabel(reservation.status);

  const handleCall = () => {
    if (reservation.customer_phone) {
      void Linking.openURL(`tel:${reservation.customer_phone}`);
    }
  };

  const handleCancelSubmit = () => {
    if (!cancelReason.trim()) {
      setCancelError("Add a reason for the guest.");
      return;
    }
    onCancel(reservation.id, cancelReason.trim());
  };

  const timeline: { title: string; at: string; tone: "neutral" | "success" | "danger" }[] = [];
  if (reservation.created_at) {
    timeline.push({ title: "Booked", at: reservation.created_at, tone: "neutral" });
  }
  if (reservation.checked_in_at) {
    timeline.push({ title: "Checked in", at: reservation.checked_in_at, tone: "success" });
  }
  if (reservation.checked_out_at) {
    timeline.push({ title: "Checked out", at: reservation.checked_out_at, tone: "neutral" });
  }
  if (reservation.cancelled_at) {
    timeline.push({ title: "Cancelled", at: reservation.cancelled_at, tone: "danger" });
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCancelling(false);
            setCancelReason("");
            setCancelError(null);
          }
          onOpenChange(nextOpen);
        }}
        title={`${reservation.property_title ?? "Stay"} · ${reservation.unit_name ?? "Room"}`}
        description={`${badgeLabel} · Check-in ${reservation.check_in}`}
      >
        <ScrollView className="max-h-[75vh]" showsVerticalScrollIndicator={false}>
          <View className="flex-col gap-4 py-2">
            {/* Action error banner */}
            {actionError ? (
              <View className="rounded-lg bg-rose-50 p-2.5">
                <Text className="text-xs text-rose-600 font-medium">{actionError}</Text>
              </View>
            ) : null}

            {/* Check-in advisory */}
            {reservation.status === "CONFIRMED" && !stayHasStarted ? (
              <View className="rounded-lg bg-blue-50 p-2.5">
                <Text className="text-xs text-blue-800">
                  You can check the guest in from {reservation.check_in}.
                </Text>
              </View>
            ) : null}

            {/* Cancel booking section */}
            {cancelling ? (
              <View className="flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  Cancel this booking
                </Text>
                <Text className="text-xs text-text-secondary">
                  The guest is refunded in full and the room opens up again. Tell them why — they will see this message.
                </Text>
                <Field label="Reason" required error={cancelError ?? undefined}>
                  <Textarea
                    value={cancelReason}
                    onChangeText={(val) => {
                      setCancelReason(val);
                      if (cancelError) setCancelError(null);
                    }}
                    placeholder="e.g. Water damage in the room — we cannot host you on these dates."
                    rows={3}
                  />
                </Field>
                <View className="flex-row gap-2 pt-1">
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isPending}
                    onPress={handleCancelSubmit}
                    className="flex-1"
                  >
                    <Text className="text-xs font-bold text-white">
                      {isPending ? "Cancelling…" : "Cancel & Refund Guest"}
                    </Text>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onPress={() => setCancelling(false)}
                  >
                    <Text className="text-xs font-semibold text-text">Keep Booking</Text>
                  </Button>
                </View>
              </View>
            ) : null}

            {/* Guest Contact Section */}
            <View className="flex-col gap-2 rounded-xl border border-line bg-surface-muted p-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Guest
                </Text>
                <Badge tone={badgeTone}>{badgeLabel}</Badge>
              </View>

              {reservation.customer_name || reservation.customer_phone ? (
                <View className="flex-row items-center justify-between">
                  <View className="flex-col gap-0.5">
                    <View className="flex-row items-center gap-1.5">
                      <User size={14} color="#71717a" />
                      <Text className="text-sm font-bold text-text">
                        {reservation.customer_name || "—"}
                      </Text>
                    </View>
                    {reservation.customer_phone ? (
                      <Text className="text-xs text-text-secondary pl-5">
                        {reservation.customer_phone}
                      </Text>
                    ) : null}
                  </View>

                  {reservation.customer_phone ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onPress={handleCall}
                      className="h-7 flex-row items-center gap-1.5 px-2.5"
                    >
                      <Phone size={12} color="#071328" />
                      <Text className="text-xs font-semibold text-[#071328]">Call</Text>
                    </Button>
                  ) : null}
                </View>
              ) : (
                <View className="rounded-lg border border-dashed border-line p-2.5">
                  <Text className="text-xs font-medium text-text-muted">Not provided</Text>
                  <Text className="text-[11px] text-text-secondary mt-0.5">
                    This booking has no guest contact details.
                  </Text>
                </View>
              )}
            </View>

            {/* Stay Details Section */}
            <View className="flex-col gap-2 rounded-xl border border-line bg-surface p-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Stay Details
              </Text>
              <View className="flex-col gap-1.5 pt-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-muted">Check in</Text>
                  <Text className="text-xs font-semibold text-text">{reservation.check_in}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-muted">Check out</Text>
                  <Text className="text-xs font-semibold text-text">{reservation.check_out}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-muted">Nights</Text>
                  <Text className="text-xs font-semibold text-text">{nights}</Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-muted">Guests</Text>
                  <Text className="text-xs font-semibold text-text">
                    {reservation.guest_count ?? 1} guest{(reservation.guest_count ?? 1) === 1 ? "" : "s"}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-muted">Room</Text>
                  <Text className="text-xs font-semibold text-text">
                    {reservation.unit_name ?? "—"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Amounts Section */}
            <View className="flex-col gap-2 rounded-xl border border-line bg-surface p-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Amounts
              </Text>
              <View className="flex-row items-baseline justify-between pt-1">
                <Text className="text-xs text-text-muted">Booking total</Text>
                <Text className="text-base font-bold text-navy-900">
                  {typeof total === "number" ? formatPaise(total) : "—"}
                </Text>
              </View>
              {nights > 0 ? (
                <Text className="text-[11px] text-text-muted">
                  Across {nights} night{nights === 1 ? "" : "s"}
                </Text>
              ) : null}
              {perNight !== null ? (
                <View className="flex-row items-center justify-between border-t border-line/50 pt-2">
                  <Text className="text-xs text-text-muted">Per night (average)</Text>
                  <Text className="text-xs font-semibold text-text">{formatPaise(perNight)}</Text>
                </View>
              ) : null}

              {/* Invoice Notice */}
              <View className="mt-1 rounded-lg border border-dashed border-line bg-surface-muted p-2.5">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Invoice
                </Text>
                <Text className="mt-0.5 text-[11px] text-text-secondary">
                  The tax invoice for this booking is not shared with Partner accounts yet. The amounts above are what the customer was charged.
                </Text>
              </View>
            </View>

            {/* Timeline History Section */}
            {timeline.length > 0 ? (
              <View className="flex-col gap-2 rounded-xl border border-line bg-surface p-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">
                  Reservation History
                </Text>
                <Timeline label="History">
                  {timeline.map((event) => (
                    <TimelineEvent
                      key={event.title}
                      title={event.title}
                      timestamp={event.at}
                      tone={event.tone}
                    />
                  ))}
                </Timeline>
              </View>
            ) : null}

            {/* Actions Footer */}
            <View className="flex-col gap-2 pt-2 border-t border-line/60">
              {reservation.status === "CONFIRMED" ? (
                <Button
                  variant="primary"
                  size="md"
                  disabled={isPending || !stayHasStarted}
                  onPress={() => onCheckIn(reservation.id)}
                  className="w-full"
                >
                  <Text className="text-sm font-bold text-white">
                    {isPending ? "Updating…" : "Check in"}
                  </Text>
                </Button>
              ) : null}

              {reservation.status === "CHECKED_IN" ? (
                <Button
                  variant="secondary"
                  size="md"
                  disabled={isPending}
                  onPress={() => onCheckOut(reservation.id)}
                  className="w-full"
                >
                  <Text className="text-sm font-semibold text-[#071328]">
                    {isPending ? "Updating…" : "Check out"}
                  </Text>
                </Button>
              ) : null}

              {reservation.status === "CONFIRMED" && stayHasStarted ? (
                <Button
                  variant="secondary"
                  size="md"
                  disabled={isPending}
                  onPress={() => setNoShowConfirmOpen(true)}
                  className="w-full"
                >
                  <Text className="text-sm font-semibold text-rose-700">
                    Guest didn’t arrive
                  </Text>
                </Button>
              ) : null}

              <View className="flex-row items-center justify-between gap-2 pt-1">
                {canCancel && !cancelling ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onPress={() => setCancelling(true)}
                  >
                    <Text className="text-xs font-semibold text-rose-600">Cancel booking</Text>
                  </Button>
                ) : <View />}

                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => onOpenChange(false)}
                >
                  <Text className="text-xs font-semibold text-text">Close</Text>
                </Button>
              </View>
            </View>
          </View>
        </ScrollView>
      </Dialog>

      {/* No-show confirm dialog */}
      <Dialog
        open={noShowConfirmOpen}
        onOpenChange={setNoShowConfirmOpen}
        title="Guest didn’t arrive?"
        description="This will mark the reservation as a no-show. The room will be freed and recorded accordingly."
      >
        <View className="flex-row justify-end gap-2 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => setNoShowConfirmOpen(false)}
          >
            <Text className="text-xs font-semibold text-text">Keep Booking</Text>
          </Button>
          <Button
            variant="danger"
            size="sm"
            onPress={() => {
              setNoShowConfirmOpen(false);
              onNoShow(reservation.id);
            }}
          >
            <Text className="text-xs font-bold text-white">Yes – Confirm No-Show</Text>
          </Button>
        </View>
      </Dialog>
    </>
  );
}
