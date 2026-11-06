import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { RentalPhotos } from "./rental-photos";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useAuthStore, useCompleteOrOpenCheckout } from "@vsolve/mobile-core";
import { Text, TouchDatePicker } from "@vsolve/mobile-ui";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  MapPin,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react-native";

import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import {
  calculateRentalDays,
  formatPaise,
  type RentalAsset,
  type RentalBooking,
} from "../model";
import { addDaysIso, todayIso } from "../pickup-time";
import { bookRental, fetchMyRentals, fetchRentalPlatformFee } from "../queries";

function formatDmy(iso: string): string {
  if (!iso || !iso.includes("-")) return iso;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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

export function DesktopRentalDetail({ asset }: { asset: RentalAsset }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const authStatus = useAuthStore((state) => state.status);
  const isAuthenticated = authStatus === "signedIn";

  const minStart = todayIso();
  const defaultStart = addDaysIso(todayIso(), 1);
  const defaultEnd = addDaysIso(todayIso(), 3);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
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

  // The listing's own partner and place, or nothing: a stand-in pickup place would send the
  // customer to the wrong address.
  const partnerName: string | null =
    asset.partner_name ||
    asset.partner?.company_name ||
    asset.partner?.full_name ||
    null;

  const locationText: string | null = asset.location_text || null;
  const pickupAddress = asset.pickup_address;
  const pickupLine = [pickupAddress?.line, locationText].filter(Boolean).join(", ");

  // Active bookings query to detect existing reservation
  const myRentalsQuery = useQuery({
    queryKey: ["my-rentals-all"],
    queryFn: fetchMyRentals,
    enabled: isAuthenticated,
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

  const feeQuery = useQuery({
    queryKey: ["rental-platform-fee"],
    queryFn: fetchRentalPlatformFee,
    staleTime: 300_000,
  });

  const feePercent = feeQuery.data?.percent ?? 0;
  const days = calculateRentalDays(startDate, endDate);
  const maxQty = Math.max(1, asset.quantity_available ?? 1);
  const clampedQty = Math.min(Math.max(1, quantity), maxQty);

  const rentalChargePaise = asset.daily_rate_paise * days * clampedQty;
  const platformFeePaise = Math.round((rentalChargePaise * feePercent) / 100);
  const depositPaise = asset.deposit_paise * clampedQty;
  const totalDuePaise = rentalChargePaise + platformFeePaise + depositPaise;

  const permanentlyOutOfStock = asset.quantity_available === 0;
  const overlap = checkDateOverlap(startDate, endDate, asset.reserved_ranges);
  const blockBooking = permanentlyOutOfStock || Boolean(overlap);

  const completeOrOpenCheckout = useCompleteOrOpenCheckout();
  const mutation = useMutation({
    mutationFn: () =>
      bookRental({
        asset_id: asset.id,
        start_date: startDate,
        end_date: endDate,
        quantity: clampedQty,
        pickup_or_delivery_mode: mode,
        notes: notes.trim(),
      }),
    onSuccess: async (booking) => {
      await queryClient.invalidateQueries({ queryKey: ["my-rentals"] });
      await queryClient.invalidateQueries({ queryKey: ["rental-asset", asset.slug || asset.id] });

      const deposit = booking.deposit as
        | (typeof booking.deposit & { payment_attempt_id?: string | null })
        | undefined;
      const attemptId = deposit?.payment_attempt_id;

      if (attemptId) {
        setIsProcessing(true);
        try {
          await completeOrOpenCheckout(String(attemptId));
          router.push("/activity?type=rentals");
        } catch {
          router.push("/activity?type=rentals");
        } finally {
          setIsProcessing(false);
        }
      } else {
        router.push("/activity?type=rentals");
      }
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to confirm rental reservation. Please check your dates.";
      setError(msg);
    },
  });

  const handleConfirm = () => {
    if (blockBooking) return;
    setError(null);
    if (!startDate || !endDate) {
      setError("Please select both pickup and return dates.");
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
        )}. Please select different dates.`,
      );
      return;
    }
    if (!isAuthenticated) {
      setLoginOpen(true);
      return;
    }
    mutation.mutate();
  };

  const openMapsUrl = () => {
    const url =
      pickupAddress?.maps_url ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        locationText || partnerName || asset.title,
      )}`;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      void Linking.openURL(url);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="min-h-screen justify-between"
      showsVerticalScrollIndicator
    >
      <View className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Breadcrumb Navigation */}
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Back to Equipment Rentals"
            onPress={() => router.push("/rentals")}
            className="flex-row items-center gap-1.5 -ml-1 px-1 py-1 cursor-pointer group"
          >
            <ArrowLeft size={15} color="#6B6560" />
            <Text className="text-sm font-bold text-[#6B6560] group-hover:text-navy-950">
              Back to Equipment Rentals
            </Text>
          </Pressable>
        </View>

        {/* 2-Column Responsive Layout matching Screenshot 100% */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 32,
            width: "100%",
          }}
          className="w-full flex-row items-start"
        >
          {/* ========================================================= */}
          {/* LEFT COLUMN: Equipment Details & Trust Protocol */}
          {/* ========================================================= */}
          <View style={{ flex: 7, minWidth: 0 }} className="flex-col gap-6">
            {/* Card 1: Equipment Details Card */}
            <View className="rounded-2xl border border-[#E5E1DC] bg-white p-6 shadow-xs flex-col gap-5">
              <RentalPhotos media={asset.media ?? []} title={asset.title} />

              {/* Top Badges matching Screenshot */}
              <View className="flex-row items-center gap-2">
                <View className="flex-row items-center gap-1.5 rounded-full bg-[#EEF2FB] border border-[#BFDBFE] px-3 py-1">
                  <Wrench size={12} color="#1E3A8A" />
                  <Text className="text-xs font-bold text-[#1E3A8A]">Verified Tool</Text>
                </View>

                <View className="flex-row items-center gap-1.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] px-3 py-1">
                  <ShieldCheck size={13} color="#059669" />
                  <Text className="text-xs font-bold text-[#065F46]">Deposit Protected</Text>
                </View>
              </View>

              {/* Title */}
              <View className="gap-1">
                <Text className="text-2xl sm:text-3xl font-extrabold tracking-tight text-navy-950">
                  {asset.title}
                </Text>
                {partnerName ? (
                  <Text className="text-xs text-slate-500 font-medium">
                    Offered by <Text className="font-bold text-navy-950">{partnerName}</Text>
                  </Text>
                ) : null}
              </View>

              {/* Self Pickup Location info */}
              {locationText ? (
                <View className="flex-row items-center gap-1.5 -mt-1">
                  <MapPin size={14} color="#EA580C" />
                  <Text className="text-xs text-slate-600">
                    Self pickup from <Text className="font-medium text-navy-950">{locationText}</Text>
                    {deliveryOffered ? " · Delivery available on request" : ""}
                  </Text>
                </View>
              ) : null}

              {/* About This Equipment */}
              <View className="border-t border-[#E5E1DC]/80 pt-5 gap-2">
                <Text className="text-sm font-bold text-navy-950">About This Equipment</Text>
                <Text className="text-sm leading-relaxed text-slate-600">
                  {asset.description ||
                    "High lumen outdoor waterproof IP65 LED floodlights with heavy adjustable tripod stands. 200W per light unit with 6500K daylight beam."}
                </Text>
              </View>

              {/* 3-Column Sunken Stats Box matching Screenshot 100% */}
              <View className="rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-4 flex-row items-start justify-between">
                {/* 1. Daily Rate */}
                <View className="flex-1 pr-2">
                  <Text className="text-xs font-medium text-slate-500">Daily Rental Rate</Text>
                  <View className="flex-row items-baseline gap-1 mt-1">
                    <Text className="text-xl font-extrabold text-navy-950 tabular-nums">
                      {formatPaise(asset.daily_rate_paise)}
                    </Text>
                    <Text className="text-xs font-medium text-slate-500">/ day</Text>
                  </View>
                </View>

                {/* 2. Security Deposit */}
                <View className="flex-1 px-2 border-l border-slate-200/60">
                  <Text className="text-xs font-medium text-slate-500">Security Deposit</Text>
                  <Text className="text-xl font-extrabold text-navy-950 tabular-nums mt-1">
                    {formatPaise(asset.deposit_paise)}
                  </Text>
                  <Text className="text-[10px] font-semibold text-emerald-700 mt-0.5">
                    100% Refundable
                  </Text>
                </View>

                {/* 3. Quantity Available */}
                <View className="flex-1 pl-2 border-l border-slate-200/60">
                  <Text className="text-xs font-medium text-slate-500">Quantity available</Text>
                  <Text className="text-xl font-extrabold text-navy-950 tabular-nums mt-1">
                    {asset.quantity_available ?? 1}
                  </Text>
                  <Text className="text-[10px] font-semibold text-slate-500 mt-0.5">
                    Identical units for rent
                  </Text>
                </View>
              </View>
            </View>

            {/* Card 2: V Solve Hub Rental Guarantee matching Screenshot */}
            <View className="rounded-2xl border border-[#E5E1DC] bg-white p-6 shadow-xs flex-col gap-4">
              <View className="flex-row items-center gap-2">
                <ShieldCheck size={18} color="#059669" />
                <Text className="text-sm font-bold text-navy-950">
                  V Solve Hub Rental Guarantee
                </Text>
              </View>

              <View className="gap-3 pt-0.5">
                <View className="flex-row items-start gap-2.5">
                  <CheckCircle2 size={15} color="#059669" style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-xs text-slate-600 leading-relaxed">
                    <Text className="font-bold text-navy-950">Identity & Equipment Verification:</Text>{" "}
                    Both customer and partner identities are verified before handover.
                  </Text>
                </View>

                <View className="flex-row items-start gap-2.5">
                  <CheckCircle2 size={15} color="#059669" style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-xs text-slate-600 leading-relaxed">
                    <Text className="font-bold text-navy-950">Full Security Deposit Release:</Text>{" "}
                    When you return the tool in good condition, your security deposit is released
                    back immediately.
                  </Text>
                </View>

                <View className="flex-row items-start gap-2.5">
                  <CheckCircle2 size={15} color="#059669" style={{ marginTop: 2 }} />
                  <Text className="flex-1 text-xs text-slate-600 leading-relaxed">
                    <Text className="font-bold text-navy-950">Condition Checked:</Text> Inspect tool
                    operation with the partner before signing off handover.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: STICKY "Book This Rental" CARD */}
          {/* ========================================================= */}
          <View
            style={{
              flex: 5,
              minWidth: 0,
              position: Platform.OS === "web" ? ("sticky" as any) : "relative",
              top: 24,
              alignSelf: "flex-start",
              zIndex: 10,
            }}
            className="sticky top-6 self-start"
          >
            <View className="rounded-2xl border border-[#E5E1DC] bg-white p-6 shadow-xs flex-col gap-4">
              {/* Header */}
              <View>
                <Text className="text-xl font-bold text-navy-950">Book This Rental</Text>
                <Text className="text-xs text-slate-500 mt-1">
                  Select your rental dates (DD/MM/YYYY). Zero hidden charges.
                </Text>
              </View>

              {/* Active booking banner */}
              {existingBooking ? (
                <View className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 gap-2">
                  <View className="flex-row items-center gap-2">
                    <AlertCircle size={15} color="#D97706" />
                    <Text className="text-xs font-bold text-amber-900">
                      Active booking on this tool
                    </Text>
                  </View>
                  <Text className="text-xs text-amber-800 leading-relaxed">
                    Reserved: {formatDmy(existingBooking.start_date)} –{" "}
                    {formatDmy(existingBooking.end_date)}. Track your pickup PIN and status in My
                    Rentals.
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push("/activity?type=rentals")}
                    className="self-start rounded-lg bg-navy-900 px-3 py-1.5 cursor-pointer mt-1"
                  >
                    <Text className="text-xs font-bold text-white">Go to My Rentals</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Date conflict banner */}
              {overlap ? (
                <View className="flex-row items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle size={15} color="#D97706" />
                  <Text className="text-xs font-semibold text-amber-900 flex-1">
                    Already reserved {formatDmy(overlap.start_date)} to {formatDmy(overlap.end_date)}.
                  </Text>
                </View>
              ) : null}

              {/* Out of stock banner */}
              {permanentlyOutOfStock ? (
                <View className="flex-row items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                  <AlertCircle size={15} color="#DC2626" />
                  <Text className="text-xs font-bold text-red-700 flex-1">Out of stock</Text>
                </View>
              ) : null}

              {/* Dates Stacked Vertically matching Screenshot 100% */}
              <View className="gap-4">
                {/* Pickup Date */}
                <View className="gap-1.5">
                  <View className="flex-row items-center gap-1.5">
                    <Calendar size={14} color="#6B7280" />
                    <Text className="text-xs font-bold text-navy-950">Pickup Date</Text>
                  </View>
                  <Pressable
                    onPress={() => setPickupPickerOpen(true)}
                    className="flex-row items-center justify-between rounded-xl border border-[#D1D5DB] bg-white px-4 py-3 active:bg-slate-50"
                  >
                    <Text className="text-base font-semibold text-navy-950">
                      {formatDmy(startDate)}
                    </Text>
                    <Calendar size={18} color="#6B7280" />
                  </Pressable>
                </View>

                {/* Return Date */}
                <View className="gap-1.5">
                  <View className="flex-row items-center gap-1.5">
                    <Calendar size={14} color="#6B7280" />
                    <Text className="text-xs font-bold text-navy-950">Return Date</Text>
                  </View>
                  <Pressable
                    onPress={() => setReturnPickerOpen(true)}
                    className="flex-row items-center justify-between rounded-xl border border-[#D1D5DB] bg-white px-4 py-3 active:bg-slate-50"
                  >
                    <Text className="text-base font-semibold text-navy-950">
                      {formatDmy(endDate)}
                    </Text>
                    <Calendar size={18} color="#6B7280" />
                  </Pressable>
                </View>
              </View>

              {/* How do you want to receive it? */}
              <View className="gap-2">
                <Text className="text-xs font-bold text-navy-950">
                  How do you want to receive it?
                </Text>
                {deliveryOffered ? (
                  <View className="flex-row gap-2">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setMode("PICKUP");
                        setError(null);
                      }}
                      className={`flex-1 items-center justify-center rounded-xl py-3 border cursor-pointer transition ${mode === "PICKUP"
                          ? "border-[#BFDBFE] bg-[#EFF6FF]"
                          : "border-[#E5E1DC] bg-[#FAF8F5] hover:border-slate-400"
                        }`}
                    >
                      <Text
                        className={`text-sm font-bold ${mode === "PICKUP" ? "text-navy-950" : "text-slate-600"
                          }`}
                      >
                        Self Pickup
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        setMode("DELIVERY");
                        setError(null);
                      }}
                      className={`flex-1 items-center justify-center rounded-xl py-3 border cursor-pointer transition ${mode === "DELIVERY"
                          ? "border-[#BFDBFE] bg-[#EFF6FF]"
                          : "border-[#E5E1DC] bg-[#FAF8F5] hover:border-slate-400"
                        }`}
                    >
                      <Text
                        className={`text-sm font-bold ${mode === "DELIVERY" ? "text-navy-950" : "text-slate-600"
                          }`}
                      >
                        Request Delivery
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="w-full items-center justify-center rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] py-3.5">
                    <Text className="text-sm font-bold text-navy-950">Self Pickup</Text>
                  </View>
                )}
                {!deliveryOffered && (
                  <Text className="text-xs text-slate-500">
                    This owner offers self pickup only.
                  </Text>
                )}
              </View>

              {/* Pickup Location & Hours box matching Screenshot */}
              <View className="rounded-2xl border border-[#EFEBE4] bg-[#FAF8F5] p-4 gap-3">
                <View className="gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <MapPin size={14} color="#EA580C" />
                    <Text className="text-xs font-bold text-navy-950">Pickup Location</Text>
                  </View>
                  {partnerName ? (
                    <Text className="text-xs font-bold text-navy-950 mt-1">{partnerName}</Text>
                  ) : null}
                  {pickupLine ? (
                    <Text className="text-xs text-slate-600 mt-0.5">{pickupLine}</Text>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    onPress={openMapsUrl}
                    className="flex-row items-center gap-1.5 self-start rounded-xl border border-[#FED7AA] bg-white px-3.5 py-1.5 mt-2.5 cursor-pointer hover:bg-orange-50 shadow-xs"
                  >
                    <MapPin size={12} color="#EA580C" />
                    <Text className="text-xs font-bold text-[#EA580C]">View Location</Text>
                  </Pressable>
                </View>

                {/* Pickup Hours */}
                <View className="border-t border-[#EFEBE4] pt-2.5 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Clock size={14} color="#EA580C" />
                    <Text className="text-xs font-bold text-navy-950">Pickup hours</Text>
                  </View>
                  <Text className="text-xs text-slate-500 mt-0.5">
                    The owner hasn&apos;t set pickup hours yet.
                  </Text>
                </View>
              </View>

              {/* Notes / Special Instructions (Optional) */}
              <View className="gap-1.5">
                <Text className="text-xs font-bold text-navy-950">
                  Notes / Special Instructions (Optional)
                </Text>
                <TextInput
                  multiline
                  numberOfLines={2}
                  maxLength={1000}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="e.g. Need masonry drill bits, planning concrete anchor installation"
                  placeholderTextColor="#94A3B8"
                  className="min-h-16 rounded-xl border border-[#EFEBE4] bg-[#FAF8F5] p-3.5 text-xs text-navy-900"
                  style={{ textAlignVertical: "top" }}
                />
              </View>

              {/* Live Price Breakdown Box matching Screenshot 100% */}
              <View className="rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-4 gap-2.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-slate-600">
                    Rental Duration ({days} days × {formatPaise(asset.daily_rate_paise)})
                  </Text>
                  <Text className="text-xs font-semibold text-navy-950 tabular-nums">
                    {formatPaise(rentalChargePaise)}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1">
                    <Text className="text-xs text-slate-600">Refundable Security Deposit</Text>
                    <ShieldCheck size={12} color="#059669" />
                  </View>
                  <Text className="text-xs font-semibold text-navy-950 tabular-nums">
                    {formatPaise(depositPaise)}
                  </Text>
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-slate-600">Transport</Text>
                  <Text className="text-xs font-semibold text-navy-950">
                    {mode === "DELIVERY" ? "Quoted by owner" : "Free (self pickup)"}
                  </Text>
                </View>

                <View className="border-t border-[#E5E1DC] pt-2 flex-row items-baseline justify-between">
                  <Text className="text-sm font-bold text-navy-950">Total Value</Text>
                  <Text className="text-lg font-black text-[#EA580C] tabular-nums">
                    {formatPaise(totalDuePaise)}
                  </Text>
                </View>

                <View className="flex-row items-start gap-1.5 pt-0.5">
                  <Info size={13} color="#94A3B8" style={{ marginTop: 1.5 }} />
                  <Text className="flex-1 text-[11px] leading-relaxed text-slate-500">
                    The security deposit is 100% refundable immediately upon equipment return and
                    standard condition inspection.
                  </Text>
                </View>
              </View>

              {/* Error notification */}
              {error ? (
                <View className="rounded-xl border border-red-200 bg-red-50 p-3 flex-row items-center gap-2">
                  <AlertCircle size={14} color="#DC2626" />
                  <Text className="text-xs font-semibold text-red-700 flex-1">{error}</Text>
                </View>
              ) : null}

              {/* Large Orange CTA Submit Button */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm Rental Booking"
                disabled={mutation.isPending || isProcessing || blockBooking}
                onPress={handleConfirm}
                className="w-full items-center justify-center rounded-xl bg-[#EA580C] hover:bg-[#D94E08] py-3.5 active:bg-[#C2410C] cursor-pointer shadow-sm transition disabled:opacity-50"
              >
                {mutation.isPending || isProcessing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-sm font-bold text-white">
                    {permanentlyOutOfStock
                      ? "Out of stock"
                      : overlap
                        ? "Unavailable for these dates"
                        : "Confirm Rental Booking"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Customer Login Sheet modal if not authenticated */}
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          setLoginOpen(false);
          handleConfirm();
        }}
      />

      {/* Date Pickers for Touch / Mobile Screens */}
      <TouchDatePicker
        open={pickupPickerOpen}
        onOpenChange={setPickupPickerOpen}
        value={startDate}
        onChange={(val) => {
          setStartDate(val);
          if (endDate <= val) {
            setEndDate(addDaysIso(val, 2));
          }
          setError(null);
        }}
        minDate={minStart}
        title="Select Pickup Date"
      />

      <TouchDatePicker
        open={returnPickerOpen}
        onOpenChange={setReturnPickerOpen}
        value={endDate}
        onChange={(val) => {
          setEndDate(val);
          setError(null);
        }}
        minDate={startDate || minStart}
        title="Select Return Date"
      />

      {/* Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}

