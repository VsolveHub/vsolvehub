import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, COLOR_TOKENS, Dialog, QuantityStepper, Text, TouchDatePicker } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { AlertCircle, Calendar, ShieldCheck, Store } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, TextInput, View } from "react-native";

import { isApiRequestError } from "@vsolve/api-client";
import { useAuthStore } from "@vsolve/mobile-core";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import { calculateRentalDays, formatPaise, type RentalAsset } from "../model";
import { completeOrOpenRentalCheckout } from "../payment-handoff";
import { addDaysIso, formatReadableDate, todayIso } from "../pickup-time";
import { bookRental, fetchMyRentals, fetchRentalPlatformFee } from "../queries";

function getInitialAvailableDates(
  minIso: string,
  reservedRanges?: Array<{ start_date: string; end_date: string }>,
  defaultDuration = 2,
): { start: string; end: string } {
  let candidateStart = addDaysIso(minIso, 1);
  let candidateEnd = addDaysIso(candidateStart, defaultDuration);

  if (!reservedRanges || reservedRanges.length === 0) {
    return { start: candidateStart, end: candidateEnd };
  }

  const sortedRanges = [...reservedRanges].sort((a, b) => a.start_date.localeCompare(b.start_date));

  let hasOverlap = true;
  let attempts = 0;
  while (hasOverlap && attempts < 60) {
    attempts++;
    hasOverlap = false;
    for (const range of sortedRanges) {
      if (candidateStart < range.end_date && candidateEnd > range.start_date) {
        hasOverlap = true;
        candidateStart = range.end_date;
        candidateEnd = addDaysIso(candidateStart, defaultDuration);
        break;
      }
    }
  }

  return { start: candidateStart, end: candidateEnd };
}

function checkDateOverlap(
  start: string,
  end: string,
  reservedRanges?: Array<{ start_date: string; end_date: string }>,
): { start_date: string; end_date: string } | null {
  if (!reservedRanges || reservedRanges.length === 0) return null;
  for (const range of reservedRanges) {
    if (start < range.end_date && end > range.start_date) {
      return range;
    }
  }
  return null;
}

