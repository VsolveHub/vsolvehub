import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, QuantityStepper, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { AlertCircle, Calendar, ShieldCheck, Store } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";

import { calculateRentalDays, formatPaise, type RentalAsset } from "../model";
import { completeOrOpenRentalCheckout } from "../payment-handoff";
import { addDaysIso, formatReadableDate, todayIso } from "../pickup-time";
import { bookRental, fetchRentalPlatformFee } from "../queries";

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

  const minStart = todayIso();
  const defaultStart = addDaysIso(minStart, 1);
  const defaultEnd = addDaysIso(minStart, 3);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
        const deposit = (booking as any)?.deposit;
        const attemptId = deposit?.payment_attempt_id;

        if (attemptId) {
          const result = await completeOrOpenRentalCheckout(String(attemptId), {
            businessName: "Vsolve Hub",
          });
          if (result.mode === "simulated") {
            Alert.alert("Booking Confirmed", "Rental fee and deposit recorded via simulated payment.");
          } else if (result.mode === "pending") {
            Alert.alert("Pending Payment", "Booking created. Open My Rentals shortly to pay.");
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["my-rentals"] });
        onOpenChange(false);
        router.push("/rentals/mine" as never);
      } catch (err: any) {
        setError(err?.message || "Booking created. Please check My Rentals.");
        router.push("/rentals/mine" as never);
      } finally {
        setIsProcessing(false);
      }
    },
    onError: (err: any) => {
      const code = err?.code || err?.error?.code;
      if (code === "out_of_stock") {
        setError("Out of stock for these dates. Try different dates or another listing.");
        return;
      }
      if (code === "insufficient_quantity") {
        setError("Not enough quantity available for these dates. Try different dates.");
        return;
      }
      setError(err?.message || "Failed to confirm rental booking.");
    },
  });

  const handleConfirm = () => {
    setError(null);
    if (!startDate || !endDate) {
      setError("Please select both start and end rental dates.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("Rental return date must be after pickup date.");
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
        {error ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
            <AlertCircle size={16} color="#dc2626" />
            <Text className="flex-1 text-xs font-medium text-danger">{error}</Text>
          </View>
        ) : null}

        {/* Schedule dates */}
        <View className="gap-3 rounded-2xl border border-line bg-canvas p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Rental Duration ({days} day{days === 1 ? "" : "s"})
            </Text>
            <View className="rounded-full bg-brand/10 px-2.5 py-0.5">
              <Text className="text-xs font-bold text-brand">{days} days</Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[10px] text-text-muted">Pickup Date</Text>
              <Text className="text-sm font-extrabold text-navy-900">
                {formatReadableDate(startDate)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-[10px] text-text-muted">Return Date</Text>
              <Text className="text-sm font-extrabold text-navy-900">
                {formatReadableDate(endDate)}
              </Text>
            </View>
          </View>

          {/* Interactive Date Pickers / Steppers */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-1">
              <Text className="text-[11px] font-bold text-navy-900">Pickup Date (from)</Text>
              <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-2 py-1.5">
                <Pressable
                  onPress={() => {
                    const prev = addDaysIso(startDate, -1);
                    if (prev >= minStart) {
                      setStartDate(prev);
                      if (endDate <= prev) setEndDate(addDaysIso(prev, 1));
                    }
                  }}
                  disabled={startDate <= minStart}
                  className="rounded p-1 active:bg-canvas disabled:opacity-30"
                >
                  <Text className="text-xs font-bold text-navy-900">◀</Text>
                </Pressable>
                <Text className="text-xs font-semibold text-navy-900">{startDate}</Text>
                <Pressable
                  onPress={() => {
                    const next = addDaysIso(startDate, 1);
                    setStartDate(next);
                    if (endDate <= next) setEndDate(addDaysIso(next, 1));
                  }}
                  className="rounded p-1 active:bg-canvas"
                >
                  <Text className="text-xs font-bold text-navy-900">▶</Text>
                </Pressable>
              </View>
            </View>

            <View className="flex-1 gap-1">
              <Text className="text-[11px] font-bold text-navy-900">Return Date (until)</Text>
              <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-2 py-1.5">
                <Pressable
                  onPress={() => {
                    const prev = addDaysIso(endDate, -1);
                    if (prev > startDate) setEndDate(prev);
                  }}
                  disabled={endDate <= addDaysIso(startDate, 1)}
                  className="rounded p-1 active:bg-canvas disabled:opacity-30"
                >
                  <Text className="text-xs font-bold text-navy-900">◀</Text>
                </Pressable>
                <Text className="text-xs font-semibold text-navy-900">{endDate}</Text>
                <Pressable
                  onPress={() => {
                    setEndDate(addDaysIso(endDate, 1));
                  }}
                  className="rounded p-1 active:bg-canvas"
                >
                  <Text className="text-xs font-bold text-navy-900">▶</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Quick Duration Shortcuts */}
          <View className="mt-1 flex-row gap-2">
            {[1, 2, 3, 7, 14].map((numDays) => (
              <Pressable
                key={numDays}
                onPress={() => setEndDate(addDaysIso(startDate, numDays))}
                className={`flex-1 items-center rounded-lg border py-1.5 ${
                  days === numDays
                    ? "border-brand bg-brand/10"
                    : "border-line bg-surface active:bg-surface-hover"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    days === numDays ? "text-brand" : "text-text-secondary"
                  }`}
                >
                  {numDays}d
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Self pickup info banner */}
        <View className="flex-row items-center gap-2 rounded-xl border border-line bg-surface p-3">
          <Store size={18} color="#f87000" />
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
              onChange={setQuantity}
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
            placeholderTextColor="rgba(107,101,96,0.5)"
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
            <Text className="text-xs font-bold text-navy-900">{formatPaise(rentalFeePaise)}</Text>
          </View>

          {feePercent > 0 ? (
            <View className="flex-row justify-between">
              <Text className="text-xs text-text-secondary">Platform fee ({feePercent}%)</Text>
              <Text className="text-xs font-bold text-navy-900">
                {formatPaise(platformFeePaise)}
              </Text>
            </View>
          ) : null}

          <View className="flex-row justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-xs text-text-secondary">Refundable Deposit</Text>
              <ShieldCheck size={12} color="#16a34a" />
            </View>
            <Text className="text-xs font-bold text-navy-900">{formatPaise(depositPaise)}</Text>
          </View>

          <View className="border-t border-line/60 pt-2 flex-row justify-between items-center">
            <Text className="text-sm font-extrabold text-navy-900">Total Payable</Text>
            <Text className="text-base font-black text-brand">{formatPaise(totalPaise)}</Text>
          </View>

          <Text className="mt-1 text-[10px] text-text-muted">
            The security deposit is 100% refundable upon return after condition check.
          </Text>
        </View>

        {/* Submit Button */}
        <Button
          variant="primary"
          disabled={mutation.isPending || isProcessing}
          onPress={handleConfirm}
          className="mt-2 w-full py-3"
        >
          <Text className="font-bold text-white">
            {mutation.isPending || isProcessing
              ? "Confirming Rental Booking…"
              : "Confirm Rental Booking"}
          </Text>
        </Button>
      </ScrollView>
    </Dialog>
  );
}
