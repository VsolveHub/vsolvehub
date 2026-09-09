"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@vsolve/ui";
import type { Schemas } from "@vsolve/api-client";

import {
  useAddCartItem,
  useCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from "@/features/checkout/queries";
import type { ServiceCard } from "../client-queries";
import { serviceHref } from "../service-href";

/** Real backend shape for an A7 rental vendor storefront card (§4.1a). */
export type RentalListingGroupBrief = Schemas["RentalListingGroup"];

export function TileCatalogAddButton({
  service,
  categorySlug,
  label = "Add",
  size = "card",
  variantId,
  onNeedChoice,
  rentalListing,
}: {
  service: ServiceCard;
  categorySlug: string;
  label?: string;
  size?: "card" | "panel";
  /** Overrides `service.bookable_variant_id` so the panel footer can add the selected option. */
  variantId?: string | null;
  /** Opens the right-docked panel instead of adding from the catalog card. */
  onNeedChoice?: () => void;
  /** Pass rental asset metadata when available in rental services */
  rentalListing?: RentalListingGroupBrief | null;
}) {
  const router = useRouter();
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  /** Catalog-row Add always opens the panel; the panel footer still adds a specific variant. */
  const opensPanel = Boolean(onNeedChoice) && variantId == null;

  const isRental =
    service.request_archetypes.includes("A7_RENTAL") ||
    categorySlug === "rental-services";

  const isPanel = size === "panel";

  const resolvedVariantId = variantId ?? service.bookable_variant_id;
  const cart = cartQuery.data;
  const cartItem = cart?.items.find((item) => item.variant_id === resolvedVariantId);
  const cartUnavailable = cartQuery.isLoading || cart === undefined;
  const isAdding = addItem.isPending;
  const isUpdating = updateItem.isPending;
  const isRemoving = removeItem.isPending;

  const handleAdd = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (opensPanel && onNeedChoice) {
      // Catalog-row tap: for a rental this still opens the detail panel, which
      // renders the real vendor list (§4.1a) instead of a single hidden vendor.
      onNeedChoice();
      return;
    }

    if (isRental) {
      // A7 rentals are a marketplace-of-sellers, not A1's single-dispatch
      // model: there is no generic "add to cart" here. `rentalListing` is the
      // vendor card the customer is looking at (panel footer selection); with
      // no listing resolved yet, send them to the service page where the
      // vendor list lives.
      if (rentalListing) {
        router.push(`/rentals/checkout/${rentalListing.asset_id}`);
      } else {
        router.push(serviceHref(service, categorySlug));
      }
      return;
    }

    if (resolvedVariantId) {
      if (isAdding || cartUnavailable || !cart) return;
      addItem.mutate({
        expectedCartVersion: cart.version,
        variantId: resolvedVariantId,
        quantity: 1,
      });
      return;
    }

    router.push(serviceHref(service, categorySlug));
  };

  const handleIncrement = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (cart && cartItem && !isUpdating) {
      updateItem.mutate({
        expectedCartVersion: cart.version,
        expectedItemVersion: cartItem.version,
        itemId: cartItem.id,
        quantity: cartItem.quantity + 1,
      });
    }
  };

  const handleDecrement = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

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

  // Render stepper for regular cart item
  if (cartItem && !opensPanel && !isRental) {
    return (
      <div
        role="group"
        aria-label="Quantity in cart"
        className={cn(
          "inline-flex shrink-0 items-center justify-between gap-3 border border-line bg-white shadow-2xs",
          isPanel ? "h-11 rounded-xl px-3.5 min-w-[10rem]" : "h-9 rounded-lg px-2.5"
        )}
      >
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 font-bold text-action hover:underline text-xs sm:text-sm"
        >
          View Cart
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="size-3.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 4.5 5.5 5.5-5.5 5.5" />
          </svg>
        </Link>
        <div className="flex items-center gap-2 border-l border-line/60 pl-2">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={isUpdating || isRemoving}
            aria-label="Remove one"
            className="text-action font-extrabold text-base px-1 hover:text-[#C2410C] disabled:opacity-50 cursor-pointer"
          >
            −
          </button>
          <output
            aria-live="polite"
            className={cn(
              "min-w-[18px] text-center font-black text-navy-900 tabular-nums",
              isPanel ? "text-sm" : "text-xs"
            )}
          >
            {cartItem.quantity}
          </output>
          <button
            type="button"
            onClick={handleIncrement}
            disabled={isUpdating}
            aria-label="Add one"
            className="text-action font-extrabold text-base px-1 hover:text-[#C2410C] disabled:opacity-50 cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    );
  }

  const rentalLabel = rentalListing ? "Reserve" : "View vendors";
  const buttonLabel = isRental ? rentalLabel : isAdding ? "Adding..." : label;
  const buttonDisabled = isRental
    ? false
    : !opensPanel && Boolean(resolvedVariantId) && (isAdding || cartUnavailable);

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={buttonDisabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-navy-900 font-bold text-white shadow-xs transition-colors hover:bg-navy-800 disabled:opacity-50 cursor-pointer",
        isPanel ? "h-11 min-w-[8.5rem] rounded-xl px-5 text-sm" : "h-9 rounded-lg px-4 text-[13px]"
      )}
    >
      {buttonLabel}
    </button>
  );
}
