import { useMutation, useQuery } from "@tanstack/react-query";
import { COLOR_TOKENS, QuantityStepper, Text, TouchDatePicker } from "@vsolve/mobile-ui";
import { useAuthStore } from "@vsolve/mobile-core";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  ShieldCheck,
  X,
} from "lucide-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import {
  formatPaise,
  pricePeriodOf,
  type StayProperty,
  type StayPropertySummary,
} from "../model";
import {
  createStayEnquiry,
  fetchStayProperty,
  fetchStayQuote,
} from "../queries";
import { THEME_COLORS } from "../theme-colors";

export interface StayDetailDrawerProps {
  property: StayPropertySummary;
  onClose: () => void;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatToIndianDate(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

export function StayDetailDrawer({ property, onClose }: StayDetailDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const authStatus = useAuthStore((s) => s.status);

  const detailQuery = useQuery({
    queryKey: ["stay-property-drawer", property.slug || property.id],
    queryFn: () => fetchStayProperty(property.slug || property.id),
    staleTime: 30_000,
  });

  const detail: StayProperty | StayPropertySummary =
    detailQuery.data ?? property;
  const period = pricePeriodOf(detail.price_period);

  const rawMedia = (detail as { media?: { url?: string }[] }).media;
  const photos = (
    Array.isArray(rawMedia) && rawMedia.length > 0
      ? rawMedia.map((m) => resolveImageUrl(m.url)).filter(Boolean)
      : (detail.image_urls ?? []).map((u) => resolveImageUrl(u)).filter(Boolean)
  ) as string[];

  const [photoIdx, setPhotoIdx] = useState(0);
  const activePhotoIdx = photos.length > 0 ? Math.min(photoIdx, photos.length - 1) : 0;

  const units = detail.units ?? [];
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    units[0]?.id ?? null,
  );
  const effectiveUnitId =
    selectedUnitId && units.some((u) => u.id === selectedUnitId)
      ? selectedUnitId
      : units[0]?.id ?? null;

  const [checkIn, setCheckIn] = useState(todayIso);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [length, setLength] = useState(1);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const totalGuests = adults + children;
  const [message, setMessage] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [enquirySent, setEnquirySent] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hostName =
    detail.host_name ||
    detail.partner?.company_name ||
    detail.partner?.full_name ||
    null;

  const minRate =
    units.length > 0
      ? units.reduce(
          (min, u) => (u.nightly_rate_paise < min ? u.nightly_rate_paise : min),
          units[0]?.nightly_rate_paise ?? 0,
        )
      : detail.min_price_paise ?? 0;

  const quoteQuery = useQuery({
    queryKey: ["stay-drawer-quote", detail.id, checkIn, length, totalGuests, effectiveUnitId],
    queryFn: () =>
      fetchStayQuote({
        property_id: detail.id,
        check_in: checkIn,
        length,
        guest_count: totalGuests,
        unit_id: effectiveUnitId,
      }),
    enabled: Boolean(detail.id && checkIn && length > 0),
    staleTime: 15_000,
  });

  const enquiryMutation = useMutation({
    mutationFn: () =>
      createStayEnquiry({
        property_id: detail.id,
        check_in: checkIn,
        length,
        guest_count: totalGuests,
        adult_count: adults,
        child_count: children,
        unit_id: effectiveUnitId,
        message: message.trim() || undefined,
      }),
    onSuccess: () => {
      setErrorMsg(null);
      setEnquirySent(true);
    },
    onError: (err: unknown) => {
      const msg =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : "Could not send enquiry. Try checking full property details.";
      setErrorMsg(msg);
    },
  });

  const handleSendEnquiry = () => {
    setErrorMsg(null);
    if (authStatus !== "signedIn") {
      setLoginOpen(true);
      return;
    }
    enquiryMutation.mutate();
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }} className="bg-white">
      {/* Header */}
      <View className="flex-row items-start justify-between gap-3 border-b border-[#e7e2da] px-5 pb-3 pt-4">
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-1 mb-0.5">
            <ShieldCheck size={14} color="#047857" />
            <Text className="text-[11px] font-semibold text-emerald-700">
              Verified host
            </Text>
          </View>
          <Text className="text-base font-extrabold leading-snug tracking-tight text-navy-900">
            {detail.title}
          </Text>
          {hostName ? (
            <Text className="mt-0.5 text-[12px] text-text-secondary">
              Hosted by{" "}
              <Text className="font-semibold text-navy-900">{hostName}</Text>
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close property drawer"
          onPress={onClose}
          hitSlop={8}
          className="size-8 items-center justify-center rounded-full active:bg-[#FAF9F7]"
        >
          <X size={16} color="#64748B" strokeWidth={2.2} />
        </Pressable>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        contentContainerClassName="gap-4 px-5 py-4 pb-6"
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo Carousel */}
        {photos.length > 0 ? (
          <View className="gap-2">
            <View className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-[#e7e2da] bg-[#FAF9F7]">
              <Image
                source={{ uri: photos[activePhotoIdx] }}
                contentFit="cover"
                style={{ width: "100%", height: "100%" }}
              />
              {photos.length > 1 ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setPhotoIdx((prev) => (prev - 1 + photos.length) % photos.length)
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 size-7 items-center justify-center rounded-full bg-white/90 shadow-xs"
                  >
                    <ChevronLeft size={16} color="#0B1B3D" />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setPhotoIdx((prev) => (prev + 1) % photos.length)
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 size-7 items-center justify-center rounded-full bg-white/90 shadow-xs"
                  >
                    <ChevronRight size={16} color="#0B1B3D" />
                  </Pressable>
                  <View className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-white">
                      {activePhotoIdx + 1}/{photos.length}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>

            {photos.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {photos.map((uri, idx) => (
                    <Pressable
                      key={`${uri}-${idx}`}
                      onPress={() => setPhotoIdx(idx)}
                      className={`h-12 w-16 overflow-hidden rounded-lg border-2 ${
                        idx === activePhotoIdx
                          ? "border-navy-900"
                          : "border-transparent opacity-70"
                      }`}
                    >
                      <Image
                        source={{ uri }}
                        contentFit="cover"
                        style={{ width: "100%", height: "100%" }}
                      />
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        {detail.location_text ? (
          <View className="flex-row items-start gap-2 rounded-xl border border-[#e7e2da] bg-[#FAF9F7] px-3.5 py-2.5">
            <MapPin size={14} color="#EA580C" style={{ marginTop: 2 }} />
            <Text className="flex-1 text-[12px] text-text-secondary" numberOfLines={2}>
              {detail.location_text}
            </Text>
          </View>
        ) : null}

        {/* Enquiry Card */}
        <View className="gap-3.5 rounded-xl border border-[#e7e2da] bg-white p-4 shadow-2xs">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-base font-bold text-navy-900">
              Send an enquiry
            </Text>
            <View className="flex-row items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5">
              <ShieldCheck size={11} color={THEME_COLORS.emerald600} />
              <Text className="text-[10px] font-semibold text-emerald-700">
                Verified host
              </Text>
            </View>
          </View>

          <Text className="text-xs text-text-secondary">
            The host calls you to talk it through. Nothing is paid here.
          </Text>

          {/* Unit selector */}
          {units.length > 1 ? (
            <View className="gap-1.5">
              <Text className="text-xs font-bold text-navy-900">Room option</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {units.map((u) => {
                  const active = u.id === effectiveUnitId;
                  return (
                    <Pressable
                      key={u.id}
                      onPress={() => setSelectedUnitId(u.id)}
                      className={`rounded-lg border px-2.5 py-1.5 ${
                        active
                          ? "border-navy-900 bg-navy-900"
                          : "border-line bg-surface-sunken"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          active ? "text-white" : "text-navy-900"
                        }`}
                      >
                        {u.name} · {formatPaise(u.nightly_rate_paise)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Move-in date & Duration */}
          <View className="gap-3">
            <View className="gap-1.5">
              <Text className="text-xs font-bold text-navy-900">Move-in date</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setDatePickerOpen(true)}
                className="flex-row items-center justify-between rounded-xl border border-line bg-surface px-3 py-2.5"
              >
                <Text className="text-sm font-semibold text-navy-900">
                  {formatToIndianDate(checkIn)}
                </Text>
                <Calendar size={15} color={COLOR_TOKENS.textMuted} />
              </Pressable>
            </View>

            <QuantityStepper
              label={period === "MONTH" ? "For how many months" : "For how many nights"}
              decrementLabel="Decrease stay duration"
              incrementLabel="Increase stay duration"
              value={length}
              min={1}
              max={period === "MONTH" ? 24 : 90}
              onChange={setLength}
            />
          </View>

          {/* Guests: Adults & Children */}
          <View className="gap-2.5">
            <Text className="text-xs font-bold text-navy-900">Guests</Text>
            <QuantityStepper
              label="Adults (Age 13+)"
              decrementLabel="Decrease adults"
              incrementLabel="Increase adults"
              value={adults}
              min={1}
              max={10}
              onChange={setAdults}
            />
            <QuantityStepper
              label="Children (Under 13)"
              decrementLabel="Decrease children"
              incrementLabel="Increase children"
              value={children}
              min={0}
              max={10}
              onChange={setChildren}
            />
            <Text className="text-xs text-text-secondary">
              <Text className="font-bold text-navy-900">{totalGuests}</Text>{" "}
              {totalGuests === 1 ? "guest total" : "guests total"}
            </Text>
          </View>

          {/* Message to the host */}
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-navy-900">
              Message to the host (optional)
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="e.g. Working professional, can visit this weekend."
              placeholderTextColor={COLOR_TOKENS.textMuted}
              multiline
              numberOfLines={2}
              className="rounded-xl border border-line bg-surface-sunken/50 px-3 py-2.5 text-xs text-navy-900"
            />
          </View>

          {/* Estimate Box */}
          <View className="gap-2 rounded-xl border border-line bg-surface-sunken/70 p-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-xs text-text-secondary">
                {formatPaise(minRate)} / {period === "NIGHT" ? "night" : "month"} × {length}{" "}
                {period === "NIGHT"
                  ? length === 1
                    ? "night"
                    : "nights"
                  : length === 1
                    ? "month"
                    : "months"}
              </Text>
              <Text className="text-sm font-bold text-navy-900">
                about {formatPaise(quoteQuery.data?.total_quote_paise ?? minRate * length)}
              </Text>
            </View>
            <Text className="text-[11px] leading-snug text-text-secondary">
              Your name and phone number are shared with the host so they can call you.
            </Text>
            <Text className="text-[11px] leading-snug text-text-secondary">
              An estimate only — you agree the final price and payment with the host.
            </Text>
          </View>

          {errorMsg ? (
            <View className="flex-row items-center gap-2 rounded-xl bg-danger/10 p-2.5">
              <AlertCircle size={14} color={COLOR_TOKENS.danger} />
              <Text className="flex-1 text-xs font-medium text-danger">
                {errorMsg}
              </Text>
            </View>
          ) : null}

          {enquirySent ? (
            <View className="gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <View className="flex-row items-center gap-1.5">
                <CheckCircle2 size={15} color={THEME_COLORS.emerald600} />
                <Text className="text-xs font-bold text-emerald-800">
                  Enquiry sent to host!
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  onClose();
                  router.push("/stays/mine" as never);
                }}
                className="self-start rounded-lg bg-navy-900 px-3 py-1.5"
              >
                <Text className="text-xs font-bold text-white">View My Stays</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={enquiryMutation.isPending}
              onPress={handleSendEnquiry}
              className="flex-row items-center justify-center gap-2 rounded-xl bg-navy-900 py-3 active:bg-navy-800"
            >
              {enquiryMutation.isPending ? (
                <ActivityIndicator size="small" color={COLOR_TOKENS.textInverse} />
              ) : null}
              <Text className="text-xs font-bold text-white">
                {enquiryMutation.isPending ? "Sending enquiry…" : "Send Enquiry"}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Sticky Footer */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        className="gap-2.5 border-t border-[#e7e2da] bg-white px-5 py-3.5"
      >
        <View className="flex-row items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
              Starts at
            </Text>
            <View className="flex-row items-baseline gap-1 mt-0.5">
              <Text className="text-xl font-extrabold tabular-nums text-navy-900">
                {formatPaise(minRate)}
              </Text>
              <Text className="text-sm font-semibold text-text-secondary">
                /{period === "NIGHT" ? "night" : "mo"}
              </Text>
            </View>
          </View>

          {!enquirySent ? (
            <Pressable
              accessibilityRole="button"
              disabled={enquiryMutation.isPending}
              onPress={handleSendEnquiry}
              className="min-h-[44px] min-w-[136px] flex-row items-center justify-center gap-2 rounded-xl bg-navy-900 px-5 py-2.5 shadow-xs active:bg-navy-800"
            >
              {enquiryMutation.isPending ? (
                <ActivityIndicator size="small" color={COLOR_TOKENS.textInverse} />
              ) : null}
              <Text className="text-sm font-bold text-white">
                {enquiryMutation.isPending ? "Sending…" : "Send Enquiry"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                router.push("/stays/mine" as never);
              }}
              className="min-h-[44px] min-w-[136px] items-center justify-center rounded-xl bg-emerald-700 px-5 py-2.5 active:bg-emerald-800"
            >
              <Text className="text-sm font-bold text-white">View My Stays</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            router.push(`/stays/${detail.slug || detail.id}` as never);
          }}
          className="flex-row items-center gap-1 self-start pt-1 active:opacity-70"
        >
          <Text className="text-[12px] font-bold text-[#EA580C]">
            See full property details
          </Text>
          <ArrowRight size={13} color="#EA580C" />
        </Pressable>
      </View>

      <TouchDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        value={checkIn}
        onChange={setCheckIn}
        title="Select Check-in Date"
        minDate={todayIso()}
      />

      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => enquiryMutation.mutate()}
      />
    </View>
  );
}

