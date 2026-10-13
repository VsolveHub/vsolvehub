import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Info,
  Phone,
  Users,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import {
  formatPaise,
  formatRate,
  pricePeriodOf,
  stayLengthLabel,
  type StayProperty,
  type StayUnit,
} from "../model";
import { addDaysIso, formatReadableDate, todayIso } from "../pickup-time";
import { createStayEnquiry, fetchStayQuote } from "../queries";

/** Server limits, in the property's unit: 24 months or 90 nights. */
const LENGTH_CHOICES = { MONTH: 24, NIGHT: 90 } as const;

export function StayEnquirySheet({
  property,
  unitId: initialUnitId,
  open,
  onOpenChange,
}: {
  property: StayProperty;
  unitId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const period = pricePeriodOf(property.price_period);
  const monthly = period === "MONTH";
  const minimum = Math.max(property.min_stay_nights ?? 1, 1);
  const minimumLabel = stayLengthLabel(minimum, period);
  const maxLength = LENGTH_CHOICES[period];

  const units = (property.units || []) as StayUnit[];
  const [selectedUnitId, setSelectedUnitId] = useState<string>(
    initialUnitId || units[0]?.id || "",
  );

  const [checkIn, setCheckIn] = useState(() => addDaysIso(todayIso(), 7));
  const [length, setLength] = useState(minimum);
  const [lengthText, setLengthText] = useState(String(minimum));
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const selectedUnit =
    units.find((u) => u.id === selectedUnitId) || units[0];

  // Room capacity gates the total headcount
  const maxGuests = Math.max(selectedUnit?.max_guests ?? 1, 1);
  const adults = Math.min(Math.max(adultCount, 1), Math.max(maxGuests - childCount, 1));
  const children = Math.min(childCount, Math.max(maxGuests - adults, 0));
  const totalGuests = adults + children;

  // Live quote query
  const quoteQuery = useQuery({
    queryKey: ["stay-quote", property.id, selectedUnitId, checkIn, length],
    queryFn: () =>
      fetchStayQuote({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        length,
      }),
    enabled: Boolean(open && property.id && checkIn && selectedUnitId),
    retry: false,
  });

  const rate =
    quoteQuery.data?.nightly_rate_paise ??
    selectedUnit?.nightly_rate_paise ??
    0;
  const estimate =
    quoteQuery.data?.total_quote_paise ?? rate * length;

  const quoteProblem = quoteQuery.error
    ? (quoteQuery.error as any)?.message || "Selected dates are not available."
    : null;

  const mutation = useMutation({
    mutationFn: () =>
      createStayEnquiry({
        property_id: property.id,
        unit_id: selectedUnitId || null,
        check_in: checkIn,
        length,
        guest_count: totalGuests,
        adult_count: adults,
        child_count: children,
        message,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
      setIsSuccess(true);
    },
    onError: (err: any) => {
      setError(err?.message || "Failed to send enquiry.");
    },
  });

  const handleLengthCommit = (raw: string) => {
    const next = Number(raw);
    const clamped = Number.isInteger(next)
      ? Math.min(maxLength, Math.max(minimum, next))
      : minimum;
    setLength(clamped);
    setLengthText(String(clamped));
    setError(null);
  };

  const handleSubmit = () => {
    setError(null);
    if (!checkIn) {
      setError(monthly ? "Choose a move-in date." : "Choose a check-in date.");
      return;
    }
    if (quoteProblem) {
      setError(quoteProblem);
      return;
    }
    mutation.mutate();
  };

  const handleClose = () => {
    setIsSuccess(false);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else onOpenChange(true);
      }}
      title={isSuccess ? "Enquiry Sent" : "Send an enquiry"}
      description={
        isSuccess
          ? "The host has received your request"
          : "The host calls you to talk it through. Nothing is paid here."
      }
    >
      {isSuccess ? (
        <View className="gap-5 py-3">
          <View className="items-center rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 size={40} color="#059669" />
            <Text className="mt-3 text-base font-extrabold text-emerald-950">
              Enquiry Submitted Successfully
            </Text>
            <Text className="mt-1.5 text-center text-xs leading-relaxed text-emerald-900/90">
              Your details and preferred dates ({formatReadableDate(checkIn)} for{" "}
              {stayLengthLabel(length, period)}) have been shared with the host.
            </Text>

            <View className="mt-4 w-full rounded-xl bg-white/80 p-3 border border-emerald-200/60">
              <View className="flex-row items-center gap-2">
                <Phone size={14} color="#059669" />
                <Text className="text-xs font-bold text-emerald-950">
                  What happens next?
                </Text>
              </View>
              <Text className="mt-1 text-[11px] leading-relaxed text-emerald-900/80">
                The host will review your request and call your registered phone
                number. You can discuss rent negotiations, visit schedules, and
                deposit terms directly.
              </Text>
            </View>
          </View>

          <Button
            size="lg"
            variant="primary"
            onPress={() => {
              handleClose();
              router.push("/stays/mine" as never);
            }}
            className="w-full rounded-xl py-3.5"
          >
            View My Enquiries →
          </Button>
        </View>
      ) : (
        <ScrollView
          className="max-h-[80vh] gap-4 py-2"
          showsVerticalScrollIndicator={false}
        >
          {error || quoteProblem ? (
            <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-3">
              <AlertCircle size={16} color="#dc2626" />
              <Text className="flex-1 text-xs font-medium text-danger">
                {error ?? quoteProblem}
              </Text>
            </View>
          ) : null}

          {/* Room Selector (When property has > 1 unit) */}
          {units.length > 1 ? (
            <View className="gap-2">
              <Text className="text-xs font-bold text-navy-900">
                Choose Room Type
              </Text>
              <View className="gap-2">
                {units.map((unit) => {
                  const isSelected = selectedUnitId === unit.id;
                  return (
                    <Pressable
                      key={unit.id}
                      onPress={() => {
                        setSelectedUnitId(unit.id);
                        setError(null);
                      }}
                      className={`flex-row items-center justify-between rounded-xl border p-3 ${
                        isSelected
                          ? "border-brand bg-brand/10"
                          : "border-line bg-surface active:bg-surface-hover"
                      }`}
                    >
                      <View>
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? "text-brand" : "text-navy-900"
                          }`}
                        >
                          {unit.name}
                        </Text>
                        <Text className="text-[10px] text-text-secondary">
                          Fits up to {unit.max_guests ?? 1} guest(s)
                        </Text>
                      </View>
                      <Text className="text-xs font-extrabold text-navy-900">
                        {formatRate(unit.nightly_rate_paise, period)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Move-in / Check-in Date */}
          <View className="gap-2 rounded-2xl border border-line bg-surface p-3.5">
            <View className="flex-row items-center gap-1.5">
              <Calendar size={14} color="#6B6560" />
              <Text className="text-xs font-bold text-navy-900">
                {monthly ? "Move-in date" : "Check-in date"}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-extrabold text-navy-900">
                {formatReadableDate(checkIn)}
              </Text>
              <View className="flex-row gap-1.5">
                {[1, 3, 7, 14, 30].map((plusDays) => {
                  const iso = addDaysIso(todayIso(), plusDays);
                  const isSelected = checkIn === iso;
                  return (
                    <Pressable
                      key={plusDays}
                      onPress={() => {
                        setCheckIn(iso);
                        setError(null);
                      }}
                      className={`rounded-lg border px-2 py-1 ${
                        isSelected
                          ? "border-brand bg-brand/10"
                          : "border-line bg-surface active:bg-surface-hover"
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-bold ${
                          isSelected ? "text-brand" : "text-text-secondary"
                        }`}
                      >
                        +{plusDays}d
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Stay Length (Validated against minimum & maxLength) */}
          <View className="gap-2 rounded-2xl border border-line bg-surface p-3.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs font-bold text-navy-900">
                {monthly ? "For how many months" : "For how many nights"}
              </Text>
              <Text className="text-xs font-bold text-brand">
                {stayLengthLabel(length, period)}
              </Text>
            </View>

            <View className="flex-row items-center gap-3">
              <View className="flex-1 flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-2">
                <TextInput
                  value={lengthText}
                  onChangeText={(val) => {
                    setLengthText(val);
                    const n = parseInt(val, 10);
                    if (!isNaN(n) && n >= 1) {
                      setLength(Math.min(maxLength, Math.max(minimum, n)));
                      setError(null);
                    }
                  }}
                  onBlur={() => handleLengthCommit(lengthText)}
                  keyboardType="numeric"
                  className="flex-1 text-sm font-bold text-navy-900"
                />
                <Text className="text-xs font-medium text-text-muted">
                  {monthly ? "month(s)" : "night(s)"}
                </Text>
              </View>

              <View className="flex-row gap-1">
                {[minimum, minimum + 1, minimum + 2, monthly ? 6 : 7, monthly ? 12 : 14].map(
                  (step) => {
                    if (step > maxLength) return null;
                    const isSelected = length === step;
                    return (
                      <Pressable
                        key={step}
                        onPress={() => {
                          setLength(step);
                          setLengthText(String(step));
                          setError(null);
                        }}
                        className={`rounded-lg border px-2.5 py-1.5 ${
                          isSelected
                            ? "border-brand bg-brand/10"
                            : "border-line bg-surface"
                        }`}
                      >
                        <Text
                          className={`text-xs font-bold ${
                            isSelected ? "text-brand" : "text-text-secondary"
                          }`}
                        >
                          {step}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>

            {minimum > 1 ? (
              <Text className="text-[11px] text-text-secondary">
                Minimum required stay: {minimumLabel}
              </Text>
            ) : null}
          </View>

          {/* Adults + Children Steppers constrained by max capacity */}
          <View className="gap-2.5 rounded-2xl border border-line bg-surface p-3.5">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Users size={14} color="#6B6560" />
                <Text className="text-xs font-bold text-navy-900">Guests</Text>
              </View>
              <Text className="text-xs text-text-secondary">
                Fits up to {maxGuests} guest{maxGuests === 1 ? "" : "s"}
              </Text>
            </View>

            {/* Adults Stepper */}
            <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface-sunken px-3 py-2">
              <View>
                <Text className="text-xs font-bold text-navy-900">Adults</Text>
                <Text className="text-[10px] text-text-secondary">Age 13+</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable
                  disabled={adults <= 1}
                  onPress={() => setAdultCount((curr) => Math.max(1, curr - 1))}
                  className="size-7 items-center justify-center rounded-full border border-line bg-surface active:bg-surface-hover disabled:opacity-40"
                >
                  <Text className="text-sm font-bold text-navy-900">–</Text>
                </Pressable>
                <Text className="w-5 text-center text-xs font-extrabold text-navy-900">
                  {adults}
                </Text>
                <Pressable
                  disabled={adults + children >= maxGuests}
                  onPress={() =>
                    setAdultCount((curr) =>
                      Math.min(curr + 1, maxGuests - children),
                    )
                  }
                  className="size-7 items-center justify-center rounded-full border border-line bg-surface active:bg-surface-hover disabled:opacity-40"
                >
                  <Text className="text-sm font-bold text-navy-900">+</Text>
                </Pressable>
              </View>
            </View>

            {/* Children Stepper */}
            <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface-sunken px-3 py-2">
              <View>
                <Text className="text-xs font-bold text-navy-900">Children</Text>
                <Text className="text-[10px] text-text-secondary">Under 13</Text>
              </View>
              <View className="flex-row items-center gap-3">
                <Pressable
                  disabled={children <= 0}
                  onPress={() => setChildCount((curr) => Math.max(0, curr - 1))}
                  className="size-7 items-center justify-center rounded-full border border-line bg-surface active:bg-surface-hover disabled:opacity-40"
                >
                  <Text className="text-sm font-bold text-navy-900">–</Text>
                </Pressable>
                <Text className="w-5 text-center text-xs font-extrabold text-navy-900">
                  {children}
                </Text>
                <Pressable
                  disabled={adults + children >= maxGuests}
                  onPress={() =>
                    setChildCount((curr) =>
                      Math.min(curr + 1, maxGuests - adults),
                    )
                  }
                  className="size-7 items-center justify-center rounded-full border border-line bg-surface active:bg-surface-hover disabled:opacity-40"
                >
                  <Text className="text-sm font-bold text-navy-900">+</Text>
                </Pressable>
              </View>
            </View>

            <Text className="text-[10px] text-text-muted">
              {totalGuests} guest{totalGuests === 1 ? "" : "s"} total
              {maxGuests > 1 ? ` · room fits up to ${maxGuests}` : ""}
            </Text>
          </View>

          {/* Message to Host */}
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-navy-900">
              Message to Host (optional)
            </Text>
            <TextInput
              placeholder="e.g. Working professional, can move in this weekend..."
              placeholderTextColor="rgba(107,101,96,0.6)"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={2}
              className="rounded-xl border border-line bg-surface p-3 text-xs text-navy-900"
            />
          </View>

          {/* Live Estimate Breakdown */}
          <View className="gap-2 rounded-2xl border border-line bg-surface-sunken p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-text-secondary">
                {formatRate(rate, period)} × {stayLengthLabel(length, period)}
              </Text>
              <Text className="text-sm font-black text-navy-900">
                {quoteQuery.isLoading ? "…" : `about ${formatPaise(estimate)}`}
              </Text>
            </View>

            <View className="flex-row items-start gap-1.5 pt-1">
              <Phone size={12} color="#6B6560" className="mt-0.5" />
              <Text className="flex-1 text-[11px] leading-relaxed text-text-secondary">
                Your name and phone number are shared with the host so they can
                call you.
              </Text>
            </View>
            <View className="flex-row items-start gap-1.5">
              <Info size={12} color="#6B6560" className="mt-0.5" />
              <Text className="flex-1 text-[11px] leading-relaxed text-text-secondary">
                An estimate only — you agree the final price and payment with the host.
              </Text>
            </View>
          </View>

          {/* Submit Button */}
          <Button
            size="lg"
            variant="primary"
            disabled={mutation.isPending || quoteQuery.isLoading || Boolean(quoteProblem)}
            onPress={handleSubmit}
            className="mt-2 w-full rounded-xl py-3.5"
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              "Send Enquiry"
            )}
          </Button>
        </ScrollView>
      )}
    </Dialog>
  );
}
