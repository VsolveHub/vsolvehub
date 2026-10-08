import { useQuery } from "@tanstack/react-query";
import { Badge, Button, ErrorState, Skeleton, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Clock,
  FileText,
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
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  formatPaise,
  formatRate,
  pricePeriodOf,
  roomOccupancyLabel,
  stayLengthLabel,
  type StayProperty,
  type StayUnit,
} from "../model";
import { fetchStayProperty, fetchStays } from "../queries";
import { getAmenityIcon } from "./amenity-icon";
import { StayCard } from "./stay-card";
import { StayEnquirySheet } from "./stay-enquiry-sheet";
import { StayReviewSheet } from "./stay-review-sheet";
import { StayVisitSheet } from "./stay-visit-sheet";

const FALLBACK_STAY_IMAGE =
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=800&auto=format&fit=crop";

export function StayDetailScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  const {
    data: property,
    isLoading,
    error,
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
      <View className="flex-1 bg-canvas p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-4 h-64 w-full rounded-2xl" />
        <Skeleton className="mt-4 h-12 w-3/4" />
        <Skeleton className="mt-4 h-32 w-full rounded-2xl" />
      </View>
    );
  }

  if (error || !property) {
    return (
      <View className="flex-1 bg-canvas p-6 justify-center">
        <ErrorState
          title="Property not available"
          message={
            error
              ? (error as Error).message
              : "This property does not exist or has been removed."
          }
          actionLabel="Retry"
          onAction={() => void refetch()}
        />
      </View>
    );
  }

  const period = pricePeriodOf(property.price_period);
  const units = (property.units || []) as StayUnit[];
  const currentUnit = units.find((u) => u.id === selectedUnitId) || units[0];

  // W-012: Gallery photos switch to unit media if available
  const unitMediaUrls = (currentUnit as any)?.media?.map((m: any) => m.url) ?? [];
  const propertyImages =
    property.image_urls && property.image_urls.length > 0
      ? property.image_urls
      : [FALLBACK_STAY_IMAGE];
  const images = unitMediaUrls.length > 0 ? unitMediaUrls : propertyImages;

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

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        className="flex-1"
        contentContainerClassName="pb-36"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        {/* Photo Gallery Carousel (W-012) */}
        <View className="relative h-72 w-full bg-[#00112e]">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const offset = e.nativeEvent.contentOffset.x;
              const width = e.nativeEvent.layoutMeasurement.width;
              if (width > 0) {
                setActivePhotoIdx(Math.round(offset / width));
              }
            }}
          >
            {images.map((url: string, idx: number) => (
              <Pressable
                key={idx}
                onPress={() => setFullscreenPhoto(url)}
                className="h-72 w-screen"
              >
                <Image
                  source={{ uri: url }}
                  contentFit="cover"
                  style={{ width: "100%", height: "100%" }}
                />
              </Pressable>
            ))}
          </ScrollView>

          {/* Back button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Stays"
            onPress={() => router.back()}
            className="absolute left-4 top-4 size-10 items-center justify-center rounded-full bg-navy-950/70 backdrop-blur-md active:bg-navy-950"
          >
            <ArrowLeft size={18} color="#ffffff" />
          </Pressable>

          {/* Photo Counter */}
          {images.length > 1 ? (
            <View className="absolute bottom-3 right-3 rounded-full bg-navy-950/80 px-2.5 py-1 backdrop-blur-xs">
              <Text className="text-[10px] font-bold text-white">
                {activePhotoIdx + 1} / {images.length} photos
              </Text>
            </View>
          ) : null}
        </View>

        <View className="gap-6 p-4">
          {/* Property Header (W-013) */}
          <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
            {/* Badges */}
            <View className="flex-row items-center gap-2">
              <View className="flex-row items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5">
                <ShieldCheck size={12} color="#059669" />
                <Text className="text-[10px] font-bold text-emerald-800">
                  Verified host
                </Text>
              </View>

              {property.tenant_preference ? (
                <View className="rounded-full bg-surface-sunken border border-line px-2.5 py-0.5">
                  <Text className="text-[10px] font-bold text-navy-900 capitalize">
                    {property.tenant_preference.replaceAll("_", " ").toLowerCase()}
                  </Text>
                </View>
              ) : null}

              {averageRating ? (
                <View className="flex-row items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5">
                  <Star size={11} color="#f59e0b" fill="#f59e0b" />
                  <Text className="text-xs font-bold text-amber-700">
                    {averageRating}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Title */}
            <Text className="text-xl font-black text-navy-900 sm:text-2xl">
              {property.title}
            </Text>

            {/* Host info (W-013) */}
            <Text className="text-xs text-text-secondary">
              Hosted by{" "}
              <Text className="font-bold text-navy-900">
                {property.host_name || property.partner?.business_name || "Verified Host"}
              </Text>
            </Text>

            {/* Location */}
            {property.location_text ? (
              <View className="flex-row items-center gap-1.5 pt-0.5">
                <MapPin size={13} color="#ea580c" />
                <Text className="text-xs font-medium text-text-secondary">
                  {property.location_text}
                </Text>
              </View>
            ) : null}

            {/* Minimum Stay Pill (W-013) */}
            {property.min_stay_nights && property.min_stay_nights > 1 ? (
              <View className="flex-row items-center gap-1.5 pt-0.5">
                <Clock size={13} color="#ea580c" />
                <Text className="text-xs font-semibold text-text-secondary">
                  Minimum stay:{" "}
                  {stayLengthLabel(property.min_stay_nights, period)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* "About this stay" Description */}
          {property.description?.trim() ? (
            <View className="gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xs">
              <Text className="text-sm font-bold text-navy-900">
                About this stay
              </Text>
              <Text className="text-xs leading-relaxed text-text-secondary whitespace-pre-line">
                {property.description}
              </Text>
            </View>
          ) : null}

          {/* Highlights Grid (W-014: "About this place") */}
          {highlights.length > 0 ? (
            <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
              <Text className="text-sm font-bold text-navy-900">
                About this place
              </Text>
              <View className="flex-row flex-wrap">
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
          ) : null}

          {/* Room Units */}
          {units.length > 0 ? (
            <View className="gap-3">
              <Text className="text-base font-extrabold text-navy-900">
                Available Room Configurations
              </Text>
              <View className="gap-2.5">
                {units.map((unit) => {
                  const isSelected = (selectedUnitId || units[0]?.id) === unit.id;
                  return (
                    <Pressable
                      key={unit.id}
                      onPress={() => {
                        setSelectedUnitId(unit.id);
                        setEnquiryOpen(true);
                      }}
                      className={`overflow-hidden rounded-2xl border p-4 ${
                        isSelected
                          ? "border-brand bg-brand/5 shadow-xs"
                          : "border-line bg-surface active:bg-surface-hover"
                      }`}
                    >
                      <View className="flex-row items-start justify-between">
                        <View className="gap-1 flex-1 pr-2">
                          <Text className="text-sm font-bold text-navy-900">
                            {unit.name}
                          </Text>
                          <Text className="text-xs text-text-secondary">
                            {roomOccupancyLabel(unit, property.room_style)}
                          </Text>
                          {unit.max_guests ? (
                            <View className="flex-row items-center gap-1 pt-1">
                              <Users size={11} color="#6B6560" />
                              <Text className="text-[10px] text-text-muted">
                                Capacity: {unit.max_guests} guest(s)
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <View className="items-end">
                          <Text className="text-base font-black text-navy-900">
                            {formatRate(unit.nightly_rate_paise, period)}
                          </Text>
                          <Text className="mt-2 text-xs font-bold text-brand">
                            Enquire room →
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Amenities with Lucide Icons */}
          <View className="gap-2.5 rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <Text className="text-sm font-bold text-navy-900">Amenities</Text>
            {amenities.length > 0 ? (
              <View className="flex-row flex-wrap gap-2 pt-1">
                {amenities.map((amenity) => {
                  const Icon = getAmenityIcon(amenity.key);
                  return (
                    <View
                      key={amenity.key}
                      className="flex-row items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2"
                    >
                      <Icon size={14} color="#ea580c" />
                      <Text className="text-xs font-medium text-navy-900">
                        {amenity.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text className="text-xs text-text-secondary">
                The host hasn't listed amenities. Ask when they call you.
              </Text>
            )}
          </View>

          {/* How enquiries work banner (W-016) */}
          <View className="gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <View className="flex-row items-center gap-2">
              <CheckCircle2 size={16} color="#059669" />
              <Text className="text-sm font-bold text-navy-900">
                How enquiries work
              </Text>
            </View>
            <Text className="text-xs leading-relaxed text-text-secondary">
              Send your dates. The host sees your name and phone number and calls
              you to confirm. Nothing is paid online, and you can withdraw any
              time before the host confirms.
            </Text>
          </View>

          {/* House Rules & Policies */}
          {property.house_rules?.trim() ? (
            <View className="gap-2 rounded-2xl border border-line bg-surface p-4 shadow-xs">
              <View className="flex-row items-center gap-2">
                <FileText size={15} color="#ea580c" />
                <Text className="text-sm font-bold text-navy-900">
                  House Rules & Guidelines
                </Text>
              </View>
              <Text className="text-xs leading-relaxed text-text-secondary whitespace-pre-line">
                {property.house_rules}
              </Text>
            </View>
          ) : null}

          {/* Guest Reviews Section (GAP-S-09) */}
          <View className="gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
            <View className="flex-row items-center justify-between border-b border-line pb-3">
              <View className="flex-row items-center gap-2">
                <Star size={18} color="#f59e0b" fill="#f59e0b" />
                <Text className="text-sm font-extrabold text-navy-900">
                  {averageRating
                    ? `${averageRating} · ${reviews.length} Review${
                        reviews.length === 1 ? "" : "s"
                      }`
                    : "Guest Reviews"}
                </Text>
              </View>

              {property.can_review ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onPress={() => setReviewOpen(true)}
                  className="rounded-xl px-3 py-1.5"
                >
                  <View className="flex-row items-center gap-1.5">
                    <MessageSquare size={13} color="#00112e" />
                    <Text className="text-xs font-bold text-navy-900">
                      Write a review
                    </Text>
                  </View>
                </Button>
              ) : null}
            </View>

            {reviews.length > 0 ? (
              <View className="gap-4 pt-1">
                {reviews.map((rev: any, idx: number) => (
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
                            color="#f59e0b"
                            fill="#f59e0b"
                          />
                        ))}
                      </View>
                    </View>

                    {rev.comment ? (
                      <Text className="text-xs leading-relaxed text-text-secondary">
                        {rev.comment}
                      </Text>
                    ) : null}

                    {/* Review Photo Thumbnails (tap-to-zoom) */}
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
              <Text className="py-2 text-xs text-text-secondary">
                No guest reviews yet.
              </Text>
            )}
          </View>

          {/* Similar Stays Section (GAP-S-14) */}
          <SimilarStaysSection
            currentPropertyId={property.id}
            location={property.location_text}
          />
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        className="absolute bottom-0 left-0 right-0 border-t border-line bg-surface px-4 pt-3 shadow-raised"
      >
        <View className="flex-row items-center gap-3">
          {property.visits_offered !== false ? (
            <Button
              size="lg"
              variant="secondary"
              onPress={() => setVisitOpen(true)}
              className="flex-1 rounded-xl"
            >
              Visit Property
            </Button>
          ) : null}

          <Button
            size="lg"
            variant="primary"
            onPress={() => {
              if (!selectedUnitId && units.length > 0) {
                setSelectedUnitId(units[0]!.id);
              }
              setEnquiryOpen(true);
            }}
            className="flex-1 rounded-xl"
          >
            Contact Host
          </Button>
        </View>
      </View>

      {/* Live Quote & Enquiry Sheet (GAP-S-01) */}
      <StayEnquirySheet
        property={property}
        unitId={selectedUnitId}
        open={enquiryOpen}
        onOpenChange={setEnquiryOpen}
      />

      {/* Schedule a Visit Sheet (W-020) */}
      <StayVisitSheet
        property={property}
        initialUnitId={selectedUnitId}
        open={visitOpen}
        onOpenChange={setVisitOpen}
      />

      {/* Write a Review Sheet (GAP-S-09) */}
      <StayReviewSheet
        propertyId={property.id}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onSuccess={() => void refetch()}
      />

      {/* Fullscreen Photo Modal Viewer (W-012) */}
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
            <X size={20} color="#ffffff" />
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
    </View>
  );
}

/**
 * Similar Stays Recommendations (GAP-S-14)
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
    <View className="gap-3 border-t border-line/70 pt-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-base font-extrabold text-navy-900">
            Similar Stays You May Like
          </Text>
          <Text className="text-[11px] text-text-secondary">
            Other verified rooms and accommodation in this area
          </Text>
        </View>

        <Pressable onPress={() => router.push("/stays" as never)}>
          <Text className="text-xs font-bold text-brand">View all →</Text>
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
