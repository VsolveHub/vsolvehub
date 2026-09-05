"use client";

import Link from "next/link";
import { cn } from "@vsolve/ui";
import { useAddCartItem, useCart, useUpdateCartItem, useRemoveCartItem } from "@/features/checkout/queries";

type AddToCartButtonProps = {
  variantId: string;
  className?: string;
  size?: "default" | "compact";
};

const DEFAULT_CLASS =
  "flex h-11 w-full items-center justify-center rounded-xl bg-navy-900 px-6 text-sm font-bold text-white shadow-xs transition-all hover:bg-navy-800 active:scale-[0.98] disabled:opacity-50 cursor-pointer";

const COMPACT_CLASS =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-navy-900 px-5 text-xs sm:text-sm font-bold text-white shadow-xs transition-all hover:bg-navy-800 active:scale-[0.98] disabled:opacity-50 cursor-pointer";

export function AddToCartButton({
  variantId,
  className,
  size = "default",
}: AddToCartButtonProps) {
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  const isAdding = addItem.isPending;
  const isUpdating = updateItem.isPending;
  const isRemoving = removeItem.isPending;

  const cart = cartQuery.data;
  const cartItem = cart?.items.find((item) => item.variant_id === variantId);
  const cartUnavailable = cartQuery.isLoading || cart === undefined;

  /**
   * Adds one of this service to the basket.
   *
   * Returns rather than falling back to anything when the basket is not yet
   * known. The catalogue card follows the same rule: a control does what it is
   * named after or it does nothing, and a rare dead tap beats a tap that quietly
   * throws the reader onto another page.
   */
  const handleAddToCart = () => {
    if (isAdding || cartUnavailable || !cart) return;

    addItem.mutate({
      expectedCartVersion: cart.version,
      variantId,
      quantity: 1,
    });
  };

  const handleIncrement = () => {
    if (cart && cartItem && !isUpdating) {
      updateItem.mutate({
        expectedCartVersion: cart.version,
        expectedItemVersion: cartItem.version,
        itemId: cartItem.id,
        quantity: cartItem.quantity + 1,
      });
    }
  };

  const handleDecrement = () => {
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

  if (cartItem) {
    const quantityShellClass =
      size === "compact"
        ? "inline-flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 text-xs sm:text-sm font-bold text-navy-900 sm:w-auto shadow-2xs"
        : "flex h-11 w-full items-center justify-between gap-4 rounded-xl border-2 border-line bg-white px-5 text-sm font-bold text-navy-900 shadow-2xs";

    return (
      <div className={quantityShellClass}>
        <Link
          href="/cart"
          className="inline-flex items-center gap-1 text-action hover:underline font-bold text-xs sm:text-sm"
        >
          View Cart
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} className="size-3.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 4.5 5.5 5.5-5.5 5.5" />
          </svg>
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={isUpdating || isRemoving}
            aria-label="Remove one"
            className="text-action font-extrabold text-lg px-1.5 hover:text-[#C2410C] disabled:opacity-50 cursor-pointer"
          >
            -
          </button>
          <span className="font-black text-navy-900 min-w-[18px] text-center tabular-nums">
            {cartItem.quantity}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            disabled={isUpdating}
            aria-label="Add one"
            className="text-action font-extrabold text-lg px-1.5 hover:text-[#C2410C] disabled:opacity-50 cursor-pointer"
          >
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleAddToCart}
      disabled={isAdding}
      className={cn(size === "compact" ? COMPACT_CLASS : DEFAULT_CLASS, className)}
    >
      {isAdding ? "Adding to Cart..." : "Add to Cart"}
    </button>
  );
}
