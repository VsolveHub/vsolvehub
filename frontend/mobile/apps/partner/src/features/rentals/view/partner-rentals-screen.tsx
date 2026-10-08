import { Button, EmptyState, ErrorState, Spinner, Text, cn } from "@vsolve/mobile-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";

import {
  type PartnerRentalAsset,
  type PartnerRentalBooking,
} from "../model";
import {
  fetchPartnerRentalAssets,
  fetchPartnerRentalBookings,
  partnerRentalAssetAction,
  partnerRentalBookingAction,
} from "../queries";
import {
  DisputeDialog,
  HandoverPinDialog,
  PartnerCancelDialog,
  ReturnChoiceDialog,
} from "./rental-action-dialogs";
import { RentalAdCard } from "./rental-ad-card";
import { RentalAdSheet } from "./rental-ad-sheet";
import { RentalBookingCard } from "./rental-booking-card";
import { RentalBookingDetailSheet } from "./rental-booking-detail-sheet";

const BOOKING_STATUS_FILTERS = [
  "ALL",
  "PENDING_PAYMENT",
  "CONFIRMED",
  "HANDOVER",
  "RETURNED",
  "CANCELLED",
  "DISPUTED",
] as const;

type BookingFilter = (typeof BOOKING_STATUS_FILTERS)[number];

