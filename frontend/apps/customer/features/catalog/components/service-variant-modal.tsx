"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, formatMoney, useHydrated } from "@vsolve/ui";
import { useCart } from "@/features/checkout/queries";
import { RemoteImage } from "@/components/remote-image";
import { AddToCartButton } from "./add-to-cart-button";
import { ServicePhoto } from "./category-artwork";
import { addsToServiceCopy, durationLabel } from "../service-facts";
import type { ServiceDetail } from "../queries";

interface ServiceVariantModalProps {
  serviceName: string;
  serviceSlug: string;
  variants: ServiceDetail["variants"];
  serviceCoverUrl?: string | null;
  serviceIconKey?: string;
  serviceCopy?: string[];
}

export function ServiceVariantModal({
  serviceName,
  serviceSlug: _serviceSlug,
  variants,
  serviceCoverUrl,
  serviceIconKey,
  serviceCopy = [],
}: ServiceVariantModalProps) {
  const [open, setOpen] = useState(false);
  const cartQuery = useCart();
  const hydrated = useHydrated();

  const cart = hydrated ? cartQuery.data : undefined;
  const variantIds = new Set(variants.map((v) => v.id));
  const cartItemsInService = cart?.items.filter((item) => variantIds.has(item.variant_id)) ?? [];
  const totalQuantity = cartItemsInService.reduce((sum, item) => sum + item.quantity, 0);
  const hasItemsInCart = totalQuantity > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-center rounded-xl bg-navy-900 px-6 text-sm font-bold text-white shadow-xs transition-all hover:bg-navy-800 active:scale-[0.98] cursor-pointer"
      >
        {hasItemsInCart ? (
          <span className="flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 text-emerald-400" aria-hidden>
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            {totalQuantity} added • Change
          </span>
        ) : (
          "Add to Cart"
        )}
      </button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="What you can book"
        description={serviceName}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {hasItemsInCart ? (
              <Link
                href="/cart"
                onClick={() => setOpen(false)}
                className="text-xs font-bold text-action hover:underline"
              >
                View Cart ({totalQuantity}) &rarr;
              </Link>
            ) : (
              <span className="text-xs text-text-muted">Prices confirmed before payment</span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl bg-navy-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-navy-800 active:scale-[0.98] cursor-pointer"
            >
              Done
            </button>
          </div>
        }
      >
        <ul className="space-y-3.5 py-1">
          {variants.map((variant) => {
            const variantImg =
              variant.image_url && variant.image_url.trim() !== ""
                ? variant.image_url
                : (serviceCoverUrl ?? "");
            const duration = durationLabel(variant);

            return (
              <li
                key={variant.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-3.5 sm:p-4 rounded-xl border border-line/60 bg-[#FAF9F7] hover:border-line transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span className="size-14 sm:size-16 shrink-0 rounded-lg overflow-hidden bg-white grid place-items-center border border-line/50 shadow-2xs">
                    {variantImg ? (
                      <RemoteImage
                        src={variantImg}
                        alt={variant.name}
                        width={64}
                        height={64}
                        className={
                          variantImg.includes("/Service%20Cover/") || variantImg.includes("/Service Cover/")
                            ? "size-[80%] object-contain"
                            : "size-full object-cover"
                        }
                      />
                    ) : (
                      <ServicePhoto imageUrl="" iconKey={serviceIconKey} className="size-full rounded-none shadow-none" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm sm:text-base font-bold text-navy-900 leading-snug truncate">
                      {variant.name}
                    </p>
                    {addsToServiceCopy(variant.description, ...serviceCopy) ? (
                      <p className="mt-1 text-xs text-text-secondary line-clamp-2 leading-relaxed">
                        {variant.description}
                      </p>
                    ) : null}
                    {duration ? (
                      <p className="mt-1.5 flex items-center gap-1 text-[0.75rem] text-text-muted">
                        <svg
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.6}
                          className="size-3.5"
                          aria-hidden
                        >
                          <circle cx="10" cy="10" r="7.25" />
                          <path d="M10 6v4.25l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{duration}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start pt-2.5 sm:pt-0 border-t border-line/40 sm:border-t-0 gap-2 shrink-0">
                  <div className="text-left sm:text-right min-w-0">
                    <span className="block text-[0.6rem] uppercase font-bold tracking-wider text-text-muted">
                      Starts at
                    </span>
                    <span data-numeric className="block text-sm sm:text-base font-bold tabular-nums text-navy-900">
                      {formatMoney(variant.starting_price.amount_paise)}
                    </span>
                  </div>

                  <div className="shrink-0 flex items-center justify-end sm:mt-1">
                    <AddToCartButton
                      variantId={variant.id}
                      size="compact"
                      showViewCart={false}
                      className="w-auto"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}

