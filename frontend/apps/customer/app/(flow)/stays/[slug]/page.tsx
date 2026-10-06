"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  ImagePlus,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { Badge, Button, Dialog, ErrorState, Skeleton, Textarea } from "@vsolve/ui";

import {
  MAX_PHOTO_BYTES,
  MAX_REVIEW_PHOTOS,
  PHOTO_TOO_LARGE,
  formatPaise,
  pricePeriodOf,
  reviewPhotoUrls,
  roomOccupancyLabel,
  stayLengthLabel,
} from "@/features/stays/model";
import {
  fetchStayProperty,
  fetchStays,
  submitStayReview,
  uploadStayReviewPhoto,
} from "@/features/stays/queries";
import { StayCard, StayImageGallery, StayQuotePanel, amenityIcon } from "@/features/stays/view";
import { STAYS_HREF } from "@/lib/routes";
import { useCanonicalSlug } from "@/lib/use-canonical-slug";


export default function StayDetailPage() {
  // The page slug; links shared before slugs carry the property id, which still resolves.
  const params = useParams<{ slug: string }>();
  const pageKey = params.slug;
  const queryClient = useQueryClient();

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewPhotos, setReviewPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  const {
    data: property,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["stay-property", pageKey],
    queryFn: () => fetchStayProperty(pageKey),
    enabled: Boolean(pageKey),
  });
  useCanonicalSlug(STAYS_HREF, pageKey, property?.slug, () =>
    queryClient.setQueryData(["stay-property", property?.slug], property),
  );

  const reviewMutation = useMutation({
    mutationFn: () =>
      submitStayReview({
        property_id: property?.id ?? "",
        rating: reviewRating,
        comment: reviewComment,
        image_urls: reviewPhotos,
      }),
    onSuccess: () => {
      setReviewModalOpen(false);
      setReviewComment("");
      setReviewPhotos([]);
      setReviewError(null);
      queryClient.invalidateQueries({ queryKey: ["stay-property", pageKey] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to submit review.";
      setReviewError(msg);
    },
  });

  async function addReviewPhotos(files: FileList | null) {
    if (!files?.length) return;
    const chosen = Array.from(files);
    const fitting = chosen.filter((file) => file.size <= MAX_PHOTO_BYTES);
    const room = MAX_REVIEW_PHOTOS - reviewPhotos.length;
    setReviewError(
      fitting.length < chosen.length
        ? PHOTO_TOO_LARGE
        : fitting.length > room
          ? `You can add up to ${MAX_REVIEW_PHOTOS} photos.`
          : null,
    );
    const toUpload = fitting.slice(0, Math.max(room, 0));
    if (toUpload.length === 0) return;
    setPhotoUploading(true);
    try {
      for (const file of toUpload) {
        const uploaded = await uploadStayReviewPhoto(file);
        setReviewPhotos((current) => [...current, uploaded.url]);
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not upload this photo.");
    } finally {
      setPhotoUploading(false);
    }
  }

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

  const amenities = property.amenities ?? [];
  const highlights = property.highlights ?? [];

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

      {(() => {
        const currentUnitId = selectedUnitId || property.units[0]?.id || "";
        const currentUnit = property.units.find((u) => u.id === currentUnitId);
        const unitMedia = (currentUnit as { media?: Array<{ id: string; url: string; display_order?: number; caption?: string }> })?.media;
        const activeMedia = unitMedia && unitMedia.length > 0 ? (unitMedia as typeof property.media) : property.media;
        const galleryTitle = currentUnit?.name ? `${property.title} · ${currentUnit.name}` : property.title;

        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Property Details & Amenities */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <StayImageGallery media={activeMedia} title={galleryTitle} />

              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs">
                {/* The host's application was reviewed by Operations before any listing went live. */}
                <Badge tone="success" className="inline-flex items-center gap-1 text-xs font-bold">
                  <ShieldCheck className="size-3.5" />
                  Verified host
                </Badge>

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

            {property.description?.trim() ? (
              <div className="mt-6 border-t border-line/70 pt-5">
                <h2 className="text-sm font-bold text-text">About this stay</h2>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-line">
                  {property.description}
                </p>
              </div>
            ) : null}

            {highlights.length > 0 ? (
              <div className="mt-6 border-t border-line/70 pt-5">
                <h2 className="text-sm font-bold text-text">About this place</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                  {highlights.map((row) => (
                    <div key={row.label}>
                      <dt className="text-text-secondary">{row.label}</dt>
                      <dd className="font-semibold text-text">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

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
                        {roomOccupancyLabel(unit, property.room_style)}
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

            {/* Amenities: only what the host said yes to, labelled by the server. */}
            <div className="mt-6 border-t border-line/70 pt-5">
              <h2 className="text-sm font-bold text-text">Amenities</h2>
              {amenities.length > 0 ? (
                <ul className="mt-3 grid grid-cols-2 gap-3 text-xs text-text sm:grid-cols-3">
                  {amenities.map((amenity) => {
                    const Icon = amenityIcon(amenity.key);
                    return (
                      <li
                        key={amenity.key}
                        className="flex items-center gap-2 rounded-control border border-line/60 bg-surface-sunken p-2.5"
                      >
                        <Icon className="size-4 text-action" aria-hidden />
                        <span>{amenity.label}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-text-secondary">
                  The host hasn&apos;t listed amenities. Ask when they call you.
                </p>
              )}
            </div>
          </div>

          {/* How enquiries work: every stay is an enquiry; nothing is paid online. */}
          <div className="rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-text flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-600" />
              How enquiries work
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Send your dates. The host sees your name and phone number and calls you to
              confirm. Nothing is paid online, and you can withdraw any time before the host
              confirms.
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
              {property.can_review ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setReviewModalOpen(true)}
                  className="text-xs font-bold"
                >
                  <MessageSquare className="size-3.5" />
                  Write a review
                </Button>
              ) : null}
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
                    {reviewPhotoUrls(rev.image_urls).length > 0 ? (
                      <ul className="flex flex-wrap gap-2 pt-1">
                        {reviewPhotoUrls(rev.image_urls).map((url) => (
                          <li key={url}>
                            <a href={url} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt="Guest photo"
                                className="size-16 rounded-control border border-line object-cover"
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text-secondary py-2">
                No guest reviews yet.
              </p>
            )}
          </div>

        </div>

        {/* Right Column: Interactive Quote and Enquiry Panel */}
        <div className="lg:col-span-5 sticky top-24">
          <StayQuotePanel property={property} onSelectUnit={setSelectedUnitId} />
        </div>
      </div>
    );
  })()}

      {/* Review Submission Dialog */}
      <Dialog
        open={reviewModalOpen}
        onOpenChange={setReviewModalOpen}
        title="Review This Stay"
        description="Tell other guests how your stay went."
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

          <div>
            <span className="text-xs font-bold text-text">Photos (optional)</span>
            <p className="text-[11px] text-text-secondary">
              Up to {MAX_REVIEW_PHOTOS} photos. JPEG, PNG or WebP, up to 10 MB each.
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {reviewPhotos.map((url) => (
                <li key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="size-16 rounded-control border border-line object-cover" />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => setReviewPhotos((current) => current.filter((item) => item !== url))}
                    className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-surface text-text shadow-xs"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
              {reviewPhotos.length < MAX_REVIEW_PHOTOS ? (
                <li>
                  <label className="flex size-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border-2 border-dashed border-line-strong text-[10px] font-semibold text-text-secondary hover:text-text">
                    <ImagePlus className="size-4" />
                    {photoUploading ? "Uploading…" : "Add"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="sr-only"
                      disabled={photoUploading}
                      onChange={(event) => {
                        void addReviewPhotos(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                </li>
              ) : null}
            </ul>
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
              disabled={photoUploading}
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