export function PartnerRentalsScreen({ initialTab = "ads" }: { initialTab?: "ads" | "bookings" }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"ads" | "bookings">(initialTab);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PartnerRentalAsset | null>(null);

  // Status filter for bookings (Web W-032)
  const [bookingStatusFilter, setBookingStatusFilter] = useState<BookingFilter>("ALL");

  // Dialog states
  const [handoverBooking, setHandoverBooking] = useState<PartnerRentalBooking | null>(null);
  const [returnChoiceBooking, setReturnChoiceBooking] = useState<PartnerRentalBooking | null>(null);
  const [disputeBooking, setDisputeBooking] = useState<PartnerRentalBooking | null>(null);
  const [cancelBooking, setCancelBooking] = useState<PartnerRentalBooking | null>(null);
  const [detailBooking, setDetailBooking] = useState<PartnerRentalBooking | null>(null);
  const [serverHandoverError, setServerHandoverError] = useState<string | null>(null);

  const assetsQuery = useQuery({
    queryKey: ["partner-rental-assets"],
    queryFn: fetchPartnerRentalAssets,
  });

  const bookingsQuery = useQuery({
    queryKey: ["partner-rental-bookings", bookingStatusFilter],
    queryFn: () => fetchPartnerRentalBookings(bookingStatusFilter === "ALL" ? undefined : bookingStatusFilter),
  });

  const assetActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "submit" | "pause" | "resume" }) =>
      partnerRentalAssetAction(id, action),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner-rental-assets"] });
      Alert.alert("Success", "Equipment ad updated successfully.");
    },
    onError: (err: any) => {
      Alert.alert("Action Failed", err?.message || "Could not update status.");
    },
  });

  const bookingActionMutation = useMutation({
    mutationFn: ({
      bookingId,
      action,
      payload,
    }: {
      bookingId: string;
      action: "handover" | "return" | "release-deposit" | "dispute-deposit" | "cancel";
      payload?: any;
    }) => partnerRentalBookingAction(bookingId, action, payload),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["partner-rental-bookings"] });
      setHandoverBooking(null);
      setDisputeBooking(null);
      setCancelBooking(null);
      setServerHandoverError(null);

      // On return success, show post-return deposit decision choice (GAP-R-12 / W-035)
      if (vars.action === "return") {
        const found = bookingsQuery.data?.find((b) => b.id === vars.bookingId);
        if (found) {
          setReturnChoiceBooking(found);
        }
      } else {
        Alert.alert("Success", "Booking status updated successfully.");
      }
    },
    onError: (err: any, vars) => {
      if (vars.action === "handover") {
        setServerHandoverError(err?.message || "Invalid handover PIN. Please check with customer.");
      } else {
        Alert.alert("Action Failed", err?.message || "Could not complete booking action.");
      }
    },
  });

  const handleToggleStatus = (asset: PartnerRentalAsset) => {
    const nextAction = asset.status === "PAUSED" ? "resume" : "pause";
    assetActionMutation.mutate({ id: asset.id, action: nextAction });
  };

  const handleSubmitForReview = (asset: PartnerRentalAsset) => {
    assetActionMutation.mutate({ id: asset.id, action: "submit" });
  };

  // Handover action (GAP-R-01)
  const handleStartHandover = (booking: PartnerRentalBooking) => {
    setServerHandoverError(null);
    setHandoverBooking(booking);
  };

  const handleConfirmHandoverPin = (pin: string) => {
    if (!handoverBooking) return;
    bookingActionMutation.mutate({
      bookingId: handoverBooking.id,
      action: "handover",
      payload: { pin, consume_paise: 0 },
    });
  };

  // Return action
  const handleReturn = (booking: PartnerRentalBooking) => {
    Alert.alert(
      "Confirm Equipment Return",
      `Has ${booking.asset?.title || "the equipment"} been returned safely?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Return",
          onPress: () =>
            bookingActionMutation.mutate({
              bookingId: booking.id,
              action: "return",
              payload: { consume_paise: 0 },
            }),
        },
      ],
    );
  };

  // Release full deposit
  const handleReleaseDeposit = (booking: PartnerRentalBooking) => {
    bookingActionMutation.mutate({
      bookingId: booking.id,
      action: "release-deposit",
      payload: { consume_paise: 0 },
    });
  };

  // Dispute deposit claim (GAP-R-06)
  const handleOpenDispute = (booking: PartnerRentalBooking) => {
    setDisputeBooking(booking);
  };

  const handleSubmitDispute = (reason: string, consumePaise: number, photoIds: string[]) => {
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
  };

  // Pre-handover cancel (GAP-R-13)
  const handleOpenCancel = (booking: PartnerRentalBooking) => {
    setCancelBooking(booking);
  };

  const handleSubmitCancel = (reason: string) => {
    if (!cancelBooking) return;
    bookingActionMutation.mutate({
      bookingId: cancelBooking.id,
      action: "cancel",
      payload: { reason, consume_paise: 0 },
    });
  };

  const isRefreshing = assetsQuery.isRefetching || bookingsQuery.isRefetching;
  const onRefresh = () => {
    void assetsQuery.refetch();
    void bookingsQuery.refetch();
  };

  return (
    <View className="flex-1 bg-canvas">
      {/* Header bar */}
      <View className="border-b border-line bg-surface px-4 pb-3 pt-4">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xl font-extrabold text-navy-900">Rental Workspace</Text>
            <Text className="text-xs text-text-muted">
              Manage equipment inventory and customer rentals
            </Text>
          </View>
          <Button
            variant="primary"
            size="sm"
            onPress={() => {
              setEditingAsset(null);
              setSheetOpen(true);
            }}
            className="flex-row items-center gap-1 px-3"
          >
            <Plus size={15} color="#ffffff" />
            <Text className="text-xs font-bold text-white">Post Ad</Text>
          </Button>
        </View>

        {/* Tab switch */}
        <View className="mt-4 flex-row rounded-xl bg-surface-muted p-1">
          <Button
            variant="ghost"
            onPress={() => setTab("ads")}
            className={cn(
              "flex-1 rounded-lg py-2",
              tab === "ads" ? "bg-surface shadow-xs" : "bg-transparent",
            )}
          >
            <Text
              className={cn(
                "text-xs font-bold",
                tab === "ads" ? "text-navy-900" : "text-text-muted",
              )}
            >
              My Ads ({assetsQuery.data?.length ?? 0})
            </Text>
          </Button>
          <Button
            variant="ghost"
            onPress={() => setTab("bookings")}
            className={cn(
              "flex-1 rounded-lg py-2",
              tab === "bookings" ? "bg-surface shadow-xs" : "bg-transparent",
            )}
          >
            <Text
              className={cn(
                "text-xs font-bold",
                tab === "bookings" ? "text-navy-900" : "text-text-muted",
              )}
            >
              Bookings ({bookingsQuery.data?.length ?? 0})
            </Text>
          </Button>
        </View>

        {/* Status filter pills for Bookings view (Web W-032) */}
        {tab === "bookings" ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-3 gap-1.5 py-1"
          >
            {BOOKING_STATUS_FILTERS.map((st) => (
              <Pressable
                key={st}
                onPress={() => setBookingStatusFilter(st)}
                className={`rounded-full px-3 py-1 border ${
                  bookingStatusFilter === st
                    ? "border-navy-900 bg-navy-900"
                    : "border-line bg-surface"
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    bookingStatusFilter === st ? "text-white" : "text-text-secondary"
                  }`}
                >
                  {st.replace(/_/g, " ")}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        className="flex-1 px-4 py-4"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        contentContainerClassName="flex-grow pb-16"
      >
        {tab === "ads" ? (
          assetsQuery.isPending ? (
            <View className="items-center py-12">
              <Spinner size="lg" />
              <Text className="mt-2 text-xs text-text-muted">Loading rental ads...</Text>
            </View>
          ) : assetsQuery.isError ? (
            <ErrorState
              title="Failed to load rental ads"
              message="Check your network connection and try again."
              actionLabel="Retry"
              onAction={() => void assetsQuery.refetch()}
            />
          ) : (assetsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState
              title="No rental equipment listed"
              description="Post your tools, cameras, machinery, or vehicles to start earning daily rental income."
              action={
                <Button
                  variant="primary"
                  onPress={() => {
                    setEditingAsset(null);
                    setSheetOpen(true);
                  }}
                >
                  <Text className="font-bold text-white">Post First Equipment Ad</Text>
                </Button>
              }
            />
          ) : (
            <View className="flex-col gap-3">
              {assetsQuery.data?.map((asset) => (
                <RentalAdCard
                  key={asset.id}
                  asset={asset}
                  onEdit={(item) => {
                    setEditingAsset(item);
                    setSheetOpen(true);
                  }}
                  onToggleStatus={handleToggleStatus}
                  onSubmitForReview={handleSubmitForReview}
                  isSubmitting={assetActionMutation.isPending}
                />
              ))}
            </View>
          )
        ) : bookingsQuery.isPending ? (
          <View className="items-center py-12">
            <Spinner size="lg" />
            <Text className="mt-2 text-xs text-text-muted">Loading customer bookings...</Text>
          </View>
        ) : bookingsQuery.isError ? (
          <ErrorState
            title="Failed to load bookings"
            message="Check your network connection and try again."
            actionLabel="Retry"
            onAction={() => void bookingsQuery.refetch()}
          />
        ) : (bookingsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState
            title="No bookings yet"
            description="When customers book your rental equipment, active orders and handover schedules will appear here."
          />
        ) : (
          <View className="flex-col gap-3">
            {bookingsQuery.data?.map((booking) => (
              <RentalBookingCard
                key={booking.id}
                booking={booking}
                onHandover={handleStartHandover}
                onReturn={handleReturn}
                onReleaseDeposit={handleReleaseDeposit}
                onDisputeDeposit={handleOpenDispute}
                onCancelBooking={handleOpenCancel}
                onViewDetails={setDetailBooking}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Ad Post/Edit Sheet */}
      <RentalAdSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editingAsset={editingAsset}
      />

      {/* Handover PIN Modal (GAP-R-01) */}
      <HandoverPinDialog
        open={Boolean(handoverBooking)}
        onOpenChange={(v) => {
          if (!v) setHandoverBooking(null);
        }}
        equipmentTitle={handoverBooking?.asset?.title || "Equipment"}
        customerName={handoverBooking?.customer_name || "Customer"}
        onSubmit={handleConfirmHandoverPin}
        isPending={bookingActionMutation.isPending}
        serverError={serverHandoverError}
      />

      {/* Post-Return Choice Dialog (GAP-R-12 / W-035) */}
      <ReturnChoiceDialog
        open={Boolean(returnChoiceBooking)}
        onOpenChange={(v) => {
          if (!v) setReturnChoiceBooking(null);
        }}
        equipmentTitle={returnChoiceBooking?.asset?.title || "Equipment"}
        onReleaseFull={() => {
          if (returnChoiceBooking) handleReleaseDeposit(returnChoiceBooking);
          setReturnChoiceBooking(null);
        }}
        onOpenDispute={() => {
          if (returnChoiceBooking) setDisputeBooking(returnChoiceBooking);
          setReturnChoiceBooking(null);
        }}
      />

      {/* Dispute Claim Dialog (GAP-R-06 / W-036) */}
      <DisputeDialog
        open={Boolean(disputeBooking)}
        onOpenChange={(v) => {
          if (!v) setDisputeBooking(null);
        }}
        equipmentTitle={disputeBooking?.asset?.title || "Equipment"}
        maxDepositPaise={disputeBooking?.deposit?.amount_paise ?? disputeBooking?.deposit_paise ?? 0}
        onSubmit={handleSubmitDispute}
        isPending={bookingActionMutation.isPending}
      />

      {/* Partner Cancel Reservation Dialog (GAP-R-13 / W-037) */}
      <PartnerCancelDialog
        open={Boolean(cancelBooking)}
        onOpenChange={(v) => {
          if (!v) setCancelBooking(null);
        }}
        equipmentTitle={cancelBooking?.asset?.title || "Equipment"}
        onSubmit={handleSubmitCancel}
        isPending={bookingActionMutation.isPending}
      />

      {/* Booking Detail Drawer (W-038) */}
      <RentalBookingDetailSheet
        booking={detailBooking}
        open={Boolean(detailBooking)}
        onOpenChange={(v) => {
          if (!v) setDetailBooking(null);
        }}
        onHandover={handleStartHandover}
        onReturn={handleReturn}
        onReleaseDeposit={handleReleaseDeposit}
        onDisputeDeposit={handleOpenDispute}
        onCancelBooking={handleOpenCancel}
      />
    </View>
  );
}
