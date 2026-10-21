import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiRequestError } from "@vsolve/api-client";
import { useAuthStore } from "@vsolve/mobile-core";
import { ErrorState, Skeleton, Text, TouchDatePicker } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Info,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Star,
  Users,
  X,
} from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import { CustomerLoginSheet } from "@/features/session/customer-login-sheet";
import {
  formatPaise,
  formatRate,
  pricePeriodOf,
  roomOccupancyLabel,
  stayLengthLabel,
  type StayProperty,
  type StayReview,
  type StayUnit,
} from "../model";
import { addDaysIso, todayIso } from "../pickup-time";
import {
  createStayEnquiry,
  fetchMyStayEnquiries,
  fetchStayProperty,
  fetchStayQuote,
  fetchStays,
} from "../queries";
import { THEME_COLORS } from "../theme-colors";
import { getAmenityIcon } from "./amenity-icon";
import { StayCard } from "./stay-card";
import { StayReviewSheet } from "./stay-review-sheet";

const FALLBACK_STAY_IMAGE =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop";

/** Server limits, in the property's unit: 24 months or 90 nights. */
const LENGTH_CHOICES = { MONTH: 24, NIGHT: 90 } as const;

function formatToIndianDate(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

function refusalMessage(err: unknown, minimumLabel: string): string {
  if (err && typeof err === "object") {
    if ("fieldErrors" in err && (err as any).fieldErrors) {
      const fieldErrors = (err as any).fieldErrors as Record<string, string[]>;
      const firstField = Object.keys(fieldErrors)[0];
      if (firstField && fieldErrors[firstField]?.length) {
        return fieldErrors[firstField][0];
      }
    }
    const code = (err as any).code;
    if (code === "duplicate_enquiry") {
      return "You already have an active enquiry for this stay.";
    }
    if (code === "min_stay_not_met") {
      return `Minimum stay is ${minimumLabel}.`;
    }
    if (code === "max_stay_exceeded") {
      return "Selected stay length exceeds the maximum allowed duration.";
    }
    if (code === "dates_unavailable") {
      return "The host isn't taking stays for those dates.";
    }
    if (code === "check_in_in_past") {
      return "The check-in date cannot be in the past.";
    }
    if (code === "length_required") {
      return "Please select how long you want to stay.";
    }
    if (code === "room_unavailable") {
      return "This room is no longer available. Please select another room.";
    }
    if (code === "too_many_guests") {
      return "This room cannot accommodate that many guests.";
    }
    if (code === "room_required") {
      return "Please select a room.";
    }
  }
  return (err as any)?.message || "Failed to send enquiry.";
}

export function StayDetailScreen({ slug }: { slug: string }) {
  const router = useRouter();

  const {
    data: property,
    isLoading,
    error: fetchError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["stay-property", slug],
    queryFn: () => fetchStayProperty(slug),
    enabled: Boolean(slug),
  });

  // GAP-S-12: Canonical slug redirect
  useEffect(() => {
    if (property?.slug && slug && slug !== property.slug) {
      router.replace(`/stays/${property.slug}` as never);
    }
  }, [property?.slug, slug, router]);

  if (isLoading) {
    return (
      <View className="flex-1 bg-canvas p-4 gap-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </View>
    );
  }

  if (fetchError || !property) {
    return (
      <View className="flex-1 bg-canvas p-6 justify-center">
        <ErrorState
          title="Property not available"
          message={
            fetchError
              ? (fetchError as Error).message
              : "This property does not exist or has been removed."
          }
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  return (
    <StayDetailLoaded
      property={property}
      isRefetching={isRefetching}
      refetch={refetch}
    />
  );
}

function StayDetailLoaded({
  property,
  isRefetching,
  refetch,
}: {
  property: StayProperty;
  isRefetching: boolean;
  refetch: () => void;
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
    units[0]?.id || "",
  );
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDuplicateEnquiry, setIsDuplicateEnquiry] = useState(false);
  const [showNewEnquiryForm, setShowNewEnquiryForm] = useState(false);

  // My enquiries query to check for existing active enquiries
  const authStatus = useAuthStore((s) => s.status);
  const myEnquiries = useQuery({
    queryKey: ["my-stay-enquiries"],
    queryFn: fetchMyStayEnquiries,
    enabled: authStatus === "signedIn",
  });

  const existingEnquiry = (myEnquiries.data ?? []).find((e) => {
    const propId = typeof e.property === "string" ? e.property : e.property?.id;
    const propSlug =
      e.property_slug ||
      (typeof e.property === "object" ? e.property?.slug : undefined);
    return (
      (propId === property.id || propSlug === property.slug) &&
      (e.status === "SUBMITTED" || e.status === "RESPONDED")
    );
  });

  // Enquiry form state
  const [checkIn, setCheckIn] = useState(() => addDaysIso(todayIso(), 7));
  const [length, setLength] = useState(minimum);
  const [lengthText, setLengthText] = useState(String(minimum));
  const [adultCount, setAdultCount] = useState(1);
  const [childCount, setChildCount] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const currentUnitId = selectedUnitId || units[0]?.id || "";
  const currentUnit = units.find((u) => u.id === currentUnitId) || units[0];

  // Gallery media selection
  const unitMediaUrls =
    (currentUnit as any)?.media?.map((m: any) => m.url).filter(Boolean) ?? [];
  const propertyImages =
    property.image_urls && property.image_urls.length > 0
      ? property.image_urls
      : [FALLBACK_STAY_IMAGE];
  const images = unitMediaUrls.length > 0 ? unitMediaUrls : propertyImages;

  const prevPhoto = () => {
    if (images.length < 2) return;
    setActivePhotoIdx((curr) => (curr - 1 + images.length) % images.length);
  };

  const nextPhoto = () => {
    if (images.length < 2) return;
    setActivePhotoIdx((curr) => (curr + 1) % images.length);
  };

  // Capacity calculations
  const maxGuests = Math.max(currentUnit?.max_guests ?? 1, 1);
  const adults = Math.min(
    Math.max(adultCount, 1),
    Math.max(maxGuests - childCount, 1),
  );
  const children = Math.min(childCount, Math.max(maxGuests - adults, 0));
  const totalGuests = adults + children;

  // Live Quote query
  const quoteQuery = useQuery({
    queryKey: ["stay-quote", property.id, currentUnitId, checkIn, length],
    queryFn: () =>
      fetchStayQuote({
        property_id: property.id,
        unit_id: currentUnitId || null,
        check_in: checkIn,
        length,
      }),
    enabled: Boolean(property.id && checkIn && currentUnitId),
    retry: false,
  });

  const rate =
    quoteQuery.data?.nightly_rate_paise ?? currentUnit?.nightly_rate_paise ?? 0;
  const estimate = quoteQuery.data?.total_quote_paise ?? rate * length;
  const quoteProblem = quoteQuery.error
    ? refusalMessage(quoteQuery.error, minimumLabel)
    : null;

  const commitLength = (raw: string) => {
    const next = Number(raw);
    const clamped = Number.isInteger(next)
      ? Math.min(maxLength, Math.max(minimum, next))
      : minimum;
    setLength(clamped);
    setLengthText(String(clamped));
    setError(null);
  };

  const enquiryMutation = useMutation({
    mutationFn: () =>
      createStayEnquiry({
        property_id: property.id,
        unit_id: currentUnitId || null,
        check_in: checkIn,
        length,
        guest_count: totalGuests,
        adult_count: adults,
        child_count: children,
        message,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
      setIsDuplicateEnquiry(false);
      setIsSuccess(true);
    },
    onError: (err: unknown) => {
      const isDup =
        (isApiRequestError(err) && err.code === "duplicate_enquiry") ||
        (err as any)?.code === "duplicate_enquiry" ||
        (typeof (err as any)?.message === "string" &&
          (err as any).message.toLowerCase().includes("active enquiry already exists"));

      void queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
      if (isDup) {
        setIsDuplicateEnquiry(true);
      }
      setError(refusalMessage(err, minimumLabel));
    },
  });

  const handleSendEnquiry = () => {
    setError(null);
    const authStatus = useAuthStore.getState().status;
    if (authStatus !== "signedIn") {
      setLoginOpen(true);
      return;
    }
    if (!checkIn) {
      setError(monthly ? "Choose a move-in date." : "Choose a check-in date.");
      return;
    }
    if (quoteProblem) {
      setError(quoteProblem);
      return;
    }
    enquiryMutation.mutate();
  };

  const amenities = property.amenities ?? [];
  const highlights = property.highlights ?? [];
  const reviews = property.reviews ?? [];
  const averageRating =
    reviews.length > 0
      ? (
          reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length
        ).toFixed(1)
      : property.average_rating
        ? Number(property.average_rating).toFixed(1)
        : null;

  const hostName =
    property.host_name ||
    property.partner?.business_name ||
    property.partner?.company_name ||
    property.partner?.full_name ||
    "Verified Host";

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="p-4 pb-16 gap-6"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        {/* Top Back Navigation Breadcrumb */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Stays & PG"
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push("/stays" as never);
            }
          }}
          className="flex-row items-center gap-1.5 self-start py-1"
        >
          <ArrowLeft size={14} color={THEME_COLORS.muted} />
          <Text className="text-xs font-bold text-text-secondary">
            Back to Stays & PG
          </Text>
        </Pressable>

        {/* Inset Photo Gallery Carousel */}
        <View className="flex-col gap-2">
          <View className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-line bg-surface-sunken">
            <Pressable
              onPress={() => setFullscreenPhoto(images[activePhotoIdx])}
              className="h-full w-full"
            >
              <Image
                source={{ uri: images[activePhotoIdx] }}
                contentFit="cover"
                style={{ width: "100%", height: "100%" }}
              />
            </Pressable>

            {images.length > 1 ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous photo"
                  hitSlop={8}
                  onPress={prevPhoto}
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-9 items-center justify-center rounded-full border border-line bg-white/90 shadow-xs active:bg-white"
                >
                  <ChevronLeft size={16} color={THEME_COLORS.navy900} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next photo"
                  hitSlop={8}
                  onPress={nextPhoto}
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-9 items-center justify-center rounded-full border border-line bg-white/90 shadow-xs active:bg-white"
                >
                  <ChevronRight size={16} color={THEME_COLORS.navy900} />
                </Pressable>

                <View className="absolute bottom-3 right-3 rounded-lg border border-line bg-white/90 px-2 py-0.5 backdrop-blur-xs">
                  <Text className="text-[11px] font-bold text-navy-900">
                    {activePhotoIdx + 1}/{images.length}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          {/* Thumbnail preview strip */}
          {images.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="flex-row gap-2 pb-0.5"
            >
              {images.map((url: string, i: number) => {
                const selected = i === activePhotoIdx;
                return (
                  <Pressable
                    key={i}
                    onPress={() => setActivePhotoIdx(i)}
                    className={`h-14 w-[4.5rem] overflow-hidden rounded-xl border transition ${
                      selected
                        ? "border-brand ring-2 ring-brand/30"
                        : "border-line opacity-80"
                    }`}
                  >
                    <Image
                      source={{ uri: url }}
                      contentFit="cover"
                      style={{ width: "100%", height: "100%" }}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>

        {/* Main Property Info Card */}
        <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          {/* Verified host pill badge */}
          <View className="flex-row items-center gap-1 self-start rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5">
            <ShieldCheck size={12} color={THEME_COLORS.emerald600} />
            <Text className="text-xs font-semibold text-emerald-700">
              Verified host
            </Text>
          </View>

          {/* Property Title */}
          <Text className="mt-3 text-2xl font-black text-navy-900">
            {property.title}
          </Text>

          {/* Host info */}
          <Text className="mt-1 text-xs text-text-secondary font-medium">
            Hosted by <Text className="font-bold text-navy-900">{hostName}</Text>
          </Text>

          {/* Average Rating if present */}
          {averageRating ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Star size={12} color={THEME_COLORS.amber} fill={THEME_COLORS.amber} />
              <Text className="text-xs font-bold text-amber-700">
                {averageRating}
                {property.review_count ? ` (${property.review_count} reviews)` : ""}
              </Text>
            </View>
          ) : null}

          {/* Location with MapPin */}
          {property.location_text ? (
            <View className="mt-2 flex-row items-center gap-1.5">
              <MapPin size={13} color={THEME_COLORS.action} />
              <Text className="text-xs text-text-secondary">
                {property.location_text}
              </Text>
            </View>
          ) : null}

          {/* Minimum stay with Clock */}
          {property.min_stay_nights && property.min_stay_nights > 1 ? (
            <View className="mt-2 flex-row items-center gap-1.5">
              <Clock size={13} color={THEME_COLORS.action} />
              <Text className="text-xs text-text-secondary">
                Minimum stay: {stayLengthLabel(property.min_stay_nights, period)}
              </Text>
            </View>
          ) : null}

          {/* About this stay */}
          {property.description?.trim() ? (
            <>
              <View className="my-5 border-t border-line/70" />
              <View>
                <Text className="text-sm font-bold text-navy-900">
                  About this stay
                </Text>
                <Text className="mt-2 text-xs leading-relaxed text-text-secondary whitespace-pre-line">
                  {property.description}
                </Text>
              </View>
            </>
          ) : null}

          {/* About this place / Highlights */}
          {highlights.length > 0 ? (
            <>
              <View className="my-5 border-t border-line/70" />
              <View>
                <Text className="text-sm font-bold text-navy-900">
                  About this place
                </Text>
                <View className="mt-3 flex-row flex-wrap">
                  {highlights.map((h, i) => (
                    <View key={i} className="w-1/2 py-1.5 pr-2">
                      <Text className="text-[11px] text-text-muted">{h.label}</Text>
                      <Text className="text-xs font-bold text-navy-900">
                        {h.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {/* Available Room Configurations */}
          <View className="my-5 border-t border-line/70" />
          <View>
            <Text className="text-sm font-bold text-navy-900">
              Available Room Configurations
            </Text>
            <View className="mt-3 gap-2.5">
              {units.map((unit) => {
                const isSelected = currentUnitId === unit.id;
                return (
                  <Pressable
                    key={unit.id}
                    onPress={() => {
                      setSelectedUnitId(unit.id);
                      setError(null);
                    }}
                    className={`flex-row items-center justify-between rounded-xl border p-3.5 ${
                      isSelected
                        ? "border-brand bg-orange-50/40"
                        : "border-line bg-surface-sunken"
                    }`}
                  >
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-bold text-navy-900">
                        {unit.name}
                      </Text>
                      <Text className="text-xs text-text-secondary">
                        {roomOccupancyLabel(unit, property.room_style)}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-base font-extrabold text-brand">
                        {formatPaise(unit.nightly_rate_paise)}
                      </Text>
                      <Text className="text-[10px] text-text-secondary">
                        {period === "NIGHT" ? "per night" : "per month"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Amenities */}
          <View className="my-5 border-t border-line/70" />
          <View>
            <Text className="text-sm font-bold text-navy-900">Amenities</Text>
            {amenities.length > 0 ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {amenities.map((amenity) => {
                  const Icon = getAmenityIcon(amenity.key);
                  return (
                    <View
                      key={amenity.key}
                      className="flex-row items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2"
                    >
                      <Icon size={14} color={THEME_COLORS.action} />
                      <Text className="text-xs font-medium text-navy-900">
                        {amenity.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="mt-2 text-xs text-text-secondary">
                The host hasn&apos;t listed amenities. Ask when they call you.
              </Text>
            )}
          </View>
        </View>

        {/* How enquiries work Card */}
        <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs gap-2.5">
          <View className="flex-row items-center gap-2">
            <CheckCircle2 size={16} color={THEME_COLORS.emerald600} />
            <Text className="text-sm font-bold text-navy-900">
              How enquiries work
            </Text>
          </View>
          <Text className="text-xs leading-relaxed text-text-secondary">
            Send your dates. The host sees your name and phone number and calls you
            to confirm. Nothing is paid online, and you can withdraw any time before
            the host confirms.
          </Text>
        </View>

        {/* House Rules & Guidelines Card */}
        {property.house_rules?.trim() ? (
          <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs gap-2.5">
            <View className="flex-row items-center gap-2">
              <FileText size={16} color={THEME_COLORS.action} />
              <Text className="text-sm font-bold text-navy-900">
                House Rules & Guidelines
              </Text>
            </View>
            <Text className="text-xs leading-relaxed text-text-secondary whitespace-pre-line">
              {property.house_rules}
            </Text>
          </View>
        ) : null}

        {/* Guest Reviews Card */}
        <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs gap-3">
          <View className="flex-row items-center justify-between border-b border-line pb-3">
            <View className="flex-row items-center gap-2">
              <Star size={18} color={THEME_COLORS.amber} fill={THEME_COLORS.amber} />
              <Text className="text-sm font-extrabold text-navy-900">
                {averageRating
                  ? `${averageRating} · ${reviews.length} Review${
                      reviews.length === 1 ? "" : "s"
                    }`
                  : "Guest Reviews"}
              </Text>
            </View>

            {property.can_review ? (
              <Pressable
                onPress={() => setReviewOpen(true)}
                className="flex-row items-center gap-1.5 rounded-xl border border-line bg-surface-sunken px-3 py-1.5 active:bg-surface-hover"
              >
                <MessageSquare size={13} color={THEME_COLORS.navy900} />
                <Text className="text-xs font-bold text-navy-900">
                  Write a review
                </Text>
              </Pressable>
            ) : null}
          </View>

          {reviews.length > 0 ? (
            <View className="gap-4 pt-1">
              {reviews.map((rev: StayReview, idx: number) => (
                <View
                  key={rev.id || idx}
                  className="gap-1.5 border-b border-line/60 pb-3 last:border-b-0 last:pb-0"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-bold text-navy-900">
                      {rev.customer_name || "Verified Guest"}
                    </Text>
                    <View className="flex-row items-center gap-0.5">
                      {Array.from({ length: rev.rating ?? 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={12}
                          color={THEME_COLORS.amber}
                          fill={THEME_COLORS.amber}
                        />
                      ))}
                    </View>
                  </View>

                  {rev.comment ? (
                    <Text className="text-xs leading-relaxed text-text-secondary">
                      {rev.comment}
                    </Text>
                  ) : null}

                  {rev.image_urls && rev.image_urls.length > 0 ? (
                    <View className="flex-row flex-wrap gap-2 pt-1">
                      {rev.image_urls.map((photoUrl: string, pIdx: number) => (
                        <Pressable
                          key={pIdx}
                          onPress={() => setFullscreenPhoto(photoUrl)}
                          className="size-14 overflow-hidden rounded-xl border border-line"
                        >
                          <Image
                            source={{ uri: photoUrl }}
                            contentFit="cover"
                            style={{ width: "100%", height: "100%" }}
                          />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : (
            <Text className="py-1 text-xs text-text-secondary">
              No guest reviews yet.
            </Text>
          )}
        </View>

        {/* INLINE Enquiry Section */}
        {(existingEnquiry || isDuplicateEnquiry) && !showNewEnquiryForm ? (
          <View className="rounded-2xl border border-emerald-500/30 bg-surface p-5 shadow-xs gap-4">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <View className="size-8 rounded-full bg-emerald-100 items-center justify-center">
                  <CheckCircle2 size={18} color={THEME_COLORS.emerald600} />
                </View>
                <Text className="text-lg font-extrabold text-navy-900">
                  Enquiry Active
                </Text>
              </View>
              <View className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1">
                <Text className="text-xs font-bold text-emerald-800">
                  {existingEnquiry?.status === "RESPONDED"
                    ? "Host Responded"
                    : "Submitted"}
                </Text>
              </View>
            </View>

            <Text className="text-xs leading-relaxed text-text-secondary">
              You already have an active enquiry for this stay. The host has your details and phone number, and will call you soon to confirm availability.
            </Text>

            {existingEnquiry ? (
              <View className="rounded-xl border border-line bg-surface-sunken p-3.5 gap-2.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-secondary">
                    {monthly ? "Move-in date" : "Check-in date"}
                  </Text>
                  <Text className="text-xs font-bold text-navy-900">
                    {formatToIndianDate(existingEnquiry.check_in)}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-secondary">Duration</Text>
                  <Text className="text-xs font-bold text-navy-900">
                    {existingEnquiry.stay_length || existingEnquiry.nights}{" "}
                    {monthly ? "months" : "nights"}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-secondary">Room</Text>
                  <Text className="text-xs font-bold text-navy-900">
                    {existingEnquiry.unit_name || currentUnit?.name || "Standard room"}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-secondary">Guests</Text>
                  <Text className="text-xs font-bold text-navy-900">
                    {existingEnquiry.guest_count} guest
                    {existingEnquiry.guest_count === 1 ? "" : "s"}
                  </Text>
                </View>
                <View className="flex-row items-center justify-between border-t border-line/60 pt-2">
                  <Text className="text-xs text-text-secondary">Estimated Total</Text>
                  <Text className="text-sm font-extrabold text-brand">
                    {formatPaise(existingEnquiry.total_quote_paise ?? 0)}
                  </Text>
                </View>
                {existingEnquiry.host_name ? (
                  <View className="flex-row items-center gap-1.5 pt-1">
                    <Phone size={13} color={THEME_COLORS.emerald600} />
                    <Text className="text-xs text-emerald-800 font-medium">
                      Host: {existingEnquiry.host_name}{" "}
                      {existingEnquiry.host_phone ? `(${existingEnquiry.host_phone})` : ""}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View className="gap-2.5 pt-1">
              <Pressable
                onPress={() => router.push("/stays/mine" as never)}
                className="items-center justify-center rounded-xl bg-brand py-3.5 shadow-xs active:bg-brand/90"
              >
                <Text className="text-sm font-bold text-white">
                  View in My Enquiries →
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setError(null);
                  setShowNewEnquiryForm(true);
                }}
                className="items-center justify-center rounded-xl border border-line bg-surface-sunken py-3 active:bg-surface-hover"
              >
                <Text className="text-xs font-bold text-navy-900">
                  Enquire for Different Dates
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs gap-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-xl font-bold text-navy-900">
                Send an enquiry
              </Text>
              <View className="flex-row items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5">
                <ShieldCheck size={12} color={THEME_COLORS.emerald600} />
                <Text className="text-xs font-semibold text-emerald-700">
                  Verified host
                </Text>
              </View>
            </View>

            {existingEnquiry ? (
              <View className="flex-row items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 p-3">
                <View className="flex-1 pr-2">
                  <Text className="text-xs font-bold text-blue-900">
                    Existing active enquiry
                  </Text>
                  <Text className="text-[11px] text-blue-800">
                    Move-in on {formatToIndianDate(existingEnquiry.check_in)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowNewEnquiryForm(false)}
                  className="rounded-lg bg-blue-100 px-2.5 py-1"
                >
                  <Text className="text-xs font-bold text-blue-900">View Active</Text>
                </Pressable>
              </View>
            ) : null}

            <Text className="text-xs text-text-secondary -mt-3">
              The host calls you to talk it through. Nothing is paid here.
            </Text>

            {/* Room Selector if multiple units */}
            {units.length > 1 ? (
              <View className="gap-1.5">
                <Text className="text-xs font-bold text-navy-900">Room</Text>
                <View className="gap-2">
                  {units.map((unit) => (
                    <Pressable
                      key={unit.id}
                      onPress={() => {
                        setSelectedUnitId(unit.id);
                        setError(null);
                      }}
                      className={`flex-row items-center justify-between rounded-xl border p-3 ${
                        currentUnitId === unit.id
                          ? "border-brand bg-orange-50/40"
                          : "border-line bg-surface-sunken"
                      }`}
                    >
                      <Text className="text-xs font-bold text-navy-900">
                        {unit.name}
                      </Text>
                      <Text className="text-xs font-extrabold text-brand">
                        {formatRate(unit.nightly_rate_paise, period)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Date and Duration Fields */}
            <View className="gap-4">
              {/* Move-in / Check-in date */}
              <View className="gap-1.5">
                <View className="flex-row items-center gap-1.5">
                  <Calendar size={14} color={THEME_COLORS.muted} />
                  <Text className="text-xs font-bold text-navy-900">
                    {monthly ? "Move-in date" : "Check-in date"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setDatePickerOpen(true)}
                  className="flex-row items-center justify-between rounded-xl border border-line bg-surface-sunken px-3.5 py-3 active:bg-surface-hover"
                >
                  <Text className="text-sm font-medium text-navy-900">
                    {formatToIndianDate(checkIn)}
                  </Text>
                  <Calendar size={16} color={THEME_COLORS.muted} />
                </Pressable>
              </View>

              {/* Duration */}
              <View className="gap-1.5">
                <Text className="text-xs font-bold text-navy-900">
                  {monthly ? "For how many months" : "For how many nights"}
                </Text>
                <TextInput
                  keyboardType="number-pad"
                  value={lengthText}
                  onChangeText={(raw) => {
                    setLengthText(raw);
                    const next = Number(raw);
                    if (raw !== "" && Number.isInteger(next) && next >= 1) {
                      setLength(next);
                      setError(null);
                    }
                  }}
                  onBlur={() => commitLength(lengthText)}
                  className="rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5 text-sm font-medium text-navy-900"
                />
              </View>
            </View>

            {/* Guests Section */}
            <View className="gap-2">
              <View className="flex-row items-center gap-1.5">
                <Users size={14} color={THEME_COLORS.muted} />
                <Text className="text-xs font-bold text-navy-900">Guests</Text>
              </View>

              {/* Adults */}
              <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5">
                <View>
                  <Text className="text-sm font-semibold text-navy-900">Adults</Text>
                  <Text className="text-[11px] text-text-secondary">Age 13+</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <Pressable
                    disabled={adultCount <= 1}
                    hitSlop={10}
                    onPress={() => setAdultCount((n) => Math.max(1, n - 1))}
                    className={`size-7 items-center justify-center rounded-full border border-line bg-surface ${
                      adultCount <= 1 ? "opacity-40" : "active:bg-surface-hover"
                    }`}
                  >
                    <Text className="text-sm font-bold text-navy-900">–</Text>
                  </Pressable>
                  <Text className="w-5 text-center text-sm font-bold text-navy-900">
                    {adultCount}
                  </Text>
                  <Pressable
                    disabled={adultCount + childCount >= maxGuests}
                    hitSlop={10}
                    onPress={() =>
                      setAdultCount((n) => Math.min(n + 1, maxGuests - childCount))
                    }
                    className={`size-7 items-center justify-center rounded-full border border-line bg-surface ${
                      adultCount + childCount >= maxGuests
                        ? "opacity-40"
                        : "active:bg-surface-hover"
                    }`}
                  >
                    <Text className="text-sm font-bold text-navy-900">+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Children */}
              <View className="flex-row items-center justify-between rounded-xl border border-line bg-surface-sunken px-3.5 py-2.5">
                <View>
                  <Text className="text-sm font-semibold text-navy-900">Children</Text>
                  <Text className="text-[11px] text-text-secondary">Under 13</Text>
                </View>
                <View className="flex-row items-center gap-3">
                  <Pressable
                    disabled={childCount <= 0}
                    hitSlop={10}
                    onPress={() => setChildCount((n) => Math.max(0, n - 1))}
                    className={`size-7 items-center justify-center rounded-full border border-line bg-surface ${
                      childCount <= 0 ? "opacity-40" : "active:bg-surface-hover"
                    }`}
                  >
                    <Text className="text-sm font-bold text-navy-900">–</Text>
                  </Pressable>
                  <Text className="w-5 text-center text-sm font-bold text-navy-900">
                    {childCount}
                  </Text>
                  <Pressable
                    disabled={adultCount + childCount >= maxGuests}
                    hitSlop={10}
                    onPress={() =>
                      setChildCount((n) => Math.min(n + 1, maxGuests - adultCount))
                    }
                    className={`size-7 items-center justify-center rounded-full border border-line bg-surface ${
                      adultCount + childCount >= maxGuests
                        ? "opacity-40"
                        : "active:bg-surface-hover"
                    }`}
                  >
                    <Text className="text-sm font-bold text-navy-900">+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Total Headcount summary */}
              <Text className="px-1 text-[11px] text-text-secondary">
                <Text className="font-semibold text-navy-900">{totalGuests}</Text>{" "}
                guest{totalGuests === 1 ? "" : "s"} total{" "}
                {maxGuests > 1 ? (
                  <Text className="text-text-secondary/70">
                    · room fits up to {maxGuests}
                  </Text>
                ) : null}
              </Text>
            </View>

            {/* Message to host */}
            <View className="gap-1.5">
              <Text className="text-xs font-bold text-navy-900">
                Message to the host (optional)
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={3}
                placeholder="e.g. Working professional, can visit this weekend."
                placeholderTextColor="#9ca3af"
                className="min-h-[72px] rounded-xl border border-line bg-surface-sunken p-3 text-xs text-navy-900"
                textAlignVertical="top"
              />
            </View>

            {/* Live Quote Breakdown Box */}
            <View className="gap-2.5 rounded-xl border border-line bg-surface-sunken p-4">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-text-secondary">
                  {formatRate(rate, period)} × {stayLengthLabel(length, period)}
                </Text>
                <Text className="text-sm font-bold text-navy-900">
                  {quoteQuery.isLoading ? "…" : `about ${formatPaise(estimate)}`}
                </Text>
              </View>
              <View className="flex-row items-start gap-1.5 pt-1">
                <Phone size={13} color={THEME_COLORS.muted} className="mt-0.5" />
                <Text className="flex-1 text-[11px] text-text-secondary leading-tight">
                  Your name and phone number are shared with the host so they can call
                  you.
                </Text>
              </View>
              <View className="flex-row items-start gap-1.5">
                <Info size={13} color={THEME_COLORS.muted} className="mt-0.5" />
                <Text className="flex-1 text-[11px] text-text-secondary leading-tight">
                  An estimate only — you agree the final price and payment with the
                  host.
                </Text>
              </View>
            </View>

            {/* Refusal / Error Banner */}
            {error || quoteProblem ? (
              <View className="rounded-xl border border-rose-200 bg-rose-50 p-3 gap-2">
                <View className="flex-row items-center gap-2">
                  <AlertCircle size={16} color={THEME_COLORS.danger} />
                  <Text className="flex-1 text-xs font-semibold text-rose-800">
                    {error ?? quoteProblem}
                  </Text>
                </View>
                {isDuplicateEnquiry ||
                (typeof error === "string" &&
                  (error.toLowerCase().includes("already") ||
                    error.toLowerCase().includes("active enquiry"))) ? (
                  <Pressable
                    onPress={() => router.push("/stays/mine" as never)}
                    className="self-start rounded-lg bg-rose-100 px-3 py-1.5 active:bg-rose-200"
                  >
                    <Text className="text-xs font-bold text-rose-900">
                      Go to My Enquiries →
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Send Enquiry CTA Button */}
            <Pressable
              disabled={enquiryMutation.isPending || Boolean(quoteProblem)}
              onPress={handleSendEnquiry}
              className={`items-center justify-center rounded-xl bg-brand py-3.5 shadow-xs active:bg-brand/90 ${
                enquiryMutation.isPending || Boolean(quoteProblem)
                  ? "opacity-60"
                  : ""
              }`}
            >
              {enquiryMutation.isPending ? (
                <ActivityIndicator size="small" color={THEME_COLORS.white} />
              ) : (
                <Text className="text-sm font-bold text-white">Send enquiry</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Similar Stays You May Like Section */}
        <SimilarStaysSection
          currentPropertyId={property.id}
          location={property.location_text}
        />
      </ScrollView>

      {/* Date Picker Modal */}
      <TouchDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        value={checkIn}
        onChange={(val) => {
          setCheckIn(val);
          setError(null);
        }}
        minDate={todayIso()}
        title={monthly ? "Select Move-in Date" : "Select Check-in Date"}
      />

      {/* Customer Login Sheet for Guest Flow */}
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => handleSendEnquiry()}
      />

      {/* Write a Review Sheet */}
      <StayReviewSheet
        propertyId={property.id}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={() => void refetch()}
      />

      {/* Fullscreen Photo Modal Viewer */}
      <Modal
        visible={Boolean(fullscreenPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenPhoto(null)}
      >
        <View className="flex-1 bg-black/95 justify-center items-center">
          <Pressable
            onPress={() => setFullscreenPhoto(null)}
            className="absolute top-12 right-6 size-10 items-center justify-center rounded-full bg-white/20 active:bg-white/40 z-10"
          >
            <X size={20} color={THEME_COLORS.white} />
          </Pressable>

          {fullscreenPhoto ? (
            <Image
              source={{ uri: fullscreenPhoto }}
              contentFit="contain"
              style={{ width: "100%", height: "80%" }}
            />
          ) : null}
        </View>
      </Modal>

      {/* Success Modal */}
      <Modal
        visible={isSuccess}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSuccess(false)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center p-5">
          <View className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-raised gap-4">
            <View className="size-12 rounded-full bg-emerald-100 items-center justify-center self-center">
              <CheckCircle2 size={28} color={THEME_COLORS.emerald600} />
            </View>
            <Text className="text-center text-lg font-extrabold text-navy-900">
              Enquiry Sent!
            </Text>
            <Text className="text-center text-xs text-text-secondary leading-relaxed">
              The host has received your details and will call you soon to confirm
              and answer questions.
            </Text>
            <View className="gap-2.5 pt-2">
              <Pressable
                onPress={() => {
                  setIsSuccess(false);
                  router.push("/stays/mine" as never);
                }}
                className="items-center justify-center rounded-xl bg-brand py-3 active:bg-brand/90"
              >
                <Text className="text-xs font-bold text-white">
                  View My Enquiries
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setIsSuccess(false)}
                className="items-center justify-center rounded-xl border border-line bg-surface-sunken py-3 active:bg-surface-hover"
              >
                <Text className="text-xs font-bold text-navy-900">Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * Similar Stays Recommendations
 */
function SimilarStaysSection({
  currentPropertyId,
  location,
}: {
  currentPropertyId: string;
  location?: string;
}) {
  const router = useRouter();
  const city = location ? location.split(",")[0]?.trim() : undefined;

  const { data: stays = [] } = useQuery({
    queryKey: ["similar-stays", currentPropertyId, city],
    queryFn: () => fetchStays({ location: city, limit: 6 }),
    staleTime: 60_000,
  });

  const similarStays = stays
    .filter((s) => s.id !== currentPropertyId)
    .slice(0, 3);

  if (similarStays.length === 0) return null;

  return (
    <View className="gap-3 pt-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-base font-extrabold text-navy-900">
            Similar Stays You May Like
          </Text>
          <Text className="text-[11px] text-text-secondary">
            Other verified rooms and accommodation in this area
          </Text>
        </View>

        <Pressable onPress={() => router.push("/stays" as never)}>
          <Text className="text-xs font-bold text-brand">
            View all stays →
          </Text>
        </Pressable>
      </View>

      <View className="gap-4 pt-1">
        {similarStays.map((item) => (
          <StayCard key={item.id} property={item} />
        ))}
      </View>
    </View>
  );
}
