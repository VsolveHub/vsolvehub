import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, COLOR_TOKENS, QuantityStepper, Text, TouchDatePicker } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Info,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, TextInput, View } from "react-native";

import { isApiRequestError } from "@vsolve/api-client";
import { useAuthStore } from "@vsolve/mobile-core";
import { useCustomerProfile } from "@/features/account/queries";
import { preferredAddressId, useAddresses, type Address } from "@/features/addresses/queries";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import { calculateRentalDays, formatPaise, type RentalAsset, type RentalBooking } from "../model";
import { completeOrOpenRentalCheckout } from "../payment-handoff";
import { addDaysIso, todayIso } from "../pickup-time";
import { bookRental, fetchMyRentals, fetchRentalPlatformFee } from "../queries";
import { deliveryAddressFrom, deliveryProblem, extractPhoneDigits } from "./delivery-helpers";

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

  // Delivery vs Pickup selection
  const deliveryOffered = Boolean(asset.delivery_available);
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string>("");

  const addressesQuery = useAddresses();
  const profileQuery = useCustomerProfile(authStatus === "signedIn");

  const addresses = addressesQuery.data ?? [];
  const effectiveAddressId = preferredAddressId(addresses, selectedAddressId);
  const selectedAddress = addresses.find((a) => a.id === effectiveAddressId) ?? null;

  useEffect(() => {
    if (profileQuery.data?.phone_number && !contactPhone) {
      setContactPhone(extractPhoneDigits(profileQuery.data.phone_number));
    }
  }, [profileQuery.data?.phone_number, contactPhone]);

  // Check if current user already has an active or pending booking for this asset
  const myRentalsQuery = useQuery({
    queryKey: ["my-rentals-all"],
    queryFn: fetchMyRentals,
    enabled: authStatus === "signedIn",
    staleTime: 10_000,
  });

  const rawRentals = myRentalsQuery.data;
  const myRentalsList = Array.isArray(rawRentals)
    ? rawRentals
    : Array.isArray((rawRentals as unknown as { results?: RentalBooking[] })?.results)
      ? (rawRentals as unknown as { results: RentalBooking[] }).results
      : [];

  const existingBooking = myRentalsList.find(
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
  }, [asset.reserved_ranges, minStart, startDate, endDate]);

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
    mutationFn: () => {
      const deliveryAddress =
        mode === "DELIVERY" && selectedAddress
          ? deliveryAddressFrom(selectedAddress, contactPhone)
          : undefined;

      return bookRental({
        asset_id: asset.id,
        start_date: startDate,
        end_date: endDate,
        pickup_or_delivery_mode: mode,
        ...(deliveryAddress ? { delivery_address: deliveryAddress } : {}),
        notes,
        quantity: clampedQty,
      });
    },
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
        router.push("/activity?type=rentals" as never);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Booking created. Please check My Rentals.");
        router.push("/activity?type=rentals" as never);
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

      setError(
        (err as Error)?.message || "Failed to create rental reservation. Please check your connection.",
      );
    },
  });

  const overlap = checkDateOverlap(startDate, endDate, asset.reserved_ranges);
  const dateAwareUnavailable = Boolean(overlap) && !permanentlyOutOfStock;
  const blockBooking = permanentlyOutOfStock || dateAwareUnavailable;

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    if (endDate <= nextStart) {
      setEndDate(addDaysIso(nextStart, 1));
    }
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
    if (mode === "DELIVERY") {
      const problem = deliveryProblem(selectedAddress, contactPhone);
      if (problem) {
        setError(problem);
        return;
      }
    }
    if (authStatus !== "signedIn") {
      setLoginOpen(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <View className="gap-4 rounded-2xl border border-line bg-surface p-5 shadow-xs">
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
            Reserved: {formatDmy(existingBooking.start_date)} – {formatDmy(existingBooking.end_date)}.
            {existingBooking.status === "PENDING_PAYMENT"
              ? " Open My Rentals to complete checkout."
              : " View details in My Rentals."}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/activity?type=rentals" as never)}
            className="self-start rounded-lg bg-navy-900 px-3 py-1.5 active:bg-navy-800"
          >
            <Text className="text-xs font-bold text-white">Go to My Rentals</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Date conflict banner */}
      {overlap ? (
        <View className="flex-row items-center gap-2 rounded-xl border border-warning-line bg-warning-surface p-3">
          <AlertCircle size={16} color={COLOR_TOKENS.warning} />
          <Text className="flex-1 text-xs font-semibold text-warning-text">
            Already reserved {formatDmy(overlap.start_date)} to {formatDmy(overlap.end_date)}.
          </Text>
        </View>
      ) : null}

      {/* Out of stock banner */}
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

      {/* Date selectors */}
      <View className="gap-2.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Rental Duration
          </Text>
          <View className="rounded-full bg-navy-900/10 px-2.5 py-0.5">
            <Text className="text-xs font-bold text-navy-900">
              {days} day{days === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select pickup date"
            onPress={() => setPickupPickerOpen(true)}
            disabled={permanentlyOutOfStock}
            className="flex-1 rounded-xl border border-line bg-surface-muted/60 p-3 active:bg-surface-hover"
          >
            <Text className="text-[10px] uppercase tracking-wider text-text-muted">Pickup Date</Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              <Calendar size={14} color={COLOR_TOKENS.action} />
              <Text className="text-xs font-bold text-navy-900">{formatDmy(startDate)}</Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Select return date"
            onPress={() => setReturnPickerOpen(true)}
            disabled={permanentlyOutOfStock}
            className="flex-1 rounded-xl border border-line bg-surface-muted/60 p-3 active:bg-surface-hover"
          >
            <Text className="text-[10px] uppercase tracking-wider text-text-muted">Return Date</Text>
            <View className="mt-1 flex-row items-center gap-1.5">
              <Calendar size={14} color={COLOR_TOKENS.action} />
              <Text className="text-xs font-bold text-navy-900">{formatDmy(endDate)}</Text>
            </View>
          </Pressable>
        </View>

        {/* Stepper buttons for dates */}
        <View className="flex-row items-center justify-between pt-0.5">
          <View className="flex-row items-center gap-1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous pickup day"
              onPress={() => {
                const prev = addDaysIso(startDate, -1);
                if (prev >= minStart) handleStartDateChange(prev);
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
                    ? "border-navy-900 bg-navy-900/10"
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

      {/* Date Picker Modals */}
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

      {/* Handover Mode Selector (Self Pickup vs Doorstep Delivery) */}
      {deliveryOffered ? (
        <View className="gap-2.5 rounded-2xl border border-line bg-surface-muted/60 p-3.5">
          <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Handover Method
          </Text>
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose self pickup"
              onPress={() => {
                setMode("PICKUP");
                setError(null);
              }}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 ${
                mode === "PICKUP"
                  ? "border-primary bg-primary/10"
                  : "border-line bg-surface active:bg-canvas"
              }`}
            >
              <Store size={16} color={mode === "PICKUP" ? "#EA580C" : "#64748B"} />
              <Text
                className={`text-xs font-bold ${
                  mode === "PICKUP" ? "text-primary" : "text-text-secondary"
                }`}
              >
                Self Pickup
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose doorstep delivery"
              onPress={() => {
                setMode("DELIVERY");
                setError(null);
              }}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl border p-3 ${
                mode === "DELIVERY"
                  ? "border-primary bg-primary/10"
                  : "border-line bg-surface active:bg-canvas"
              }`}
            >
              <Truck size={16} color={mode === "DELIVERY" ? "#EA580C" : "#64748B"} />
              <Text
                className={`text-xs font-bold ${
                  mode === "DELIVERY" ? "text-primary" : "text-text-secondary"
                }`}
              >
                Doorstep Delivery
              </Text>
            </Pressable>
          </View>

          {mode === "DELIVERY" ? (
            <View className="mt-2 gap-3 border-t border-line/50 pt-3">
              <Text className="text-xs font-semibold text-navy-900">Select Delivery Address</Text>

              {addresses.length === 0 ? (
                <View className="rounded-xl border border-line bg-surface p-3">
                  <Text className="text-xs text-text-secondary">
                    No saved addresses found. Please save an address in your profile before choosing delivery.
                  </Text>
                </View>
              ) : (
                <View className="gap-2">
                  {addresses.map((address) => {
                    const isSelected = address.id === effectiveAddressId;
                    return (
                      <Pressable
                        key={address.id}
                        accessibilityRole="button"
                        onPress={() => {
                          setSelectedAddressId(address.id);
                          setError(null);
                        }}
                        className={`flex-row items-start gap-2.5 rounded-xl border p-3 ${
                          isSelected
                            ? "border-primary bg-primary/5"
                            : "border-line bg-surface active:bg-surface-hover"
                        }`}
                      >
                        <View className="mt-0.5">
                          {isSelected ? (
                            <CheckCircle2 size={16} color="#EA580C" />
                          ) : (
                            <View className="size-4 rounded-full border border-line-strong" />
                          )}
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text className="text-xs font-bold text-navy-900">
                            {address.label || "Address"}
                            {address.is_default ? " (Default)" : ""}
                          </Text>
                          <Text className="mt-0.5 text-[11px] text-text-secondary leading-snug">
                            {[address.line1, address.line2, address.locality, address.city, address.postal_code]
                              .filter(Boolean)
                              .join(", ")}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View className="gap-1">
                <Text className="text-xs font-semibold text-navy-900">
                  Contact Phone for Delivery
                </Text>
                <TextInput
                  placeholder="10-digit mobile number"
                  placeholderTextColor={COLOR_TOKENS.placeholderText}
                  value={contactPhone}
                  onChangeText={setContactPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
                />
              </View>
            </View>
          ) : (
            <View className="rounded-xl border border-line bg-surface p-3">
              <Text className="text-[11px] text-text-secondary">
                Collect and return at the partner location. Full address and contact info released upon booking.
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View className="flex-row items-center gap-3 rounded-xl border border-line bg-surface-muted p-3.5">
          <Store size={18} color={COLOR_TOKENS.action} />
          <View className="flex-1">
            <Text className="text-xs font-bold text-navy-900">Self pickup</Text>
            <Text className="text-[11px] text-text-secondary leading-snug">
              Collect and return at the partner location. Doorstep delivery is not offered.
            </Text>
          </View>
        </View>
      )}

      {/* Quantity Stepper if applicable */}
      {maxQty > 1 ? (
        <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface-muted p-3">
          <View className="flex-1 mr-2 min-w-0">
            <Text className="text-xs font-bold text-navy-900">Quantity</Text>
            <Text className="text-[10px] text-text-muted">Up to {maxQty} units available</Text>
          </View>
          <QuantityStepper
            hideLabel
            size="sm"
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

      {/* Pricing breakdown */}
      <View className="gap-2 rounded-xl border border-line bg-canvas p-4">
        <View className="flex-row justify-between">
          <Text className="text-xs text-text-secondary">
            Rental ({days}d × {formatPaise(asset.daily_rate_paise)}
            {clampedQty > 1 ? ` × ${clampedQty}` : ""})
          </Text>
          <Text className="text-xs font-bold text-navy-900 tabular-nums">
            {formatPaise(rentalChargePaise)}
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
            {formatPaise(totalDuePaise)}
          </Text>
        </View>

        <Text className="mt-1 text-[10px] text-text-muted">
          The security deposit is 100% refundable upon return after condition check.
        </Text>
      </View>

      {/* Submit Button */}
      <Button
        variant="primary"
        disabled={mutation.isPending || isProcessing || blockBooking}
        onPress={handleConfirm}
        className={`w-full py-3 flex-row items-center justify-center gap-2 ${
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
