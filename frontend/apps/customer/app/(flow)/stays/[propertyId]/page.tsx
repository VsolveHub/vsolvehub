"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Building,
  Car,
  CheckCircle2,
  Clock,
  Coffee,
  FileText,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Star,
  Wifi,
  Wind,
  Zap,
} from "lucide-react";
import { Badge, Button, Dialog, ErrorState, Skeleton, Textarea } from "@vsolve/ui";

import { formatPaise, pricePeriodOf, stayFields, stayLengthLabel } from "@/features/stays/model";
import { fetchStayProperty, fetchStays, submitStayReview } from "@/features/stays/queries";
import { StayCard, StayImageGallery, StayQuotePanel } from "@/features/stays/view";


export default function StayDetailPage() {
  const params = useParams<{ propertyId: string }>();
  const propertyId = params.propertyId;
  const queryClient = useQueryClient();

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);

  const {
    data: property,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stay-property", propertyId],
    queryFn: () => fetchStayProperty(propertyId),
    enabled: Boolean(propertyId),
  });

  const reviewMutation = useMutation({
    mutationFn: () =>
      submitStayReview({
        property_id: propertyId,
        rating: reviewRating,
        comment: reviewComment,
      }),
    onSuccess: () => {
      setReviewModalOpen(false);
      setReviewComment("");
      setReviewError(null);
      queryClient.invalidateQueries({ queryKey: ["stay-property", propertyId] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to submit review.";
      setReviewError(msg);
    },
  });

  if (isLoading) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="aspect-[16/10] w-full rounded-[var(--radius-card)]" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </main>
    );
  }

  if (error || !property) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
        <ErrorState
          title="Property not available"
          message={error ? (error as Error).message : "This property does not exist or has been removed."}
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </main>
    );
  }

  const fields = stayFields(property.structured_fields);
  const isAc = Boolean(fields.ac);
  const hasFood = Boolean(fields.food);
  const hasWifi = Boolean(fields.wifi);
  const hasPower = Boolean(fields.power_backup);
  const hasCctv = Boolean(fields.cctv || fields.security);
  const hasHousekeeping = Boolean(fields.housekeeping || fields.daily_housekeeping);
  const hasParking = Boolean(fields.parking);

  const hasAnyAmenities = isAc || hasFood || hasWifi || hasPower || hasCctv || hasHousekeeping || hasParking;
  const isVerified = property.public_state === "PUBLISHED" || property.moderation_status === "APPROVED";

  const reviews = property.reviews ?? [];
  const averageRating =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length).toFixed(1)
      : null;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      {/* Top back navigation */}
      <nav aria-label="Breadcrumb">
        <Link
          href="/stays"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-text-secondary hover:text-text transition"
        >
          <ArrowLeft className="size-3.5" />
          Back to Stays & PG
        </Link>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Property Details & Amenities */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <StayImageGallery media={property.media} title={property.title} />

          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs">
            {isVerified && (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand" className="inline-flex items-center gap-1.5 text-xs font-bold">
                  <Building className="size-3" />
                  Verified Stay
                </Badge>
                <Badge tone="success" className="inline-flex items-center gap-1 text-xs font-bold">
                  <ShieldCheck className="size-3.5" />
                  Verified Host
                </Badge>
              </div>
            )}

            <h1 className="mt-3 text-2xl font-extrabold text-text sm:text-3xl">
              {property.title}
            </h1>

            <p className="mt-1 text-xs text-text-secondary font-medium">
              Hosted by <strong className="text-text font-bold">{property.host_name}</strong>
            </p>

            {property.location_text && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
                <MapPin className="size-3.5 shrink-0 text-action" />
                <span>{property.location_text}</span>
              </div>
            )}

            {property.min_stay_nights && property.min_stay_nights > 1 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
                <Clock className="size-3.5 shrink-0 text-brand" />
                <span>
                  Minimum stay:{" "}
                  {stayLengthLabel(property.min_stay_nights, pricePeriodOf(property.price_period))}
                </span>
              </div>
            )}

            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">About This Stay</h2>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-line">
                {property.description || "Clean, verified accommodation designed for comfort and accessibility."}
              </p>
            </div>

            {/* Room Units */}
            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">Available Room Configurations</h2>
              <div className="mt-3 grid gap-3">
                {property.units.map((unit) => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between rounded-control border border-line bg-surface-sunken p-3.5"
                  >
                    <div>
                      <div className="text-sm font-bold text-text">{unit.name}</div>
                      <div className="text-xs text-text-secondary">
                        {unit.sharing_count === 1
                          ? "Single occupancy / Private"
                          : `${unit.sharing_count} Persons Sharing`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-extrabold text-action">
                        {formatPaise(unit.nightly_rate_paise)}
                      </div>
                      <div className="text-[10px] text-text-secondary">
                        {pricePeriodOf(property.price_period) === "NIGHT" ? "per night" : "per month"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Amenities Grid */}
            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">Property Amenities</h2>
              {hasAnyAmenities ? (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-text">
                  {hasWifi && (
                    <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                      <Wifi className="size-4 text-action" />
                      <span>High-Speed WiFi</span>
                    </div>
                  )}
                  {isAc && (
                    <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                      <Wind className="size-4 text-action" />
                      <span>Air Conditioning</span>
                    </div>
                  )}
                  {hasFood && (
                    <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                      <Coffee className="size-4 text-action" />
                      <span>Home-Style Meals</span>
                    </div>
                  )}
                  {hasPower && (
                    <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                      <Zap className="size-4 text-action" />
                      <span>24/7 Power Backup</span>
                    </div>
                  )}
                  {hasCctv && (
                    <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                      <ShieldCheck className="size-4 text-emerald-600" />
                      <span>CCTV & Security</span>
                    </div>
                  )}
                  {hasHousekeeping && (
                    <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                      <Sparkles className="size-4 text-action" />
                      <span>Daily Housekeeping</span>
                    </div>
                  )}
                  {hasParking && (
                    <div className="flex items-center gap-2 rounded-control bg-surface-sunken p-2.5 border border-line/60">
                      <Car className="size-4 text-action" />
                      <span>Vehicle Parking</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-text-secondary">
                  Contact host during enquiry to confirm specific amenity availability.
                </p>
              )}
            </div>
          </div>

          {/* Cancellation Policy Card — the platform's rule, which is what actually happens,
              rather than host-written text that could promise something else. */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <AlertCircle className="size-4 text-amber-600" />
              Cancellation Policy
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              {property.booking_mode === "RESERVATION"
                ? "Cancel any time before check-in for a full refund. If the host cancels, you are refunded in full. After check-in, contact support."
                : "No payment is taken for an enquiry. You can withdraw it any time before the host confirms."}
            </p>
          </div>

          {/* House Rules Card */}
          {property.house_rules && (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <FileText className="size-4 text-action" />
                House Rules & Guidelines
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                {property.house_rules}
              </p>
            </div>
          )}

          {/* Guest Reviews Section */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-2">
                <Star className="size-5 fill-amber-400 text-amber-400" />
                <h3 className="text-base font-extrabold text-text">
                  {averageRating ? `${averageRating} · ${reviews.length} Review${reviews.length === 1 ? "" : "s"}` : "Guest Reviews"}
                </h3>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setReviewModalOpen(true)}
                className="text-xs font-bold"
              >
                <MessageSquare className="size-3.5" />
                Write a Review
              </Button>
            </div>

            {reviews.length > 0 ? (
              <div className="space-y-4 divide-y divide-line/60">
                {reviews.map((rev) => (
                  <div key={rev.id} className="pt-4 first:pt-0 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-text">
                        {rev.customer_name || "Verified Guest"}
                      </span>
                      <div className="flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: rev.rating ?? 5 }).map((_, i) => (
                          <Star key={i} className="size-3 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                    </div>
                    {rev.comment && (
                      <p className="text-xs leading-relaxed text-text-secondary">
                        {rev.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary py-2">
                No guest reviews yet. Have you stayed here? Be the first to share your experience!
              </p>
            )}
          </div>

          {/* Enquiry Policy Card */}
          {(property as Record<string, unknown>).booking_mode !== "RESERVATION" && (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-text flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                Direct Host Communication Guarantee
              </h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                When you send an enquiry with your check-in dates, the host receives your dates directly.
                Once the host confirms availability and pricing quote, you will receive a notification to finalize check-in.
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Interactive Quote and Enquiry Panel */}
        <div className="lg:col-span-5 sticky top-24">
          <StayQuotePanel property={property} />
        </div>
      </div>

      {/* Review Submission Dialog */}
      <Dialog
        open={reviewModalOpen}
        onOpenChange={setReviewModalOpen}
        title="Review This Stay"
        description="Share feedback about your stay experience. Reviews are only permitted for guests who have booked and stayed at this property."
      >
        <div className="flex flex-col gap-4 py-2">
          {reviewError && (
            <div className="rounded-control bg-danger-light p-3 text-xs font-semibold text-danger">
              {reviewError}
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-text">Rating</label>
            <div className="mt-1 flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  className="p-1 hover:scale-110 transition"
                  aria-label={`Rate ${star} star`}
                >
                  <Star
                    className={`size-6 ${
                      star <= reviewRating
                        ? "fill-amber-400 text-amber-400"
                        : "text-line-strong"
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-text-secondary ml-2">
                {reviewRating} of 5 Stars
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-text">Your Comments</label>
            <Textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Tell other guests about the cleanliness, host communication, room condition, and amenities..."
              rows={4}
              className="mt-1 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setReviewModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              loading={reviewMutation.isPending}
              onClick={() => reviewMutation.mutate()}
            >
              Submit Review
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Similar Stays Recommendations (P3-4) */}
      <SimilarStaysSection currentPropertyId={property.id} location={property.location_text} />
    </main>
  );
}

function SimilarStaysSection({
  currentPropertyId,
  location,
}: {
  currentPropertyId: string;
  location?: string;
}) {
  const city = location ? location.split(",")[0]?.trim() : undefined;
  const { data: stays = [] } = useQuery({
    queryKey: ["similar-stays", currentPropertyId, city],
    queryFn: () => fetchStays({ location: city, limit: 6 }),
    staleTime: 60_000,
  });

  const similarStays = stays.filter((s) => s.id !== currentPropertyId).slice(0, 3);
  if (similarStays.length === 0) return null;

  return (
    <section className="mt-8 border-t border-line/70 pt-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-text">Similar Stays You May Like</h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Other verified rooms and accommodation in this area
          </p>
        </div>
        <Link
          href="/stays"
          className="text-xs font-bold text-action hover:underline"
        >
          View all stays →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {similarStays.map((item) => (
          <StayCard key={item.id} property={item} />
        ))}
      </div>
    </section>
  );
}

