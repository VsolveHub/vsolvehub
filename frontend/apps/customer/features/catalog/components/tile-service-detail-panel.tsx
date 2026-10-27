"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { cn, formatMoney } from "@vsolve/ui";
import { Clock, ShieldCheck, Ban, X } from "lucide-react";

import { RemoteImage } from "@/components/remote-image";

import { useServiceDetail, type ServiceCard, type ServiceDetail } from "../client-queries";
import { durationLabel, policyTexts, warrantyText } from "../service-facts";
import { TileCatalogAddButton } from "./tile-catalog-add-button";
import { ServicePhoto } from "./category-artwork";

type BookableVariant = ServiceDetail["variants"][number];

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
  const detailQuery = useServiceDetail(service.slug);
  const detail = detailQuery.data;
  // Only what the service publishes. An empty list hides the section rather than
  // borrowing generic lines that may not describe this job.
  const includedItems = policyTexts(detail?.policies, "INCLUDED");
  const imageUrl = detail?.cover?.url ?? service.cover?.url ?? "";
  const about =
    (detail?.description && detail.description.trim() !== ""
      ? detail.description
      : null) ?? service.short_description;
  const warranty = warrantyText(detail?.policies);
  const bookableVariants = detail?.variants ?? [];
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const selectedVariant =
    bookableVariants.find((variant) => variant.id === selectedVariantId) ??
    bookableVariants[0] ??
    null;
  const duration = selectedVariant ? durationLabel(selectedVariant) : null;
  const pricePaise =
    selectedVariant?.starting_price.amount_paise ?? service.starting_price?.amount_paise ?? null;
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
      className="flex h-full min-h-0 w-[400px] shrink-0 flex-col overflow-hidden rounded-[1.25rem] border border-[#e7e2da] bg-white shadow-xl xl:shadow-sm"
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
              <RemoteImage
                src={imageUrl}
                alt=""
                width={480}
                height={360}
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

        {includedItems.length > 0 ? (
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
        ) : null}

        <section className="mt-5">
          <h3 className="text-[15px] font-extrabold text-navy-900">Service details</h3>
          <dl className="mt-3 flex flex-col gap-3">
            {duration ? (
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <dt className="flex items-center gap-2 font-medium text-text-secondary">
                  <Clock className="size-4 shrink-0" strokeWidth={1.8} />
                  Duration
                </dt>
                <dd className="font-semibold text-navy-900">{duration}</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <dt className="flex items-center gap-2 font-medium text-text-secondary">
                <Ban className="size-4 shrink-0" strokeWidth={1.8} />
                Cancellation
              </dt>
              {/* The terms depend on the slot and are priced by the server at checkout. */}
              <dd className="text-right font-semibold text-navy-900">Shown before you pay</dd>
            </div>
            {warranty ? (
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <dt className="flex items-center gap-2 font-medium text-text-secondary">
                  <ShieldCheck className="size-4 shrink-0" strokeWidth={1.8} />
                  Warranty
                </dt>
                <dd className="text-right font-semibold text-navy-900">{warranty}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      <div className="shrink-0 border-t border-[#e7e2da] bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {pricePaise !== null ? (
              <>
                <span className="block text-[11px] font-semibold text-text-secondary">Starts at</span>
                <span data-numeric className="mt-0.5 block text-xl font-extrabold tabular-nums text-navy-900">
                  {formatMoney(pricePaise)}
                </span>
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
