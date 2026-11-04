import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isApiRequestError } from "@vsolve/api-client";
import { useAuthStore } from "@vsolve/mobile-core";
import { Skeleton, Text, TouchDatePicker } from "@vsolve/mobile-ui";
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
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";

import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
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
  type StayEnquiry,
} from "../model";
import { addDaysIso, todayIso } from "../pickup-time";
import {
  createStayEnquiry,
  fetchMyStayEnquiries,
  fetchStayQuote,
  fetchStays,
} from "../queries";
import { THEME_COLORS } from "../theme-colors";
import { getAmenityIcon } from "./amenity-icon";
import { StayCard } from "./stay-card";
import { StayReviewSheet } from "./stay-review-sheet";
import { LookSwitcher } from "./look-switcher";
import { NoStayPhotos } from "./no-stay-photos";
import { pickLook, visibleLooks } from "../looks";

const LENGTH_CHOICES = { MONTH: 24, NIGHT: 90 } as const;

function formatToIndianDate(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

interface ApiErrorShape {
  code?: string;
  message?: string;
  fieldErrors?: Record<string, string[]>;
}

function refusalMessage(err: unknown, minimumLabel: string): string {
  if (err && typeof err === "object") {
    const apiErr = err as ApiErrorShape;
    if (apiErr.fieldErrors) {
      const firstField = Object.keys(apiErr.fieldErrors)[0];
      if (firstField && apiErr.fieldErrors[firstField]?.length) {
        return apiErr.fieldErrors[firstField][0];
      }
    }
    const code = apiErr.code;
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
    if (typeof apiErr.message === "string") {
      return apiErr.message;
    }
  }
  return "Failed to send enquiry.";
}

export function DesktopStayDetail({ property }: { property: StayProperty }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const period = pricePeriodOf(property.price_period);
  const monthly = period === "MONTH";
  const minimum = Math.max(property.min_stay_nights ?? 1, 1);
  const minimumLabel = stayLengthLabel(minimum, period);
  const maxLength = LENGTH_CHOICES[period];

  const units = (property.units || []) as StayUnit[];
  const [selectedUnitId, setSelectedUnitId] = useState<string>(units[0]?.id || "");
  const [selectedLookId, setSelectedLookId] = useState<string>("");
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isDuplicateEnquiry, setIsDuplicateEnquiry] = useState(false);
  const [showNewEnquiryForm, setShowNewEnquiryForm] = useState(false);

  // My enquiries query
  const authStatus = useAuthStore((s) => s.status);
  const myEnquiries = useQuery({
    queryKey: ["my-stay-enquiries-list"],
    queryFn: fetchMyStayEnquiries,
    enabled: authStatus === "signedIn",
  });

  const rawEnquiries = myEnquiries.data;
  const enquiriesList = Array.isArray(rawEnquiries)
    ? rawEnquiries
    : Array.isArray((rawEnquiries as unknown as { results?: StayEnquiry[] })?.results)
      ? (rawEnquiries as unknown as { results: StayEnquiry[] }).results
      : [];

  const existingEnquiry = enquiriesList.find((e) => {
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
  const currentLook = currentUnit ? pickLook(currentUnit, selectedLookId) : undefined;
  const switchableLooks = currentUnit ? visibleLooks(currentUnit) : [];

  // Gallery media selection
  const lookMediaUrls = currentLook?.media?.map((m) => m.url).filter(Boolean) ?? [];
  const unitMediaUrls = currentUnit?.media?.map((m) => m.url).filter(Boolean) ?? [];
  const propertyImages = property.image_urls ?? [];
  const images =
    lookMediaUrls.length > 0
      ? lookMediaUrls
      : unitMediaUrls.length > 0
        ? unitMediaUrls
        : propertyImages;

  const prevPhoto = () => {
    if (images.length < 2) return;
    setActivePhotoIdx((curr) => (curr - 1 + images.length) % images.length);
  };

  const nextPhoto = () => {
    if (images.length < 2) return;
    setActivePhotoIdx((curr) => (curr + 1) % images.length);
  };

  // Date picker & form refs
  const dateInputRef = useRef<any>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Capacity calculations
  const maxGuests = Math.max(currentUnit?.max_guests ?? 1, 1);
  const adults = adultCount;
  const children = childCount;
  const totalGuests = adults + children;

  const handleAdultsIncrement = () => {
    if (adultCount + childCount >= maxGuests) {
      setError(
        `${currentUnit?.name || "This room"} has a maximum capacity of ${maxGuests} guest${maxGuests === 1 ? "" : "s"
        }. Choose another room configuration above for more guests.`
      );
      return;
    }
    setError(null);
    setAdultCount((n) => n + 1);
  };

  const handleAdultsDecrement = () => {
    if (adultCount <= 1) {
      return;
    }
    setError(null);
    setAdultCount((n) => Math.max(1, n - 1));
  };

  const handleChildrenIncrement = () => {
    if (adultCount + childCount >= maxGuests) {
      setError(
        `${currentUnit?.name || "This room"} has a maximum capacity of ${maxGuests} guest${maxGuests === 1 ? "" : "s"
        }. Choose another room configuration above for more guests.`
      );
      return;
    }
    setError(null);
    setChildCount((n) => n + 1);
  };

  const handleChildrenDecrement = () => {
    if (childCount <= 0) {
      return;
    }
    setError(null);
    setChildCount((n) => Math.max(0, n - 1));
  };

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

  const rate = quoteQuery.data?.nightly_rate_paise ?? currentUnit?.nightly_rate_paise ?? 0;
  const estimate = quoteQuery.data?.total_quote_paise ?? rate * length;
  const quoteProblem = quoteQuery.error ? refusalMessage(quoteQuery.error, minimumLabel) : null;

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
        look_id: selectedLookId || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries-list"] });
      await queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
      setIsDuplicateEnquiry(false);
      setIsSuccess(true);
    },
    onError: (err: unknown) => {
      const apiErr = err as ApiErrorShape;
      const isDup =
        (isApiRequestError(err) && err.code === "duplicate_enquiry") ||
        apiErr?.code === "duplicate_enquiry" ||
        (typeof apiErr?.message === "string" &&
          apiErr.message.toLowerCase().includes("active enquiry already exists"));

      void queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries-list"] });
      void queryClient.invalidateQueries({ queryKey: ["my-stay-enquiries"] });
      if (isDup) {
        setIsDuplicateEnquiry(true);
      }
      setError(refusalMessage(err, minimumLabel));
    },
  });

  const handleSendEnquiry = () => {
    setError(null);
    const currentStatus = useAuthStore.getState().status;
    if (currentStatus !== "signedIn") {
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
    if (totalGuests > maxGuests) {
      setError(
        `${currentUnit?.name || "This room"} fits up to ${maxGuests} guest${maxGuests === 1 ? "" : "s"
        }. Please select another room or reduce guests.`
      );
      return;
    }
    enquiryMutation.mutate();
  };

  const amenities = property.amenities ?? [];
  const highlights = property.highlights ?? [];
  const reviews = property.reviews ?? [];
  const averageRating =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : property.average_rating
        ? Number(property.average_rating).toFixed(1)
        : null;

  const hostName =
    property.host_name ||
    property.partner?.business_name ||
    property.partner?.company_name ||
    property.partner?.full_name ||
    null;

  // Similar Stays Query
  const city = property.location_text ? property.location_text.split(",")[0]?.trim() : undefined;
  const { data: stays = [] } = useQuery({
    queryKey: ["similar-stays", property.id, city],
    queryFn: () => fetchStays({ location: city, limit: 6 }),
    staleTime: 60_000,
  });
  const similarStays = stays.filter((s) => s.id !== property.id).slice(0, 3);

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="min-h-screen justify-between"
      showsVerticalScrollIndicator
    >
      <View className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Top Back Navigation Breadcrumb matching Web Customer Portal 100% */}
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Back to Stays & PG"
            onPress={() => router.push("/stays")}
            className="flex-row items-center gap-1.5 -ml-1 px-1 py-1 cursor-pointer group"
          >
            <ArrowLeft size={15} color="#6B6560" />
            <Text className="text-sm font-bold text-[#6B6560] group-hover:text-navy-900">
              Back to Stays & PG
            </Text>
          </Pressable>
        </View>

        {/* Main 2-Column Responsive Layout */}
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
          {/* LEFT COLUMN: Photo Gallery, Info, Rooms, Amenities, Reviews */}
          {/* ========================================================= */}
          <View style={{ flex: 7, minWidth: 0 }} className="flex-col gap-6">
            {/* Inset Photo Gallery Carousel matching Web */}
            <View className="flex-col gap-2">
              <View className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl border border-line bg-surface-sunken">
                {images.length > 0 ? (
                  <Image
                    source={{ uri: images[activePhotoIdx] }}
                    contentFit="cover"
                    style={{ width: "100%", height: "100%" }}
                    transition={250}
                  />
                ) : (
                  <NoStayPhotos title={property.title} />
                )}

                {images.length > 1 ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Previous photo"
                      hitSlop={8}
                      onPress={prevPhoto}
                      className="absolute left-3 top-1/2 -translate-y-1/2 size-9 items-center justify-center rounded-full border border-line bg-white/90 shadow-xs hover:bg-white cursor-pointer active:scale-95"
                    >
                      <ChevronLeft size={16} color="#0F172A" />
                    </Pressable>

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Next photo"
                      hitSlop={8}
                      onPress={nextPhoto}
                      className="absolute right-3 top-1/2 -translate-y-1/2 size-9 items-center justify-center rounded-full border border-line bg-white/90 shadow-xs hover:bg-white cursor-pointer active:scale-95"
                    >
                      <ChevronRight size={16} color="#0F172A" />
                    </Pressable>

                    <View className="absolute bottom-3 right-3 rounded-lg border border-line bg-white/90 px-2 py-0.5 backdrop-blur-xs">
                      <Text className="text-[11px] font-bold text-navy-900">
                        {activePhotoIdx + 1}/{images.length}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>

              {/* Thumbnail strip */}
              {images.length > 1 ? (
                <View className="flex-row gap-2 pb-0.5">
                  {images.map((url: string, i: number) => {
                    const selected = i === activePhotoIdx;
                    return (
                      <Pressable
                        key={i}
                        onPress={() => setActivePhotoIdx(i)}
                        className={`h-16 w-20 overflow-hidden rounded-xl border-2 transition cursor-pointer ${selected
                            ? "border-[#EA580C] shadow-xs"
                            : "border-transparent opacity-75 hover:opacity-100"
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
                </View>
              ) : null}
            </View>

            {/* Room Look Switcher if multiple looks */}
            {currentLook && switchableLooks.length > 1 ? (
              <LookSwitcher
                looks={switchableLooks}
                selectedId={currentLook.id}
                roomStyle={property.room_style}
                onSelect={(lookId) => {
                  setSelectedLookId(lookId);
                  setActivePhotoIdx(0);
                }}
              />
            ) : null}

            {/* Main Property Info Card */}
            <View className="rounded-2xl border border-line bg-white p-6 shadow-xs">
              {/* Verified host badge */}
              <View className="flex-row items-center gap-1.5 self-start rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5">
                <ShieldCheck size={13} color="#059669" />
                <Text className="text-xs font-semibold text-emerald-700">
                  Verified host
                </Text>
              </View>

              {/* Title */}
              <Text className="mt-3 text-2xl sm:text-3xl font-extrabold text-navy-950">
                {property.title}
              </Text>

              {/* Host info: the listing's own host, or no line */}
              {hostName ? (
                <Text className="mt-1 text-xs text-slate-500 font-medium">
                  Hosted by <Text className="font-bold text-navy-900">{hostName}</Text>
                </Text>
              ) : null}

              {/* Location with MapPin */}
              {property.location_text ? (
                <View className="mt-2 flex-row items-center gap-1.5">
                  <MapPin size={14} color="#EA580C" />
                  <Text className="text-xs text-slate-500">
                    {property.location_text}
                  </Text>
                </View>
              ) : null}

              {/* Minimum stay */}
              {property.min_stay_nights && property.min_stay_nights > 1 ? (
                <View className="mt-2 flex-row items-center gap-1.5">
                  <Clock size={14} color="#EA580C" />
                  <Text className="text-xs text-slate-500">
                    Minimum stay: {stayLengthLabel(property.min_stay_nights, period)}
                  </Text>
                </View>
              ) : null}

              {/* About this stay */}
              {property.description?.trim() ? (
                <View className="mt-6 border-t border-slate-100 pt-5">
                  <Text className="text-sm font-bold text-navy-950">
                    About this stay
                  </Text>
                  <Text className="mt-2 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
                    {property.description}
                  </Text>
                </View>
              ) : null}

              {/* Highlights / About this place */}
              {highlights.length > 0 ? (
                <View className="mt-6 border-t border-slate-100 pt-5">
                  <Text className="text-sm font-bold text-navy-950">
                    About this place
                  </Text>
                  <View className="mt-3 flex-row flex-wrap">
                    {highlights.map((h, i) => (
                      <View key={i} className="w-1/2 py-1.5 pr-2">
                        <Text className="text-[11px] text-slate-400">{h.label}</Text>
                        <Text className="text-xs font-bold text-navy-900">{h.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Available Room Configurations */}
              <View className="mt-6 border-t border-slate-100 pt-5">
                <Text className="text-sm font-bold text-navy-950">
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
                        className={`flex-row items-center justify-between rounded-xl border p-3.5 transition cursor-pointer ${isSelected
                            ? "border-[#EA580C] bg-[#FFF8F3]"
                            : "border-slate-200 bg-[#FAF8F5] hover:border-slate-400"
                          }`}
                      >
                        <View className="flex-1 pr-2">
                          <Text className="text-sm font-bold text-navy-950">
                            {unit.name}
                          </Text>
                          <Text className="text-xs text-slate-500">
                            {roomOccupancyLabel(unit, property.room_style)}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-base font-extrabold text-[#EA580C]">
                            {formatPaise(unit.nightly_rate_paise)}
                          </Text>
                          <Text className="text-[10px] text-slate-500">
                            {period === "NIGHT" ? "per night" : "per month"}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Amenities */}
              <View className="mt-6 border-t border-slate-100 pt-5">
                <Text className="text-sm font-bold text-navy-950">Amenities</Text>
                {amenities.length > 0 ? (
                  <View className="mt-3 flex-row flex-wrap gap-2.5">
                    {amenities.map((amenity) => {
                      const Icon = getAmenityIcon(amenity.key);
                      return (
                        <View
                          key={amenity.key}
                          className="flex-row items-center gap-2 rounded-xl border border-slate-200 bg-[#FAF8F5] px-3 py-2"
                        >
                          <Icon size={14} color="#EA580C" />
                          <Text className="text-xs font-medium text-navy-900">
                            {amenity.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text className="mt-2 text-xs text-slate-500">
                    The host hasn&apos;t listed amenities. Ask when they call you.
                  </Text>
                )}
              </View>
            </View>

            {/* How enquiries work Card */}
            <View className="rounded-2xl border border-line bg-white p-6 shadow-xs gap-2.5">
              <View className="flex-row items-center gap-2">
                <CheckCircle2 size={16} color="#059669" />
                <Text className="text-sm font-bold text-navy-950">
                  How enquiries work
                </Text>
              </View>
              <Text className="text-xs leading-relaxed text-slate-600">
                Send your dates. The host sees your name and phone number and calls you to
                confirm. Nothing is paid online, and you can withdraw any time before the host
                confirms.
              </Text>
            </View>

            {/* House Rules & Guidelines Card */}
            {property.house_rules?.trim() ? (
              <View className="rounded-2xl border border-line bg-white p-6 shadow-xs gap-2.5">
                <View className="flex-row items-center gap-2">
                  <FileText size={16} color="#EA580C" />
                  <Text className="text-sm font-bold text-navy-950">
                    House Rules & Guidelines
                  </Text>
                </View>
                <Text className="text-xs leading-relaxed text-slate-600 whitespace-pre-line">
                  {property.house_rules}
                </Text>
              </View>
            ) : null}

            {/* Guest Reviews Card */}
            <View className="rounded-2xl border border-line bg-white p-6 shadow-xs gap-3">
              <View className="flex-row items-center justify-between border-b border-slate-100 pb-3">
                <View className="flex-row items-center gap-2">
                  <Star size={18} color="#F59E0B" fill="#F59E0B" />
                  <Text className="text-sm font-extrabold text-navy-950">
                    {averageRating
                      ? `${averageRating} · ${reviews.length} Review${reviews.length === 1 ? "" : "s"
                      }`
                      : "Guest Reviews"}
                  </Text>
                </View>

                {property.can_review ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setReviewOpen(true)}
                    className="flex-row items-center gap-1.5 rounded-xl border border-slate-200 bg-[#FAF8F5] px-3 py-1.5 hover:bg-slate-100 cursor-pointer"
                  >
                    <MessageSquare size={13} color="#0F172A" />
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
                      className="gap-1.5 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-bold text-navy-900">
                          {rev.customer_name || "Verified Guest"}
                        </Text>
                        <View className="flex-row items-center gap-0.5">
                          {Array.from({ length: rev.rating ?? 5 }).map((_, i) => (
                            <Star key={i} size={12} color="#F59E0B" fill="#F59E0B" />
                          ))}
                        </View>
                      </View>

                      {rev.comment ? (
                        <Text className="text-xs leading-relaxed text-slate-600">
                          {rev.comment}
                        </Text>
                      ) : null}

                      {rev.image_urls && rev.image_urls.length > 0 ? (
                        <View className="flex-row flex-wrap gap-2 pt-1">
                          {rev.image_urls.map((photoUrl: string, pIdx: number) => (
                            <View
                              key={pIdx}
                              className="size-16 overflow-hidden rounded-xl border border-line"
                            >
                              <Image
                                source={{ uri: photoUrl }}
                                contentFit="cover"
                                style={{ width: "100%", height: "100%" }}
                              />
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="py-1 text-xs text-slate-500">
                  No guest reviews yet.
                </Text>
              )}
            </View>
          </View>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: STICKY "SEND AN ENQUIRY" CARD (Scrolls Along) */}
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
            <View className="rounded-2xl border border-[#E5E1DC] bg-white p-6 shadow-md flex-col gap-4">
              {/* Header */}
              <View className="flex-row items-center justify-between">
                <Text className="text-xl font-bold text-navy-950">Send an enquiry</Text>
                <View className="flex-row items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
                  <ShieldCheck size={13} color="#059669" />
                  <Text className="text-xs font-semibold text-emerald-700">Verified host</Text>
                </View>
              </View>
              <Text className="text-xs text-slate-500 -mt-2">
                The host calls you to talk it through. Nothing is paid here.
              </Text>

              {/* Already active enquiry alert if submitted */}
              {(existingEnquiry || isDuplicateEnquiry) && !showNewEnquiryForm ? (
                <View className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 gap-2">
                  <View className="flex-row items-center gap-2">
                    <CheckCircle2 size={16} color="#059669" />
                    <Text className="text-sm font-bold text-emerald-900">Enquiry Active</Text>
                  </View>
                  <Text className="text-xs text-emerald-700 leading-relaxed">
                    You have already sent an enquiry for this stay. The host will call you soon.
                  </Text>
                  <View className="flex-row gap-2 pt-2">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push("/activity?type=stays")}
                      className="rounded-lg bg-emerald-700 px-3.5 py-1.5 cursor-pointer"
                    >
                      <Text className="text-xs font-bold text-white">View in Activity</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setShowNewEnquiryForm(true)}
                      className="rounded-lg border border-emerald-300 px-3 py-1.5 cursor-pointer"
                    >
                      <Text className="text-xs font-semibold text-emerald-800">Send another</Text>
                    </Pressable>
                  </View>
                </View>
              ) : isSuccess ? (
                <View className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 gap-2 items-center text-center">
                  <CheckCircle2 size={32} color="#059669" />
                  <Text className="text-base font-bold text-emerald-900">Enquiry Sent!</Text>
                  <Text className="text-xs text-emerald-700 text-center leading-relaxed">
                    The host has received your details and will call you soon to confirm availability.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/activity?type=stays")}
                    className="mt-2 rounded-xl bg-[#EA580C] px-5 py-2 cursor-pointer"
                  >
                    <Text className="text-xs font-bold text-white">View Enquiry Status</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Room Selection Options matching Web */}
                  {units.length > 1 ? (
                    <View className="flex-col gap-1.5">
                      <Text className="text-xs font-bold text-navy-950">Room</Text>
                      <View className="gap-2">
                        {units.map((unit) => {
                          const isSelected = currentUnitId === unit.id;
                          return (
                            <Pressable
                              key={unit.id}
                              accessibilityRole="button"
                              onPress={() => {
                                setSelectedUnitId(unit.id);
                                setSelectedLookId("");
                                setError(null);
                              }}
                              className={`flex-row items-center justify-between rounded-xl border p-3 transition cursor-pointer ${isSelected
                                  ? "border-[#EA580C] bg-[#FFF8F3]"
                                  : "border-slate-200 bg-white hover:border-slate-400"
                                }`}
                            >
                              <View>
                                <Text
                                  className={`text-xs font-bold ${isSelected ? "text-[#EA580C]" : "text-navy-950"
                                    }`}
                                >
                                  {unit.name}
                                </Text>
                                <Text className="text-[10px] text-slate-500">
                                  {roomOccupancyLabel(unit, property.room_style)}
                                </Text>
                              </View>
                              <Text className="text-xs font-extrabold text-[#EA580C]">
                                {formatRate(unit.nightly_rate_paise, period)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : (
                    <View className="rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2.5 flex-row items-center justify-between">
                      <Text className="text-xs text-slate-600">
                        You&apos;re asking about{" "}
                        <Text className="font-bold text-navy-950">
                          {currentUnit?.name || "Room"}
                        </Text>
                      </Text>
                      <Text className="text-xs font-extrabold text-[#EA580C]">
                        {formatRate(currentUnit?.nightly_rate_paise ?? 0, period)}
                      </Text>
                    </View>
                  )}

                  {/* Date and Length row */}
                  <View className="flex-row gap-3">
                    {/* Move-in / Check-in date */}
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5 mb-1.5">
                        <Calendar size={13} color="#6B7280" />
                        <Text className="text-xs font-bold text-navy-950">
                          {monthly ? "Move-in date" : "Check-in date"}
                        </Text>
                      </View>
                      {Platform.OS === "web" ? (
                        <div
                          onClick={() => {
                            try {
                              dateInputRef.current?.showPicker?.();
                            } catch {
                              dateInputRef.current?.focus?.();
                            }
                          }}
                          className="relative flex items-center justify-between rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2.5 cursor-pointer hover:border-slate-400 transition"
                        >
                          <span className="text-sm font-medium text-navy-950 select-none">
                            {formatToIndianDate(checkIn)}
                          </span>
                          <Calendar size={16} color="#6B7280" className="pointer-events-none" />
                          <input
                            ref={dateInputRef}
                            type="date"
                            value={checkIn}
                            min={todayIso()}
                            onChange={(e) => {
                              if (e.target.value) {
                                setCheckIn(e.target.value);
                                setError(null);
                              }
                            }}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              opacity: 0,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                      ) : (
                        <Pressable
                          onPress={() => setDatePickerOpen(true)}
                          className="flex-row items-center justify-between rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2.5 active:bg-[#F2EFE9]"
                        >
                          <Text className="text-sm font-medium text-navy-950">
                            {formatToIndianDate(checkIn)}
                          </Text>
                          <Calendar size={16} color="#6B7280" />
                        </Pressable>
                      )}
                    </View>

                    {/* For how many months / nights */}
                    <View className="flex-1">
                      <Text className="text-xs font-bold text-navy-950 mb-1.5">
                        {monthly ? "For how many months" : "For how many nights"}
                      </Text>
                      <View className="flex-row items-center rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-2 py-1">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Decrease stay duration"
                          onPress={() => {
                            const next = Math.max(minimum, length - 1);
                            setLength(next);
                            setLengthText(String(next));
                            setError(null);
                          }}
                          className="size-7 items-center justify-center rounded-lg bg-white border border-slate-200 hover:border-slate-400 active:scale-95 cursor-pointer"
                        >
                          <Text className="text-xs font-bold text-navy-900">–</Text>
                        </Pressable>
                        <TextInput
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
                          keyboardType="numeric"
                          className="flex-1 text-center py-1 text-sm font-semibold text-navy-900"
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Increase stay duration"
                          onPress={() => {
                            const next = Math.min(maxLength, length + 1);
                            setLength(next);
                            setLengthText(String(next));
                            setError(null);
                          }}
                          className="size-7 items-center justify-center rounded-lg bg-white border border-slate-200 hover:border-slate-400 active:scale-95 cursor-pointer"
                        >
                          <Text className="text-xs font-bold text-navy-900">+</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>

                  {/* Guests */}
                  <View className="gap-2">
                    <View className="flex-row items-center gap-1.5">
                      <Users size={13} color="#6B7280" />
                      <Text className="text-xs font-bold text-navy-950">Guests</Text>
                    </View>

                    {/* Adults row */}
                    <View className="flex-row items-center justify-between rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2">
                      <View>
                        <Text className="text-sm font-semibold text-navy-950">Adults</Text>
                        <Text className="text-[11px] text-slate-500">Age 13+</Text>
                      </View>
                      <View className="flex-row items-center gap-3">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Decrease adults"
                          onPress={handleAdultsDecrement}
                          className={`size-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:border-slate-400 active:scale-95 cursor-pointer ${adultCount <= 1 ? "opacity-50" : ""
                            }`}
                        >
                          <Text className="text-sm font-bold text-navy-950">–</Text>
                        </Pressable>
                        <Text className="w-5 text-center text-sm font-bold text-navy-950 tabular-nums">
                          {adultCount}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Increase adults"
                          onPress={handleAdultsIncrement}
                          className={`size-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:border-slate-400 active:scale-95 cursor-pointer ${totalGuests >= maxGuests ? "opacity-50" : ""
                            }`}
                        >
                          <Text className="text-sm font-bold text-navy-950">+</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Children row */}
                    <View className="flex-row items-center justify-between rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] px-3.5 py-2">
                      <View>
                        <Text className="text-sm font-semibold text-navy-950">Children</Text>
                        <Text className="text-[11px] text-slate-500">Under 13</Text>
                      </View>
                      <View className="flex-row items-center gap-3">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Decrease children"
                          onPress={handleChildrenDecrement}
                          className={`size-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:border-slate-400 active:scale-95 cursor-pointer ${childCount <= 0 ? "opacity-50" : ""
                            }`}
                        >
                          <Text className="text-sm font-bold text-navy-950">–</Text>
                        </Pressable>
                        <Text className="w-5 text-center text-sm font-bold text-navy-950 tabular-nums">
                          {childCount}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Increase children"
                          onPress={handleChildrenIncrement}
                          className={`size-8 items-center justify-center rounded-full border border-slate-300 bg-white hover:border-slate-400 active:scale-95 cursor-pointer ${totalGuests >= maxGuests ? "opacity-50" : ""
                            }`}
                        >
                          <Text className="text-sm font-bold text-navy-950">+</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View className="flex-row items-center justify-between px-1">
                      <Text className="text-xs text-slate-500">
                        {totalGuests} guest{totalGuests === 1 ? "" : "s"} total
                        {maxGuests > 1 ? ` · room fits up to ${maxGuests}` : ""}
                      </Text>
                      {totalGuests >= maxGuests && (
                        <View className="rounded-full bg-amber-50 px-2 py-0.5 border border-amber-200">
                          <Text className="text-[10px] font-semibold text-amber-800">
                            Max {maxGuests} guest{maxGuests === 1 ? "" : "s"}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Message to Host */}
                  <View>
                    <Text className="text-xs font-bold text-navy-950 mb-1.5">
                      Message to the host (optional)
                    </Text>
                    <TextInput
                      value={message}
                      onChangeText={setMessage}
                      placeholder="e.g. Working professional, can visit this weekend."
                      placeholderTextColor="#94A3B8"
                      multiline
                      numberOfLines={3}
                      className="rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3 text-sm text-navy-900 min-h-[64px]"
                      style={{ textAlignVertical: "top" }}
                    />
                  </View>

                  {/* Pricing Breakdown Box matching Web */}
                  <View className="rounded-xl border border-[#E5E1DC] bg-[#FAF8F5] p-3.5 gap-2">
                    <View className="flex-row items-baseline justify-between border-b border-[#E5E1DC]/60 pb-2">
                      <Text className="text-xs text-slate-600">
                        {formatPaise(rate)}/{monthly ? "month" : "night"} × {length}{" "}
                        {monthly
                          ? length === 1
                            ? "month"
                            : "months"
                          : length === 1
                            ? "night"
                            : "nights"}
                      </Text>
                      <Text className="text-base font-extrabold text-navy-950">
                        about {formatPaise(estimate)}
                      </Text>
                    </View>

                    <View className="flex-row items-start gap-2 pt-0.5">
                      <Phone size={13} color="#94A3B8" style={{ marginTop: 2 }} />
                      <Text className="flex-1 text-[11px] leading-relaxed text-slate-500">
                        Your name and phone number are shared with the host so they can call
                        you.
                      </Text>
                    </View>

                    <View className="flex-row items-start gap-2">
                      <Info size={13} color="#94A3B8" style={{ marginTop: 2 }} />
                      <Text className="flex-1 text-[11px] leading-relaxed text-slate-500">
                        An estimate only — you agree the final price and payment with the host.
                      </Text>
                    </View>
                  </View>

                  {/* Error Notification */}
                  {error || quoteProblem ? (
                    <View className="rounded-xl border border-red-200 bg-red-50 p-3 flex-row items-center gap-2">
                      <AlertCircle size={15} color="#DC2626" />
                      <Text className="text-xs font-semibold text-red-700 flex-1">
                        {error ?? quoteProblem}
                      </Text>
                    </View>
                  ) : null}

                  {/* Orange Submit Button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Send enquiry"
                    disabled={enquiryMutation.isPending}
                    onPress={handleSendEnquiry}
                    className={`w-full items-center justify-center rounded-xl bg-[#EA580C] hover:bg-[#D94E08] py-3.5 active:bg-[#C2410C] cursor-pointer shadow-sm transition ${enquiryMutation.isPending ? "opacity-70 cursor-not-allowed" : ""
                      }`}
                  >
                    {enquiryMutation.isPending ? (
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text className="text-sm font-bold text-white">Sending enquiry…</Text>
                      </View>
                    ) : (
                      <Text className="text-sm font-bold text-white">Send enquiry</Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Similar Stays You May Like Section matching Web Customer Portal */}
        {similarStays.length > 0 && (
          <View className="mt-12 border-t border-slate-200/80 pt-8">
            <View className="flex-row items-center justify-between mb-6">
              <View>
                <Text className="text-xl font-bold text-navy-950">
                  Similar Stays You May Like
                </Text>
                <Text className="mt-0.5 text-xs text-slate-500">
                  Other verified rooms and accommodation in this area
                </Text>
              </View>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push("/stays")}
                className="cursor-pointer"
              >
                <Text className="text-xs font-bold text-[#EA580C] hover:underline">
                  View all stays →
                </Text>
              </Pressable>
            </View>

            <View className="flex-row flex-wrap -mx-2.5">
              {similarStays.map((item) => (
                <View
                  key={item.id}
                  className="w-full md:w-[calc(50%-1.25rem)] lg:w-[calc(33.333%-1.25rem)] m-2.5"
                >
                  <StayCard property={item} />
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* Review submission sheet modal */}
      <StayReviewSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        propertyId={property.id}
        onSuccess={() => {
          setReviewOpen(false);
          void queryClient.invalidateQueries({
            queryKey: ["stay-property", property.slug || property.id],
          });
        }}
      />

      {/* Login sheet if not signed in */}
      <CustomerLoginSheet
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={() => {
          setLoginOpen(false);
          handleSendEnquiry();
        }}
      />

      {/* Date Picker Modal for touch devices */}
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

      {/* Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}

