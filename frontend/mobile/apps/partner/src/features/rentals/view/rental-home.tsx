import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Card, COLOR_TOKENS, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  PackageCheck,
  PackageOpen,
  Phone,
  Plus,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { type PartnerRentalBooking } from "../model";
import { dateLabel, isSameLocalDay } from "../pickup-time";
import {
  fetchPartnerRentalAssets,
  fetchPartnerRentalBookings,
  partnerRentalBookingAction,
} from "../queries";
import {
  DisputeDialog,
  HandoverPinDialog,
  PartnerCancelDialog,
  ReturnChoiceDialog,
} from "./rental-action-dialogs";
import { RentalBookingDetailSheet } from "./rental-booking-detail-sheet";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function time(value: string | undefined): number {
  return value ? new Date(value).getTime() : 0;
}

/**
 * Home for a partner who rents items out.
 * Answers "who is coming today, what is due back, and what do I have free".
 */
export function RentalHome() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [now] = useState(() => new Date());

  // Interactive booking sheet & action dialog states
  const [detailBooking, setDetailBooking] = useState<PartnerRentalBooking | null>(null);
  const [handoverBooking, setHandoverBooking] = useState<PartnerRentalBooking | null>(null);
  const [returnChoiceBooking, setReturnChoiceBooking] = useState<PartnerRentalBooking | null>(null);
  const [disputeBooking, setDisputeBooking] = useState<PartnerRentalBooking | null>(null);
  const [cancelBooking, setCancelBooking] = useState<PartnerRentalBooking | null>(null);
  const [serverHandoverError, setServerHandoverError] = useState<string | null>(null);

  const bookings = useQuery({
    queryKey: ["partner-rental-bookings", "home"],
    queryFn: () => fetchPartnerRentalBookings(),
  });

  const assets = useQuery({
    queryKey: ["partner-rental-assets"],
    queryFn: fetchPartnerRentalAssets,
  });

  const bookingActionMutation = useMutation({
    mutationFn: ({
      bookingId,
      action,
      payload,
    }: {
      bookingId: string;
      action: "handover" | "return" | "release-deposit" | "dispute-deposit" | "cancel";
      payload?: {
        pin?: string;
        reason?: string;
        consume_paise?: number;
        photo_ids?: string[];
      };
    }) => partnerRentalBookingAction(bookingId, action, payload),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-rental-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["partner-rental-assets"] });
      setHandoverBooking(null);
      setDisputeBooking(null);
      setCancelBooking(null);
      setServerHandoverError(null);

      if (vars.action === "return") {
        const found = bookings.data?.find((b) => b.id === vars.bookingId);
        if (found) {
          setReturnChoiceBooking(found);
        }
      } else {
        Alert.alert("Success", "Booking status updated successfully.");
      }
    },
    onError: (err: Error, vars) => {
      if (vars.action === "handover") {
        setServerHandoverError(err?.message || "Invalid handover PIN. Please check with customer.");
      } else {
        Alert.alert("Action Failed", err?.message || "Could not complete booking action.");
      }
    },
  });

  const rows = (bookings.data ?? []) as PartnerRentalBooking[];
  const pickups = rows
    .filter((b) => b.status === "CONFIRMED" && isSameLocalDay(b.start_date, now))
    .sort((a, b) => time(a.start_date) - time(b.start_date));

  const returns = rows
    .filter(
      (b) =>
        b.status === "HANDOVER" &&
        (isSameLocalDay(b.end_date, now) || time(b.end_date) < now.getTime()),
    )
    .sort((a, b) => time(a.end_date) - time(b.end_date));

  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  const upcoming = rows
    .filter(
      (b) =>
        b.status === "CONFIRMED" &&
        time(b.start_date) >= endOfToday &&
        time(b.start_date) < now.getTime() + WEEK_MS,
    )
    .sort((a, b) => time(a.start_date) - time(b.start_date));

  const live = (assets.data ?? []).filter((a) => a.public_state === "PUBLISHED");
  const pieces = live.reduce((n, a) => n + a.quantity_available, 0);
  const activeBookings = rows.filter((b) => b.status === "CONFIRMED" || b.status === "HANDOVER");
  const booked = activeBookings.reduce((n, b) => n + (b.quantity ?? 1), 0);
  const free = Math.max(0, pieces - booked);

  const isRefreshing = bookings.isRefetching || assets.isRefetching;
  const onRefresh = () => {
    void bookings.refetch();
    void assets.refetch();
  };

  if (bookings.isPending || assets.isPending) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas p-6 py-20">
        <Spinner size="lg" />
        <Text className="text-xs text-text-muted">Loading your rentals…</Text>
      </View>
    );
  }

  const failure = bookings.error ?? assets.error;
  if (failure) {
    return (
      <View className="flex-1 bg-canvas p-6 justify-center">
        <ErrorState
          title="Could not load rentals dashboard"
          message={failure instanceof Error ? failure.message : "Failed to load rentals"}
          onAction={onRefresh}
        />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerClassName="gap-5 p-4 pb-24"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      {/* 3 Top Tallies */}
      <View className="flex-row gap-2">
        <Tally label="Live pieces" value={pieces} />
        <Tally label="Booked now" value={booked} tone="text-warning-text" />
        <Tally label="Available" value={free} tone="text-success-text" />
      </View>

      {/* Pickups today & Returns today */}
      <View className="gap-4">
        <Group
          title="Pickups today"
          icon={<PackageOpen size={16} color={COLOR_TOKENS.textMuted} />}
          empty="No one is collecting an item today."
          rows={pickups}
          when={(b) => dateLabel(b.start_date)}
          onSelectBooking={(b) => setDetailBooking(b)}
        />
        <Group
          title="Returns today"
          icon={<PackageCheck size={16} color={COLOR_TOKENS.textMuted} />}
          empty="No items are due back today."
          rows={returns}
          when={(b) =>
            time(b.end_date) < now.getTime()
              ? `Overdue · ${dateLabel(b.end_date)}`
              : dateLabel(b.end_date)
          }
          late={(b) => time(b.end_date) < now.getTime()}
          onSelectBooking={(b) => setDetailBooking(b)}
        />
      </View>

      {/* Next 7 days */}
      <Group
        title="Next 7 days"
        empty="No pickups booked for the coming week."
        rows={upcoming}
        when={(b) => dateLabel(b.start_date)}
        onSelectBooking={(b) => setDetailBooking(b)}
      />

      {/* Action navigation buttons */}
      <View className="flex-row flex-wrap gap-2 pt-2">
        <Button
          variant="primary"
          onPress={() => router.push("/rentals?add=1" as never)}
          className="flex-1 flex-row items-center justify-center gap-1.5 py-3"
        >
          <Plus size={16} color={COLOR_TOKENS.textInverse} />
          <Text className="text-xs font-bold text-white">Add an item</Text>
        </Button>
        <Button
          variant="outline"
          onPress={() => router.push("/rentals/bookings" as never)}
          className="flex-1 flex-row items-center justify-center gap-1.5 py-3"
        >
          <Text className="text-xs font-bold text-navy-900">See all bookings</Text>
          <ArrowRight size={14} color={COLOR_TOKENS.text} />
        </Button>
      </View>

      {/* Booking detail sheet */}
      <RentalBookingDetailSheet
        booking={detailBooking}
        open={detailBooking !== null}
        onOpenChange={(v) => {
          if (!v) setDetailBooking(null);
        }}
        onHandover={(b) => {
          setServerHandoverError(null);
          setHandoverBooking(b);
        }}
        onReturn={(b) => {
          Alert.alert(
            "Confirm Equipment Return",
            `Has ${b.asset?.title || "the equipment"} been returned safely?`,
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Confirm Return",
                onPress: () =>
                  bookingActionMutation.mutate({
                    bookingId: b.id,
                    action: "return",
                    payload: { consume_paise: 0 },
                  }),
              },
            ],
          );
        }}
        onReleaseDeposit={(b) => {
          bookingActionMutation.mutate({
            bookingId: b.id,
            action: "release-deposit",
            payload: { consume_paise: 0 },
          });
        }}
        onDisputeDeposit={(b) => {
          setDisputeBooking(b);
        }}
        onCancelBooking={(b) => {
          setCancelBooking(b);
        }}
      />

      {/* Handover Dialog */}
      <HandoverPinDialog
        open={handoverBooking !== null}
        onOpenChange={(v) => {
          if (!v) setHandoverBooking(null);
        }}
        equipmentTitle={handoverBooking?.asset?.title || "Equipment"}
        customerName={handoverBooking?.customer_name || "Customer"}
        onSubmit={(pin) => {
          if (!handoverBooking) return;
          bookingActionMutation.mutate({
            bookingId: handoverBooking.id,
            action: "handover",
            payload: { pin, consume_paise: 0 },
          });
        }}
        isPending={bookingActionMutation.isPending}
        serverError={serverHandoverError}
      />

      {/* Post-return Choice Dialog */}
      <ReturnChoiceDialog
        open={returnChoiceBooking !== null}
        onOpenChange={(v) => {
          if (!v) setReturnChoiceBooking(null);
        }}
        equipmentTitle={returnChoiceBooking?.asset?.title || "Equipment"}
        onReleaseFull={() => {
          if (!returnChoiceBooking) return;
          bookingActionMutation.mutate({
            bookingId: returnChoiceBooking.id,
            action: "release-deposit",
            payload: { consume_paise: 0 },
          });
        }}
        onOpenDispute={() => {
          if (!returnChoiceBooking) return;
          setDisputeBooking(returnChoiceBooking);
        }}
      />

      {/* Dispute Dialog */}
      <DisputeDialog
        open={disputeBooking !== null}
        onOpenChange={(v) => {
          if (!v) setDisputeBooking(null);
        }}
        equipmentTitle={disputeBooking?.asset?.title || "Equipment"}
        maxDepositPaise={disputeBooking?.deposit?.amount_paise ?? disputeBooking?.deposit_paise ?? 0}
        onSubmit={(reason, consumePaise, photoIds) => {
          if (!disputeBooking) return;
          bookingActionMutation.mutate({
            bookingId: disputeBooking.id,
            action: "dispute-deposit",
            payload: {
              reason,
              consume_paise: consumePaise,
              photo_ids: photoIds,
            },
          });
        }}
        isPending={bookingActionMutation.isPending}
      />

      {/* Cancel Dialog */}
      <PartnerCancelDialog
        open={cancelBooking !== null}
        onOpenChange={(v) => {
          if (!v) setCancelBooking(null);
        }}
        equipmentTitle={cancelBooking?.asset?.title || "Equipment"}
        onSubmit={(reason) => {
          if (!cancelBooking) return;
          bookingActionMutation.mutate({
            bookingId: cancelBooking.id,
            action: "cancel",
            payload: { reason, consume_paise: 0 },
          });
        }}
        isPending={bookingActionMutation.isPending}
      />
    </ScrollView>
  );
}

