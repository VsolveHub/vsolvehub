"use client";

import { useRouter } from "next/navigation";
import { cn } from "@vsolve/ui";

import {
  useAddCartItem,
  useCart,
  useRemoveCartItem,
  useUpdateCartItem,
} from "@/features/checkout/queries";
import type { ServiceCard } from "../client-queries";
import { serviceHref } from "../service-href";

export function TileCatalogAddButton({
  service,
  categorySlug,
  label = "Add",
  size = "card",
  variantId,
  onNeedChoice,
}: {
  service: ServiceCard;
  categorySlug: string;
  label?: string;
  size?: "card" | "panel";
  /** Overrides `service.bookable_variant_id` so the panel footer can add the selected option. */
  variantId?: string | null;
  /** Opens the right-docked panel instead of adding from the catalog card. */
  onNeedChoice?: () => void;
}) {
  const router = useRouter();
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  /** Catalog-row Add always opens the panel; the panel footer still adds a specific variant. */
  const opensPanel = Boolean(onNeedChoice) && variantId == null;

  const resolvedVariantId = variantId ?? service.bookable_variant_id;
  const cart = cartQuery.data;
  const cartItem = cart?.items.find((item) => item.variant_id === resolvedVariantId);
  const cartUnavailable = cartQuery.isLoading || cart === undefined;
  const isAdding = addItem.isPending;
  const isUpdating = updateItem.isPending;
  const isRemoving = removeItem.isPending;

  const isPanel = size === "panel";

  const handleAdd = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (opensPanel && onNeedChoice) {
      onNeedChoice();
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

  if (cartItem && !opensPanel) {
    return (
      <div
        role="group"
        aria-label="Quantity in cart"
        className={cn(
          "inline-flex shrink-0 items-center overflow-hidden bg-navy-900 text-white shadow-xs",
          isPanel ? "h-11 rounded-xl" : "h-9 rounded-lg",
        )}
      >
        <button
          type="button"
          onClick={handleDecrement}
          disabled={isUpdating || isRemoving}
          aria-label="Remove one"
          className={cn(
            "grid place-items-center text-lg font-semibold leading-none transition-colors hover:bg-navy-800 disabled:opacity-50 cursor-pointer",
            isPanel ? "size-11" : "size-9",
          )}
        >
          −
        </button>
        <output
          aria-live="polite"
          className={cn(
            "min-w-7 text-center font-black tabular-nums",
            isPanel ? "text-sm" : "text-[13px]",
          )}
        >
          {cartItem.quantity}
        </output>
        <button
          type="button"
          onClick={handleIncrement}
          disabled={isUpdating}
          aria-label="Add one"
          className={cn(
            "grid place-items-center text-lg font-semibold leading-none transition-colors hover:bg-navy-800 disabled:opacity-50 cursor-pointer",
            isPanel ? "size-11" : "size-9",
          )}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleAdd}
      disabled={!opensPanel && Boolean(resolvedVariantId) && (isAdding || cartUnavailable)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-navy-900 font-bold text-white shadow-xs transition-colors hover:bg-navy-800 disabled:opacity-50 cursor-pointer",
        isPanel ? "h-11 min-w-[8.5rem] rounded-xl px-5 text-sm" : "h-9 rounded-lg px-4 text-[13px]",
      )}
    >
      {isAdding ? "Adding..." : label}
    </button>
  );
}
