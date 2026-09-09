"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatMoney } from "@vsolve/ui";
import { Clock, ShieldCheck, Ban, X, Store } from "lucide-react";

import { useServiceDetail, type ServiceCard, type ServiceDetail } from "../client-queries";
import { displayRating } from "./tile-desktop-rating";
import { TileCatalogAddButton } from "./tile-catalog-add-button";
import { ServicePhoto } from "./category-artwork";
import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { apiFetch, type Schemas } from "@vsolve/api-client";

/** Real backend shape for an A7 rental vendor storefront card (§4.1a). */
export type RentalListingGroup = Schemas["RentalListingGroup"];

type BookableVariant = ServiceDetail["variants"][number];

const FALLBACK_INCLUDED = [
  "Professional visit and inspection",
  "On-site diagnosis",
  "Workmanship as described for the job",
];

const FALLBACK_DETAILS = {
  duration: "60–90 mins",
  cancellation: "Free up to 2 hrs before",
  warranty: "30 days service warranty",
} as const;

function policyText(
  policies: { kind: string; title: string; text: string }[] | undefined,
  kind: string,
): string[] {
  return (policies ?? [])
    .filter((policy) => policy.kind === kind)
    .map((policy) => policy.text)
    .filter((text) => text.trim() !== "");
}