export function RentalBookSheet({
  asset,
  open,
  onOpenChange,
}: {
  asset: RentalAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);

  const minStart = todayIso();
  const initialDates = getInitialAvailableDates(minStart, asset.reserved_ranges, 2);

  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pickupPickerOpen, setPickupPickerOpen] = useState(false);
  const [returnPickerOpen, setReturnPickerOpen] = useState(false);

  // Check if current user already has an active or pending booking for this asset
  const myRentalsQuery = useQuery({
    queryKey: ["my-rentals"],
    queryFn: fetchMyRentals,
    enabled: authStatus === "signedIn",
    staleTime: 10_000,
  });

  const existingBooking = (myRentalsQuery.data ?? []).find(
    (b) =>
      (b.asset_id === asset.id || b.asset?.id === asset.id || b.asset?.slug === asset.slug) &&
      (b.status === "PENDING_PAYMENT" || b.status === "CONFIRMED" || b.status === "HANDED_OVER"),
  );

  // Keep dates synchronized with latest reservations if current selection becomes reserved
  useEffect(() => {
    if (checkDateOverlap(startDate, endDate, asset.reserved_ranges)) {
      const fresh = getInitialAvailableDates(minStart, asset.reserved_ranges, 2);
      setStartDate(fresh.start);
      setEndDate(fresh.end);
    }
  }, [asset.reserved_ranges]);

  // W-026 / GAP-RNT-002: Upfront out-of-stock guard
  const permanentlyOutOfStock = asset.quantity_available === 0;

  const maxQty = Math.max(1, asset.quantity_available ?? 1);
  const clampedQty = Math.min(Math.max(1, quantity), maxQty);
  const days = calculateRentalDays(startDate, endDate);
  const rentalFeePaise = days * asset.daily_rate_paise * clampedQty;
  const depositPaise = asset.deposit_paise * clampedQty;

  const platformFeeQuery = useQuery({
    queryKey: ["rental-platform-fee"],
    queryFn: fetchRentalPlatformFee,
    staleTime: 30_000,
  });
  const feePercent = platformFeeQuery.data?.percent ?? 0;
  const platformFeePaise = Math.floor((rentalFeePaise * feePercent) / 100);
  const totalPaise = rentalFeePaise + platformFeePaise + depositPaise;

  const mutation = useMutation({
    mutationFn: () =>
      bookRental({
        asset_id: asset.id,
        start_date: startDate,
        end_date: endDate,
        pickup_or_delivery_mode: "PICKUP",
        notes,
        quantity: clampedQty,
      }),
    onSuccess: async (booking) => {
      setIsProcessing(true);
      try {
        await queryClient.invalidateQueries({ queryKey: ["rental-asset"] });
        await queryClient.invalidateQueries({ queryKey: ["my-rentals"] });
        const deposit = booking.deposit;
        const attemptId = deposit?.payment_attempt_id;

        if (attemptId) {
          const result = await completeOrOpenRentalCheckout(String(attemptId), {
            businessName: "Vsolve Hub",
          });
          // W-037: Exact handling for all payment modes matching web
          if (result.mode === "simulated") {
            Alert.alert(
              "Booking Confirmed",
              "Rental fee and deposit recorded. Razorpay is not configured, so payment was simulated.",
            );
          } else if (result.mode === "pending") {
            Alert.alert(
              "Pending Payment",
              "Booking created and unpaid (Pending). Payment is still preparing — open My Rentals shortly to pay.",
            );
          } else {
            Alert.alert(
              "Payment Submitted",
              "Payment submitted. Waiting for Razorpay capture — booking stays Pending until then.",
            );
          }
        } else {
          Alert.alert("Booking Confirmed", "Rental booking confirmed.");
        }
        onOpenChange(false);
        router.push("/rentals/mine" as never);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Booking created. Please check My Rentals.");
        router.push("/rentals/mine" as never);
      } finally {
        setIsProcessing(false);
      }
    },
    onError: async (err: unknown) => {
      await queryClient.invalidateQueries({ queryKey: ["rental-asset"] });
      await queryClient.invalidateQueries({ queryKey: ["my-rentals"] });

      const code = isApiRequestError(err) ? err.code : undefined;
      const httpStatus = isApiRequestError(err)
        ? err.status
        : (err as { status?: number })?.status;

      if (httpStatus === 401 || httpStatus === 403 || code === "not_authenticated") {
        setLoginOpen(true);
        setError("Please sign in to reserve this rental.");
        return;
      }
      if (code === "out_of_stock") {
        setError(
          (err as Error)?.message ||
            "Out of stock for these dates. The equipment is already reserved. Please select different dates.",
        );
        return;
      }
      if (code === "insufficient_quantity") {
        setError(
          (err as Error)?.message ||
            "Not enough quantity available for these dates. Try different dates.",
        );
        return;
      }
      if (isApiRequestError(err) && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        const firstField = Object.keys(err.fieldErrors)[0];
        const firstMsg = err.fieldErrors[firstField]?.[0];
        if (firstMsg) {
          setError(firstMsg);
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Failed to confirm rental booking.");
    },
  });

  const overlap = checkDateOverlap(startDate, endDate, asset.reserved_ranges);
  const isOutOfStockCode = (err: unknown): boolean => {
    if (!err) return false;
    const code = isApiRequestError(err) ? err.code : undefined;
    return code === "out_of_stock" || code === "insufficient_quantity";
  };
  const dateAwareUnavailable = Boolean(overlap) || isOutOfStockCode(mutation.error);
  const blockBooking = permanentlyOutOfStock || dateAwareUnavailable;

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    let nextEnd = addDaysIso(nextStart, Math.max(1, days));
    if (checkDateOverlap(nextStart, nextEnd, asset.reserved_ranges)) {
      nextEnd = addDaysIso(nextStart, 1);
    }
    setEndDate(nextEnd);
    setError(null);
    mutation.reset();
  };

  const handleEndDateChange = (nextEnd: string) => {
    setEndDate(nextEnd);
    setError(null);
    mutation.reset();
  };

  const handleQuantityChange = (nextQty: number) => {
    setQuantity(nextQty);
    setError(null);
    mutation.reset();
  };

  const handleConfirm = () => {
    if (blockBooking) return;
    setError(null);
    if (!startDate || !endDate) {
      setError("Please select both start and end rental dates.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("Rental return date must be after pickup date.");
      return;
    }
    if (overlap) {
      setError(
        `This equipment is already reserved from ${formatReadableDate(overlap.start_date)} to ${formatReadableDate(
          overlap.end_date,
        )}. Please select dates after ${formatReadableDate(overlap.end_date)}.`,
      );
      return;
    }
    if (authStatus !== "signedIn") {
      setLoginOpen(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Book Rental Equipment"
      description={`Reserve ${asset.title} with verified partner`}
    >
      <ScrollView className="max-h-[80vh] gap-4 py-2" showsVerticalScrollIndicator={false}>
        {/* Existing active booking banner */}
        {existingBooking ? (
          <View className="rounded-xl border border-warning-line bg-warning-surface p-3 gap-2">
            <View className="flex-row items-center gap-2">
              <AlertCircle size={15} color={COLOR_TOKENS.warning} />
              <Text className="flex-1 text-xs font-bold text-warning-text">
                {existingBooking.status === "PENDING_PAYMENT"
                  ? "Booking awaiting payment"
                  : "Active booking on this tool"}
              </Text>
            </View>
            <Text className="text-[11px] text-text-secondary leading-snug">
              Reserved: {formatReadableDate(existingBooking.start_date)} – {formatReadableDate(existingBooking.end_date)}.
              {existingBooking.status === "PENDING_PAYMENT"
                ? " Open My Rentals to complete checkout."
                : " View details in My Rentals."}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onOpenChange(false);
                router.push("/rentals/mine" as never);
              }}
              className="self-start rounded-lg bg-navy-900 px-3 py-1.5 active:bg-navy-800"
            >
              <Text className="text-xs font-bold text-white">Go to My Rentals</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Overlap warning banner */}
        {overlap ? (
          <View className="flex-row items-center gap-2 rounded-xl border border-warning-line bg-warning-surface p-3">
            <AlertCircle size={16} color={COLOR_TOKENS.warning} />
            <Text className="flex-1 text-xs font-semibold text-warning-text">
              Already booked from {formatReadableDate(overlap.start_date)} to {formatReadableDate(overlap.end_date)}.
              Please choose dates after {formatReadableDate(overlap.end_date)}.
            </Text>
          </View>
        ) : null}
        {/* Out of stock banner (W-026) */}
        {permanentlyOutOfStock ? (
          <View className="flex-row items-center gap-2 rounded-xl border border-danger-line bg-danger-surface p-3">
            <AlertCircle size={16} color={COLOR_TOKENS.danger} />
            <Text className="flex-1 text-xs font-bold text-danger-text">Out of stock</Text>
          </View>
        ) : null}

        {error ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
            <AlertCircle size={16} color={COLOR_TOKENS.danger} />
            <Text className="flex-1 text-xs font-medium text-danger">{error}</Text>
          </View>
        ) : null}

        {/* Schedule dates (Decision D4: Touch Date Pickers with D-shortcut chips) */}
        <View className="gap-3 rounded-2xl border border-line bg-canvas p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Rental Duration
            </Text>
            <View className="rounded-full bg-brand/10 px-2.5 py-0.5">
              <Text className="text-xs font-bold text-brand">
                {days} day{days === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          {/* Interactive Date Selection Cards */}
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pickup date: ${formatReadableDate(startDate)}. Tap to select date.`}
              onPress={() => setPickupPickerOpen(true)}
              disabled={permanentlyOutOfStock}
              className="flex-1 rounded-xl border border-line bg-surface p-3 active:border-brand active:bg-surface-hover"
            >
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Pickup Date
                </Text>
                <Calendar size={13} color={COLOR_TOKENS.textMuted} />
              </View>
              <Text className="text-sm font-extrabold text-navy-900" numberOfLines={1}>
                {formatReadableDate(startDate)}
              </Text>
              <Text className="text-[11px] font-medium text-text-secondary tabular-nums mt-0.5">
                {startDate}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Return date: ${formatReadableDate(endDate)}. Tap to select date.`}
              onPress={() => setReturnPickerOpen(true)}
              disabled={permanentlyOutOfStock}
              className="flex-1 rounded-xl border border-line bg-surface p-3 active:border-brand active:bg-surface-hover"
            >
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Return Date
                </Text>
                <Calendar size={13} color={COLOR_TOKENS.textMuted} />
              </View>
              <Text className="text-sm font-extrabold text-navy-900" numberOfLines={1}>
                {formatReadableDate(endDate)}
              </Text>
              <Text className="text-[11px] font-medium text-text-secondary tabular-nums mt-0.5">
                {endDate}
              </Text>
            </Pressable>
          </View>

          {/* Micro-adjusters for quick ±1 day changes */}
          <View className="flex-row items-center justify-between px-0.5">
            <View className="flex-row items-center gap-1.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous pickup day"
                onPress={() => {
                  const prev = addDaysIso(startDate, -1);
                  if (prev >= minStart) {
                    handleStartDateChange(prev);
                  }
                }}
                disabled={startDate <= minStart || permanentlyOutOfStock}
                className="rounded-lg border border-line bg-surface px-2.5 py-1 active:bg-canvas disabled:opacity-30"
              >
                <Text className="text-xs font-bold text-navy-900">◀ -1d</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next pickup day"
                onPress={() => {
                  const next = addDaysIso(startDate, 1);
                  handleStartDateChange(next);
                }}
                disabled={permanentlyOutOfStock}
                className="rounded-lg border border-line bg-surface px-2.5 py-1 active:bg-canvas"
              >
                <Text className="text-xs font-bold text-navy-900">+1d ▶</Text>
              </Pressable>
            </View>

            <View className="flex-row items-center gap-1.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous return day"
                onPress={() => {
                  const prev = addDaysIso(endDate, -1);
                  if (prev > startDate) handleEndDateChange(prev);
                }}
                disabled={endDate <= addDaysIso(startDate, 1) || permanentlyOutOfStock}
                className="rounded-lg border border-line bg-surface px-2.5 py-1 active:bg-canvas disabled:opacity-30"
              >
                <Text className="text-xs font-bold text-navy-900">◀ -1d</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next return day"
                onPress={() => {
                  handleEndDateChange(addDaysIso(endDate, 1));
                }}
                disabled={permanentlyOutOfStock}
                className="rounded-lg border border-line bg-surface px-2.5 py-1 active:bg-canvas"
              >
                <Text className="text-xs font-bold text-navy-900">+1d ▶</Text>
              </Pressable>
            </View>
          </View>

          {/* Quick Duration Shortcuts */}
          <View className="mt-1 flex-row gap-2">
            {[1, 2, 3, 7, 14].map((numDays) => {
              const targetEnd = addDaysIso(startDate, numDays);
              const wouldOverlap = Boolean(checkDateOverlap(startDate, targetEnd, asset.reserved_ranges));
              const isSelected = days === numDays && endDate === targetEnd;
              return (
                <Pressable
                  key={numDays}
                  accessibilityRole="button"
                  accessibilityLabel={`${numDays} day duration shortcut`}
                  onPress={() => {
                    if (!wouldOverlap) {
                      handleEndDateChange(targetEnd);
                    }
                  }}
                  disabled={permanentlyOutOfStock || wouldOverlap}
                  className={`flex-1 items-center rounded-lg border py-2 ${
                    isSelected
                      ? "border-brand bg-brand/10"
                      : wouldOverlap
                        ? "border-line/40 bg-surface-muted/30 opacity-40"
                        : "border-line bg-surface active:bg-surface-hover"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected
                        ? "text-brand"
                        : wouldOverlap
                          ? "text-text-muted line-through"
                          : "text-text-secondary"
                    }`}
                  >
                    {numDays}d
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Date Picker Modals (Decision D4) */}
        <TouchDatePicker
          open={pickupPickerOpen}
          onOpenChange={setPickupPickerOpen}
          value={startDate}
          onChange={handleStartDateChange}
          title="Select Pickup Date"
          minDate={minStart}
          disabledDates={(d) => {
            if (!asset.reserved_ranges) return false;
            return asset.reserved_ranges.some((r) => d >= r.start_date && d < r.end_date);
          }}
        />
        <TouchDatePicker
          open={returnPickerOpen}
          onOpenChange={setReturnPickerOpen}
          value={endDate}
          onChange={handleEndDateChange}
          title="Select Return Date"
          minDate={addDaysIso(startDate, 1)}
          disabledDates={(d) => {
            if (d <= startDate) return true;
            if (!asset.reserved_ranges) return false;
            return Boolean(checkDateOverlap(startDate, d, asset.reserved_ranges));
          }}
        />

        {/* Self pickup info banner */}
        <View className="flex-row items-center gap-2 rounded-xl border border-line bg-surface p-3">
          <Store size={18} color={COLOR_TOKENS.action} />
          <View className="flex-1">
            <Text className="text-xs font-bold text-navy-900">Self Pickup</Text>
            <Text className="text-[11px] text-text-secondary">
              Collect and return at the partner location. Doorstep delivery is not offered.
            </Text>
          </View>
        </View>

        {/* Quantity Stepper */}
        {maxQty > 1 ? (
          <View className="flex-row items-center justify-between rounded-2xl border border-line bg-surface p-3.5">
            <View>
              <Text className="text-xs font-bold text-navy-900">Quantity Needed</Text>
              <Text className="text-[10px] text-text-muted">Up to {maxQty} units available</Text>
            </View>
            <QuantityStepper
              label="Quantity"
              decrementLabel="Decrease quantity"
              incrementLabel="Increase quantity"
              value={clampedQty}
              min={1}
              max={maxQty}
              onChange={handleQuantityChange}
              disabled={permanentlyOutOfStock}
            />
          </View>
        ) : null}

        {/* Notes input */}
        <View className="gap-1.5">
          <Text className="text-xs font-bold text-navy-900">
            Notes / Special Instructions (Optional)
          </Text>
          <TextInput
            placeholder="e.g. Need masonry drill bits, planning concrete anchor installation"
            placeholderTextColor={COLOR_TOKENS.placeholderText}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={2}
            className="rounded-xl border border-line bg-canvas p-3 text-xs text-navy-900"
          />
        </View>

        {/* Price Breakdown */}
        <View className="gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <View className="flex-row justify-between">
            <Text className="text-xs text-text-secondary">
              Rental ({days}d × {formatPaise(asset.daily_rate_paise)}
              {clampedQty > 1 ? ` × ${clampedQty}` : ""})
            </Text>
            <Text className="text-xs font-bold text-navy-900 tabular-nums">
              {formatPaise(rentalFeePaise)}
            </Text>
          </View>

          {feePercent > 0 ? (
            <View className="flex-row justify-between">
              <Text className="text-xs text-text-secondary">Platform fee ({feePercent}%)</Text>
              <Text className="text-xs font-bold text-navy-900 tabular-nums">
                {formatPaise(platformFeePaise)}
              </Text>
            </View>
          ) : null}

          <View className="flex-row justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-text-secondary">Refundable Deposit</Text>
              <ShieldCheck size={12} color={COLOR_TOKENS.success} />
            </View>
            <Text className="text-xs font-bold text-navy-900 tabular-nums">
              {formatPaise(depositPaise)}
            </Text>
          </View>

          <View className="border-t border-line/60 pt-2 flex-row justify-between items-center">
            <Text className="text-sm font-extrabold text-navy-900">Total Payable</Text>
            <Text className="text-base font-black text-brand tabular-nums">
              {formatPaise(totalPaise)}
            </Text>
          </View>

          <Text className="mt-1 text-[10px] text-text-muted">
            The security deposit is 100% refundable upon return after condition check.
          </Text>
        </View>

        {/* Submit Button (W-026, W-035, W-040: Spinner & dynamic mutated button labels) */}
        <Button
          variant="primary"
          disabled={mutation.isPending || isProcessing || blockBooking}
          onPress={handleConfirm}
          className={`mt-2 w-full py-3 flex-row items-center justify-center gap-2 ${
            blockBooking ? "opacity-50" : ""
          }`}
        >
          {mutation.isPending || isProcessing ? (
            <ActivityIndicator size="small" color={COLOR_TOKENS.textInverse} />
          ) : null}
          <Text className="font-bold text-white">
            {isProcessing
              ? "Opening payment…"
              : mutation.isPending
                ? "Creating rental booking…"
                : permanentlyOutOfStock
                  ? "Out of stock"
                  : dateAwareUnavailable
                    ? "Unavailable for these dates"
                    : "Confirm Rental Booking"}
          </Text>
        </Button>
      </ScrollView>

      {/* Authentication Sheet for Guests */}
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          handleConfirm();
        }}
      />
    </Dialog>
  );
}