function Tally({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="flex-1 border border-line bg-surface p-3">
      <Text className="text-xs font-semibold text-text-muted">{label}</Text>
      <Text className={`mt-0.5 text-2xl font-black ${tone ?? "text-navy-900"}`}>{value}</Text>
    </Card>
  );
}

function Group({
  title,
  icon,
  empty,
  rows,
  when,
  late,
  onSelectBooking,
}: {
  title: string;
  icon?: ReactNode;
  empty: string;
  rows: PartnerRentalBooking[];
  when: (b: PartnerRentalBooking) => string;
  late?: (b: PartnerRentalBooking) => boolean;
  onSelectBooking: (b: PartnerRentalBooking) => void;
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2 px-0.5">
        {icon ? <View>{icon}</View> : null}
        <Text className="text-xs font-bold uppercase tracking-wider text-text-muted">{title}</Text>
        {rows.length > 0 ? (
          <View className="rounded-full bg-surface-muted px-2 py-0.5">
            <Text className="text-[10px] font-bold text-text-muted">{rows.length}</Text>
          </View>
        ) : null}
      </View>

      {rows.length === 0 ? (
        <View className="rounded-xl border border-dashed border-line bg-surface/50 p-4">
          <Text className="text-xs text-text-secondary">{empty}</Text>
        </View>
      ) : (
        <View className="gap-2">
          {rows.map((b) => (
            <Pressable
              key={b.id}
              accessibilityRole="button"
              onPress={() => onSelectBooking(b)}
            >
              <Card className="flex-row items-center justify-between border border-line bg-surface p-3.5 shadow-xs active:bg-surface-hover">
                <View className="min-w-0 flex-1 pr-2">
                  <Text className="text-sm font-bold text-navy-900" numberOfLines={1}>
                    {b.asset?.title ?? "Rental item"}
                  </Text>
                  <Text className="mt-0.5 text-xs text-text-secondary" numberOfLines={1}>
                    {b.customer_name || "Customer"}
                    {(b.quantity ?? 1) > 1 ? ` · ${b.quantity} pieces` : ""}
                  </Text>
                  <View className="mt-1 flex-row items-center gap-1.5">
                    {late?.(b) ? (
                      <Badge tone="danger">
                        <Text className="text-[10px] font-bold text-white">{when(b)}</Text>
                      </Badge>
                    ) : (
                      <Text className="text-xs font-semibold text-navy-900">{when(b)}</Text>
                    )}
                  </View>
                </View>

                {b.customer_phone ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => {
                      void Linking.openURL(`tel:${b.customer_phone}`);
                    }}
                    className="h-8 flex-row items-center gap-1 px-3"
                  >
                    <Phone size={12} color={COLOR_TOKENS.text} />
                    <Text className="text-xs font-semibold text-navy-900">Call</Text>
                  </Button>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