function detailField(
  policies: { title: string; text: string }[] | undefined,
  needles: string[],
  fallback: string,
): string {
  const match = (policies ?? []).find((policy) => {
    const haystack = `${policy.title} ${policy.text}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
  return match?.text || fallback;
}

function variantThumbnailUrl(variant: BookableVariant, fallbackUrls: string[] = []): string {
  if (variant.image_url.trim() !== "") return variant.image_url;
  return fallbackUrls.find((url) => url.trim() !== "") ?? "";
}

function PanelVariantScroller({
  variants,
  selectedId,
  fallbackImageUrls = [],
  iconKey,
  onSelect,
}: {
  variants: BookableVariant[];
  selectedId: string;
  fallbackImageUrls?: string[];
  iconKey: string;
  onSelect: (variantId: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const suppressClick = useRef(false);
  const drag = useRef<{ pointerId: number; startX: number; startScroll: number; moved: boolean } | null>(
    null,
  );

  const scrollable = variants.length > 1;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!scrollable) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const node = scrollerRef.current;
    if (!node) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: node.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = scrollerRef.current;
    const state = drag.current;
    if (!node || !state || state.pointerId !== event.pointerId) return;
    const delta = event.clientX - state.startX;
    if (Math.abs(delta) <= 4 && !state.moved) return;
    if (!state.moved) {
      state.moved = true;
      node.setPointerCapture(event.pointerId);
    }
    node.scrollLeft = state.startScroll - delta;
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const node = scrollerRef.current;
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (node?.hasPointerCapture(event.pointerId)) {
      node.releasePointerCapture(event.pointerId);
    }
    if (state.moved) suppressClick.current = true;
    drag.current = null;
  };

  return (
    <section className="mt-2">
      <h3 className="text-[15px] font-extrabold text-navy-900">What you can book</h3>
      <div
        ref={scrollerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={cn(
          "mt-3",
          scrollable
            ? "no-scrollbar cursor-grab overflow-x-auto overscroll-x-contain pb-1.5 active:cursor-grabbing"
            : "overflow-x-hidden",
        )}
      >
        <ul className="flex w-max list-none gap-2.5 p-0.5">
          {variants.map((variant) => {
            const selected = variant.id === selectedId;
            return (
              <li key={variant.id} className="w-[5.35rem] shrink-0">
                <button
                  type="button"
                  onClick={(event) => {
                    if (suppressClick.current) {
                      event.preventDefault();
                      suppressClick.current = false;
                      return;
                    }
                    onSelect(variant.id);
                  }}
                  aria-pressed={selected}
                  aria-label={variant.name}
                  className="flex w-full cursor-pointer flex-col items-start text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <span
                    className={cn(
                      "block w-full rounded-[1.1rem] p-1",
                      selected
                        ? "border-2 border-[#EA580C] bg-[#FFF8F3]"
                        : "border-2 border-transparent",
                    )}
                  >
                    <ServicePhoto
                      imageUrl={variantThumbnailUrl(variant, fallbackImageUrls)}
                      iconKey={iconKey}
                    />
                  </span>
                  <span className="mt-1.5 line-clamp-2 min-h-[1.9rem] w-full text-[12px] font-semibold leading-tight text-navy-900">
                    {variant.name}
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium leading-tight text-text-secondary">
                    Starts at
                  </span>
                  <span data-numeric className="text-[13px] font-extrabold tabular-nums text-navy-900">
                    {formatMoney(variant.starting_price.amount_paise)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function RentalVendorList({
  listings,
  serviceName,
}: {
  listings: RentalListingGroup[];
  serviceName: string;
}) {
  const router = useRouter();

  if (listings.length === 0) {
    return (
      <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
        No vendors currently list {serviceName} for rent in your area.
      </p>
    );
  }

  return (
    <ul className="mt-3 flex flex-col gap-2.5">
      {listings.map((listing) => (
        <li key={listing.asset_id}>
          <button
            type="button"
            onClick={() => router.push(`/rentals/checkout/${listing.asset_id}`)}
            className="flex w-full items-center gap-3 rounded-[1rem] border border-[#e7e2da] bg-white p-3 text-left transition-colors hover:border-[#EA580C] hover:bg-[#FFF8F3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#F4F1EC] text-navy-900">
              <Store className="size-5" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold text-navy-900">
                {listing.vendor_name}
              </span>
              <span className="mt-0.5 block text-[11px] font-medium text-text-secondary">
                {listing.quantity_available > 0
                  ? `${listing.quantity_available} available · ${listing.condition_grade.toLowerCase()} condition`
                  : "Currently unavailable"}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span data-numeric className="block text-[13px] font-extrabold tabular-nums text-navy-900">
                {formatMoney(listing.daily_price_paise)}
              </span>
              <span className="block text-[10px] font-semibold text-text-secondary">/ day</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TileServiceDetailPanel({
  service,
  categorySlug,
  tileImageUrl = "",
  onClose,
}: {
  service: ServiceCard;
  categorySlug: string;
  /** Subcategory 3D icon — used when a variant has no own thumbnail. */
  tileImageUrl?: string;
  onClose: () => void;
}) {
  const isRental =
    service.request_archetypes.includes("A7_RENTAL") ||
    categorySlug === "rental-services";

  const [rentalListings, setRentalListings] = useState<RentalListingGroup[]>([]);

  useEffect(() => {
    if (isRental) {
      apiFetch(`${PUBLIC_API_BASE_URL}/api/v1/rentals/browse/?service_slug=${service.slug}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: unknown) => setRentalListings(Array.isArray(data) ? (data as RentalListingGroup[]) : []))
        .catch(() => setRentalListings([]));
    }
  }, [isRental, service.slug]);

  // §4.1a: A7 rentals surface every vendor's storefront card, not a single
  // hidden dispatch target — the customer picks which vendor's listing to
  // book. `primaryRental` still backs the price shown in the sticky footer
  // (cheapest-first would need a backend sort; the browse endpoint's own
  // ordering is used as-is here) and the "single vendor" shortcut in the add
  // button, but the footer button itself opens the full vendor list below.
  const primaryRental = isRental ? rentalListings[0] ?? null : null;

  const detailQuery = useServiceDetail(service.slug);
  const detail = detailQuery.data;
  const rating = displayRating(service.slug);
  const included = policyText(detail?.policies, "INCLUDED");
  const RENTAL_FALLBACK_INCLUDED = [
    "Direct vendor dispatch & delivery to your address",
    "Verified functional inspection prior to delivery",
    "100% refundable security deposit held in escrow",
    "Easy return collection upon completion",
  ];
  const includedItems = isRental
    ? RENTAL_FALLBACK_INCLUDED
    : included.length > 0
    ? included
    : FALLBACK_INCLUDED;

  const imageUrl = detail?.cover?.url ?? service.cover?.url ?? "";
  const about =
    (detail?.description && detail.description.trim() !== ""
      ? detail.description
      : null) ?? service.short_description;

  const duration = isRental
    ? "Book by the day (flexible rental window)"
    : detailField(detail?.policies, ["duration", "mins", "minutes"], FALLBACK_DETAILS.duration);
  const cancellation = isRental
    ? "Free cancellation prior to equipment dispatch"
    : detailField(detail?.policies, ["cancel"], FALLBACK_DETAILS.cancellation);
  const warranty = isRental
    ? "Protected by V Solve Escrow & Inspection Guarantee"
    : detailField(detail?.policies, ["warrant"], FALLBACK_DETAILS.warranty);

  const bookableVariants = detail?.variants ?? [];
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const selectedVariant =
    bookableVariants.find((variant) => variant.id === selectedVariantId) ??
    bookableVariants[0] ??
    null;
  const pricePaise =
    (isRental && primaryRental?.daily_price_paise)
      ? primaryRental.daily_price_paise
      : selectedVariant?.starting_price.amount_paise ?? service.starting_price?.amount_paise ?? null;
  const showVariantPicker = selectedVariant !== null;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden rounded-[1.25rem] border border-[#e7e2da] bg-white shadow-sm"
      aria-labelledby="tile-detail-heading"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-5">
        <div className="min-w-0">
          <h2
            id="tile-detail-heading"
            className="text-lg font-extrabold leading-snug tracking-tight text-navy-900"
          >
            {service.name}
          </h2>
          <p className="mt-1 flex items-center gap-1 text-[12px] font-semibold text-navy-900">
            <span className="text-[#F5A524]" aria-hidden>
              ★
            </span>
            <span>
              {rating.score}{" "}
              <span className="font-medium text-text-secondary">({rating.count})</span>
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-8 shrink-0 place-items-center rounded-full text-text-secondary transition-colors hover:bg-[#FAF9F7] hover:text-navy-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          aria-label="Close details"
        >
          <X className="size-4" strokeWidth={2.2} />
        </button>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        {showVariantPicker ? (
          <PanelVariantScroller
            variants={bookableVariants}
            selectedId={selectedVariant.id}
            fallbackImageUrls={[tileImageUrl, imageUrl]}
            iconKey={service.icon_key}
            onSelect={setSelectedVariantId}
          />
        ) : null}

        {showVariantPicker ? null : (
          <div className="mt-2 overflow-hidden rounded-[1rem] bg-[#F4F1EC]">
            {imageUrl !== "" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt=""
                className="aspect-[4/3] w-full object-cover object-center"
              />
            ) : (
              <div className="aspect-[4/3] w-full bg-[#F4F1EC]" />
            )}
          </div>
        )}

        <section className="mt-5">
          <h3 className="text-[15px] font-extrabold text-navy-900">About this service</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
            {about}
          </p>
        </section>

        {isRental ? (
          <section className="mt-5">
            <h3 className="text-[15px] font-extrabold text-navy-900">Available from</h3>
            <p className="mt-1 text-[12px] font-medium text-text-secondary">
              Each vendor lists this product independently — pick a listing to see its exact price,
              condition and availability before you book.
            </p>
            <RentalVendorList listings={rentalListings} serviceName={service.name} />
          </section>
        ) : null}

        <section className="mt-5">
          <h3 className="text-[15px] font-extrabold text-navy-900">What&apos;s included</h3>
          <ul className="mt-2.5 flex flex-col gap-2">
            {includedItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px] text-navy-900">
                <span className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-[#137333] text-white">
                  <svg viewBox="0 0 12 12" fill="none" className="size-2.5" aria-hidden>
                    <path
                      d="M2.5 6.2 4.8 8.5 9.5 3.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <h3 className="text-[15px] font-extrabold text-navy-900">Service details</h3>
          <dl className="mt-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <dt className="flex items-center gap-2 font-medium text-text-secondary">
                <Clock className="size-4 shrink-0" strokeWidth={1.8} />
                Duration
              </dt>
              <dd className="font-semibold text-navy-900">{duration}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <dt className="flex items-center gap-2 font-medium text-text-secondary">
                <Ban className="size-4 shrink-0" strokeWidth={1.8} />
                Cancellation
              </dt>
              <dd className="text-right font-semibold text-navy-900">{cancellation}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <dt className="flex items-center gap-2 font-medium text-text-secondary">
                <ShieldCheck className="size-4 shrink-0" strokeWidth={1.8} />
                Warranty
              </dt>
              <dd className="text-right font-semibold text-navy-900">{warranty}</dd>
            </div>
          </dl>
        </section>
      </div>

      <div className="shrink-0 border-t border-[#e7e2da] bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {pricePaise !== null ? (
              <>
                <span className="block text-[11px] font-semibold text-text-secondary">
                  {isRental ? "Daily rate starts at" : "Starts at"}
                </span>
                <div className="flex items-baseline gap-1">
                  <span data-numeric className="mt-0.5 block text-xl font-extrabold tabular-nums text-navy-900">
                    {formatMoney(pricePaise)}
                  </span>
                  {isRental && <span className="text-xs font-semibold text-neutral-500">/ day</span>}
                </div>
              </>
            ) : (
              <span className="block text-sm font-bold text-navy-900">Price on request</span>
            )}
          </div>
          <TileCatalogAddButton
            service={service}
            categorySlug={categorySlug}
            variantId={selectedVariant?.id}
            label="Add to cart"
            size="panel"
            rentalListing={primaryRental}
          />
        </div>
        <Link
          href={`/catalog/${categorySlug}/${service.slug}`}
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-navy-800 hover:text-action"
        >
          See price details
          <span aria-hidden>→</span>
        </Link>
      </div>
    </aside>
  );
}
