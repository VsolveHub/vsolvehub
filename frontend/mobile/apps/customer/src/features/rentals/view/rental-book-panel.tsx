import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, COLOR_TOKENS, QuantityStepper, Text, TouchDatePicker } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { AlertCircle, Calendar, Info, ShieldCheck, Store } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, TextInput, View } from "react-native";

import { isApiRequestError } from "@vsolve/api-client";
import { useAuthStore } from "@vsolve/mobile-core";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import { calculateRentalDays, formatPaise, type RentalAsset } from "../model";
import { completeOrOpenRentalCheckout } from "../payment-handoff";
import { addDaysIso, todayIso } from "../pickup-time";
import { bookRental, fetchMyRentals, fetchRentalPlatformFee } from "../queries";

function formatDmy(iso: string): string {
  if (!iso || !iso.includes("-")) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

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

export function RentalBookPanel({ asset }: { asset: RentalAsset }) {
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

  const permanentlyOutOfStock = asset.quantity_available === 0;
  const maxQty = Math.max(1, asset.quantity_available ?? 1);
  const clampedQty = Math.min(Math.max(1, quantity), maxQty);
  const days = calculateRentalDays(startDate, endDate);
  const rentalChargePaise = days * asset.daily_rate_paise * clampedQty;
  const depositPaise = asset.deposit_paise * clampedQty;

  const platformFeeQuery = useQuery({
    queryKey: ["rental-platform-fee"],
    queryFn: fetchRentalPlatformFee,
    staleTime: 30_000,
  });
  const feePercent = platformFeeQuery.data?.percent ?? 0;
  const platformFeePaise = Math.floor((rentalChargePaise * feePercent) / 100);
  const totalDuePaise = rentalChargePaise + platformFeePaise + depositPaise;

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
        `This equipment is already reserved from ${formatDmy(overlap.start_date)} to ${formatDmy(
          overlap.end_date,
        )}. Please select dates after ${formatDmy(overlap.end_date)}.`,
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
    <View className="rounded-2xl border border-line bg-surface p-6 shadow-xs gap-5">
      <View>
        <Text className="text-xl font-bold text-navy-900">Book This Rental</Text>
        <Text className="mt-1 text-xs text-text-secondary">
          Select your rental dates (DD/MM/YYYY). Zero hidden charges.
        </Text>
      </View>

      {/* Existing active or pending booking alert */}
      {existingBooking ? (
        <View className="rounded-xl border border-warning-line bg-warning-surface p-3.5 gap-2">
          <View className="flex-row items-center gap-2">
            <AlertCircle size={16} color={COLOR_TOKENS.warning} />
            <Text className="flex-1 text-xs font-bold text-warning-text">
              {existingBooking.status === "PENDING_PAYMENT"
                ? "You have a booking awaiting payment"
                : "You have an active booking for this equipment"}
            </Text>
          </View>
          <Text className="text-[11px] text-text-secondary leading-snug">
            Reserved dates: {formatDmy(existingBooking.start_date)} – {formatDmy(existingBooking.end_date)}.
            {existingBooking.status === "PENDING_PAYMENT"
              ? " Complete payment in My Rentals to finalize this booking."
              : " Check handover PIN and details in My Rentals."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/rentals/mine" as never)}
            className="self-start rounded-lg bg-navy-900 px-3 py-1.5 active:bg-navy-800"
          >
            <Text className="text-xs font-bold text-white">Go to My Rentals</Text>
          </Pressable>
        </View>
      ) : null}

      {overlap ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-warning-line bg-warning-surface p-3">
          <AlertCircle size={16} color={COLOR_TOKENS.warning} />
          <Text className="flex-1 text-xs font-semibold text-warning-text">
            Already booked from {formatDmy(overlap.start_date)} to {formatDmy(overlap.end_date)}.
            Please choose dates after {formatDmy(overlap.end_date)}.
          </Text>
        </View>
      ) : null}

      {permanentlyOutOfStock ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-danger-line bg-danger-surface p-3">
          <AlertCircle size={16} color={COLOR_TOKENS.danger} />
          <Text className="flex-1 text-xs font-semibold text-danger-text">Out of stock</Text>
        </View>
      ) : null}

      {/* Date Pickers */}
      <View className="gap-3">
        <View className="gap-1.5">
          <View className="flex-row items-center gap-1.5">
            <Calendar size={14} color={COLOR_TOKENS.textSecondary} />
            <Text className="text-xs font-bold text-navy-900">Pickup Date</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Pickup date: ${formatDmy(startDate)}. Tap to change.`}
            onPress={() => setPickupPickerOpen(true)}
            disabled={permanentlyOutOfStock}
            className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3 active:border-brand active:bg-surface-hover"
          >
            <Text className="text-sm font-semibold text-navy-900 tabular-nums">
              {formatDmy(startDate)}
            </Text>
            <Calendar size={16} color={COLOR_TOKENS.textMuted} />
          </Pressable>
        </View>

        <View className="gap-1.5">
          <View className="flex-row items-center gap-1.5">
            <Calendar size={14} color={COLOR_TOKENS.textSecondary} />
            <Text className="text-xs font-bold text-navy-900">Return Date</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Return date: ${formatDmy(endDate)}. Tap to change.`}
            onPress={() => setReturnPickerOpen(true)}
            disabled={permanentlyOutOfStock}
            className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3 active:border-brand active:bg-surface-hover"
          >
            <Text className="text-sm font-semibold text-navy-900 tabular-nums">
              {formatDmy(endDate)}
            </Text>
            <Calendar size={16} color={COLOR_TOKENS.textMuted} />
          </Pressable>
        </View>

        {/* Quick Duration Shortcuts matching Image 2 */}
        <View className="flex-row gap-2 pt-0.5">
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
                className={`flex-1 items-center justify-center rounded-xl border py-2.5 ${
                  isSelected
                    ? "border-navy-900 bg-surface shadow-2xs"
                    : wouldOverlap
                      ? "border-line/40 bg-surface-muted/30 opacity-40"
                      : "border-line bg-surface-muted/60 active:bg-surface-hover"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    isSelected
                      ? "text-navy-900"
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

      {/* Self pickup info box matching web */}
      <View className="flex-row items-center gap-3 rounded-xl border border-line bg-surface-muted p-3.5">
        <Store size={18} color={COLOR_TOKENS.action} />
        <View className="flex-1">
          <Text className="text-xs font-bold text-navy-900">Self pickup</Text>
          <Text className="text-[11px] text-text-secondary leading-snug">
            Collect and return at the partner location. Doorstep delivery is not offered.
          </Text>
        </View>
      </View>

      {/* Quantity Stepper if applicable */}
      {maxQty > 1 ? (
        <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface-muted p-3">
          <View>
            <Text className="text-xs font-bold text-navy-900">Quantity</Text>
            <Text className="text-[10px] text-text-muted">Up to {maxQty} units available</Text>
          </View>
          <QuantityStepper
            label="Quantity"
            decrementLabel="Decrease quantity"
            incrementLabel="Increase quantity"
            value={clampedQty}
            min={1}
            max={maxQty}
            onChange={(q) => {
              setQuantity(q);
              setError(null);
            }}
            disabled={permanentlyOutOfStock}
          />
        </View>
      ) : null}

      {/* Notes / Special Instructions */}
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
          className="rounded-xl border border-line bg-surface-muted p-3 text-xs text-navy-900"
        />
      </View>

      {/* Price Breakdown Box matching web */}
      <View className="gap-2.5 rounded-xl border border-line bg-surface-muted p-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-xs text-text-secondary">
            Rental Duration ({days} day{days === 1 ? "" : "s"} × {formatPaise(asset.daily_rate_paise)}
            {clampedQty > 1 ? ` × ${clampedQty}` : ""})
          </Text>
          <Text className="text-xs font-bold text-navy-900 tabular-nums">
            {formatPaise(rentalChargePaise)}
          </Text>
        </View>

        {feePercent > 0 ? (
          <View className="flex-row justify-between items-center">
            <Text className="text-xs text-text-secondary">Platform fee ({feePercent}%)</Text>
            <Text className="text-xs font-bold text-navy-900 tabular-nums">
              {formatPaise(platformFeePaise)}
            </Text>
          </View>
        ) : null}

        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-text-secondary">Refundable Security Deposit</Text>
            <ShieldCheck size={14} color={COLOR_TOKENS.success} />
          </View>
          <Text className="text-xs font-bold text-navy-900 tabular-nums">
            {formatPaise(depositPaise)}
          </Text>
        </View>

        <View className="border-t border-line/70 pt-2.5 flex-row justify-between items-center">
          <Text className="text-sm font-extrabold text-navy-900">Total Value</Text>
          <Text className="text-base font-black text-action tabular-nums">
            {formatPaise(totalDuePaise)}
          </Text>
        </View>

        <View className="flex-row items-start gap-1.5 pt-0.5">
          <Info size={14} color={COLOR_TOKENS.textMuted} className="mt-0.5" />
          <Text className="flex-1 text-[11px] leading-tight text-text-secondary/80">
            The security deposit is 100% refundable immediately upon equipment return and standard
            condition inspection.
          </Text>
        </View>
      </View>

      {error ? (
        <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
          <AlertCircle size={16} color={COLOR_TOKENS.danger} />
          <Text className="flex-1 text-xs font-medium text-danger">{error}</Text>
        </View>
      ) : null}

      {/* Submit Button matching Web (Action text navy on orange) */}
      <Button
        variant="primary"
        size="lg"
        disabled={mutation.isPending || isProcessing || blockBooking}
        onPress={handleConfirm}
        className={`w-full py-3.5 flex-row items-center justify-center gap-2 ${
          blockBooking ? "opacity-50" : ""
        }`}
      >
        {mutation.isPending || isProcessing ? (
          <ActivityIndicator size="small" color={COLOR_TOKENS.actionText} />
        ) : null}
        <Text className="text-sm font-bold text-action-text">
          {isProcessing
            ? "Opening payment…"
            : mutation.isPending
              ? "Creating rental booking…"
              : permanentlyOutOfStock
                ? "Out of stock"
                : overlap
                  ? "Dates already booked"
                  : dateAwareUnavailable
                    ? "Unavailable for these dates"
                    : authStatus !== "signedIn"
                      ? "Sign In to Reserve"
                      : "Confirm Rental Booking"}
        </Text>
      </Button>

      {/* Date Pickers Modals */}
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

      {/* Authentication Sheet for Guests */}
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          handleConfirm();
        }}
      />
    </View>
  );
}
