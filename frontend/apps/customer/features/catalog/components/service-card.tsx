"use client";

import { IntentLink } from "@/components/intent-link";
import { formatMoney, useHydrated } from "@vsolve/ui";
import { RemoteImage } from "@/components/remote-image";
import { useAddCartItem, useCart, useUpdateCartItem, useRemoveCartItem } from "@/features/checkout/queries";
import type { ServiceCard as ServiceCardData } from "../queries";
import { serviceHref } from "../service-href";
import { isServiceCoverUrl } from "../service-cover";
import { ServicePhoto } from "./category-artwork";

export function ServiceCard({
  service,
  categorySlug,
  index = 1,
}: {
  service: ServiceCardData;
  categorySlug: string;
  index?: number;
}) {
  const isLarge = index === 0;
  const isPopular = index === 1;

  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const isAdding = addItem.isPending;
  const isUpdating = updateItem.isPending;
  const isRemoving = removeItem.isPending;

  // The server renders with no cart; the browser may already hold one in the query cache.
  // Reading it before hydration drew a quantity stepper where the server drew "Add" and React
  // threw a hydration mismatch. Until hydrated, render exactly what the server did.
  const hydrated = useHydrated();
  const cart = hydrated ? cartQuery.data : undefined;
  const cartItem = cart?.items.find(
    (item) => item.variant_id === service.bookable_variant_id
  );
  const cartUnavailable = cartQuery.isLoading || cart === undefined;

  /**
   * Adds one of this service to the basket.
   *
   * ## Why neither branch navigates any more
   *
   * Both used to `router.push` the service page, and that is what made the
   * button look broken: a control labelled "Add" that sometimes opened a page
   * instead. The `!cart` case was the common one — `useCart` has not resolved on
   * the first paint, so anyone tapping promptly got navigation rather than an
   * add. It is a race, so it looked intermittent, which is worse than a
   * consistent failure.
   *
   * A control does the thing it is named after or it does nothing. Returning on
   * `!cart` is honest; quietly going somewhere else is not. The basket read
   * normally lands well inside the time it takes to aim at a card, so this
   * window is small — and a rare dead tap is far better than a tap that
   * silently throws the reader onto another page.
   *
   * Deliberately *not* `disabled` while the basket loads: this page's cards are
   * server-rendered, so a `disabled` derived from a client-only query bakes into
   * the HTML as `disabled` and stays that way for as long as hydration takes —
   * which turned every Add button on the page to stone.
   *
   * `bookable_variant_id` cannot be null by the time this runs: `renderCartAction`
   * shows "Get a quote" instead of this button when it is. The guard stays
   * because it is what makes that true for the type checker as well as for the
   * reader.
   */
  const handleAddToCart = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (isAdding || cartUnavailable) return;
    if (!service.bookable_variant_id) return;
    if (!cart) return;

    addItem.mutate({
      expectedCartVersion: cart.version,
      variantId: service.bookable_variant_id,
      quantity: 1,
    });
  };

  const handleIncrement = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (cart && cartItem && !isUpdating) {
      updateItem.mutate({
        expectedCartVersion: cart.version,
        expectedItemVersion: cartItem.version,
        itemId: cartItem.id,
        quantity: cartItem.quantity + 1,
      });
    }
  };

  const handleDecrement = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (cart && cartItem && !isUpdating && !isRemoving) {
      if (cartItem.quantity > 1) {
        updateItem.mutate({
          expectedCartVersion: cart.version,
          expectedItemVersion: cartItem.version,
          itemId: cartItem.id,
          quantity: cartItem.quantity - 1,
        });
      } else {
        removeItem.mutate({
          expectedCartVersion: cart.version,
          expectedItemVersion: cartItem.version,
          itemId: cartItem.id,
        });
      }
    }
  };

  const renderCartAction = (buttonSizeClass: string, textClass: string) => {
    if (cartItem) {
      return (
        <div className={`inline-flex ${buttonSizeClass} items-center border border-action rounded-full overflow-hidden bg-white shadow-xs relative z-20`}>
          <button
            type="button"
            onClick={handleDecrement}
            disabled={isUpdating || isRemoving}
            className="px-3.5 h-full flex items-center justify-center text-action font-extrabold text-base hover:bg-[#FFF0E5] transition-colors disabled:opacity-50 cursor-pointer"
          >
            -
          </button>
          <span className={`${textClass} px-2 font-black text-navy-900 min-w-[20px] text-center`}>
            {cartItem.quantity}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            disabled={isUpdating}
            className="px-3.5 h-full flex items-center justify-center text-action font-extrabold text-base hover:bg-[#FFF0E5] transition-colors disabled:opacity-50 cursor-pointer"
          >
            +
          </button>
        </div>
      );
    }

    if (service.bookable_variant_id) {
      return (
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={isAdding || cartUnavailable}
          className={`inline-flex ${buttonSizeClass} items-center justify-center rounded-full bg-action px-5 ${textClass} font-bold text-white shadow-sm transition-transform duration-200 hover:scale-105 hover:bg-[#d65f1a] disabled:opacity-50 cursor-pointer relative z-20`}
        >
          {isAdding ? "Adding..." : "Add"}
          {!isAdding && (
            <svg viewBox="0 0 20 20" fill="none" className="size-4 ml-1.5" aria-hidden="true" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 4v12m-6-6h12" />
            </svg>
          )}
        </button>
      );
    }

    return (
      <span
        className={`inline-flex ${buttonSizeClass} items-center justify-center rounded-full bg-action px-5 ${textClass} font-bold text-white shadow-sm transition-transform duration-200 hover:scale-105 hover:bg-[#d65f1a] cursor-pointer relative z-20`}
      >
        Add
        <svg viewBox="0 0 20 20" fill="none" className="size-4 ml-1.5" aria-hidden="true" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 4v12m-6-6h12" />
        </svg>
      </span>
    );
  };

  const imageUrl = service.cover?.url ?? "";
  const isCoverIcon = imageUrl
    ? isServiceCoverUrl(imageUrl) || imageUrl.includes("/catalog/tiles/")
    : false;

  if (isLarge) {
    return (
      <div className="group md:col-span-2 flex flex-col md:flex-row overflow-hidden rounded-card border border-transparent bg-white shadow-xl hover:-translate-y-0.5 hover:shadow-2xl transition-all duration-300">
        <IntentLink
          href={serviceHref(service, categorySlug)}
          className="relative md:w-5/12 aspect-[16/10] md:aspect-auto overflow-hidden bg-[#F4F1EC] shrink-0 block cursor-pointer"
        >
          {imageUrl ? (
            <RemoteImage
              src={imageUrl}
              alt={service.cover?.alt_text || service.name}
              fill
              sizes="(min-width: 768px) 40vw, 100vw"
              className={
                isCoverIcon
                  ? "size-full object-contain p-6 transition-transform duration-500 group-hover:scale-105"
                  : "size-full object-cover transition-transform duration-500 group-hover:scale-105"
              }
            />
          ) : (
            <div className="size-full bg-surface-sunken grid place-items-center text-text-secondary min-h-[12rem]">
              <ServicePhoto imageUrl="" iconKey={service.icon_key} className="size-full rounded-none shadow-none" />
            </div>
          )}
        </IntentLink>
        <div className="flex flex-col md:w-7/12 flex-1 p-6 md:p-8 justify-between">
          <IntentLink
            href={serviceHref(service, categorySlug)}
            className="flex-1 flex flex-col cursor-pointer"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-balance text-[1.35rem] font-bold leading-snug text-navy-900 transition-colors group-hover:text-action">
                {service.name}
              </h3>
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-sunken text-text-muted transition-transform duration-200 group-hover:scale-110">
                <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden="true" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10h11m-4-4 4 4-4 4" />
                </svg>
              </span>
            </div>

            <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-text-secondary">
              {service.short_description || `Expert repair and installation for ${service.name}. Restores smooth functionality and ensures quality.`}
            </p>
          </IntentLink>

          <div className="mt-6 flex items-end justify-between gap-3 pt-4 border-t border-line/50">
            {service.starting_price !== null ? (
              <div className="min-w-0">
                <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">
                  Starts at
                </span>
                <span data-numeric className="mt-1 block text-[1.35rem] font-extrabold tabular-nums text-navy-900">
                  {formatMoney(service.starting_price.amount_paise)}
                </span>
              </div>
            ) : null}
            
            {renderCartAction("h-9", "text-sm")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group md:col-span-1 flex flex-col overflow-hidden rounded-card border border-transparent bg-white shadow-card transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-raised">
      <IntentLink
        href={serviceHref(service, categorySlug)}
        className="flex flex-col cursor-pointer"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#F4F1EC]">
          {imageUrl ? (
            <RemoteImage
              src={imageUrl}
              alt={service.cover?.alt_text || service.name}
              fill
              sizes="(min-width: 1024px) 400px, (min-width: 768px) 50vw, 100vw"
              className={
                isCoverIcon
                  ? "size-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
                  : "size-full object-cover transition-transform duration-500 group-hover:scale-105"
              }
            />
          ) : (
            <div className="size-full bg-surface-sunken grid place-items-center text-text-secondary">
              <ServicePhoto imageUrl="" iconKey={service.icon_key} className="size-full rounded-none shadow-none" />
            </div>
          )}
        </div>

        <div className="p-5 md:p-6 pb-0 flex flex-col flex-1">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h3 className="text-balance text-[1.15rem] font-bold leading-snug text-navy-900 transition-colors group-hover:text-action">
              {service.name}
            </h3>
            {isPopular && (
              <span className="inline-flex items-center rounded-full bg-[#FFF0E5] px-2.5 py-0.5 text-[0.65rem] font-bold text-action tracking-wide shrink-0">
                Popular
              </span>
            )}
          </div>

          <p className="mt-2 line-clamp-3 flex-1 text-[0.925rem] leading-relaxed text-text-secondary">
            {service.short_description || `Complete service carried out at your address by a verified professional.`}
          </p>
        </div>
      </IntentLink>

      <div className="p-5 md:p-6 pt-4 flex-1 flex flex-col justify-end">
        <div className="flex items-end justify-between gap-3 border-t border-line/50 pt-5">
          {service.starting_price !== null ? (
            <div className="min-w-0">
              <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">
                Starts at
              </span>
              <span data-numeric className="mt-1 block text-lg font-extrabold tabular-nums text-navy-900">
                {formatMoney(service.starting_price.amount_paise)}
              </span>
            </div>
          ) : null}

          {renderCartAction("h-8", "text-xs")}
        </div>
      </div>
    </div>
  );
}
