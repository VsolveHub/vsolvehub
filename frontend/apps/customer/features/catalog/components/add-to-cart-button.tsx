"use client";

import { useAddCartItem, useCart, useUpdateCartItem, useRemoveCartItem } from "@/features/checkout/queries";

type AddToCartButtonProps = {
  variantId: string;
  className?: string;
  size?: "default" | "compact";
};

const DEFAULT_CLASS =
  "flex h-[3.25rem] w-full items-center justify-center rounded-md border-2 border-line bg-transparent px-6 text-[0.95rem] font-bold text-navy-900 transition-all hover:border-[#EA580C] hover:text-[#EA580C] active:scale-[0.98] disabled:opacity-50 cursor-pointer";

const COMPACT_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line bg-surface px-4 text-sm font-semibold text-navy-900 transition-colors hover:border-[#EA580C] hover:text-[#EA580C] active:scale-[0.98] disabled:opacity-50 cursor-pointer";

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
        ? "inline-flex min-h-11 w-full items-center justify-between rounded-control border border-line bg-surface px-3 text-sm font-bold text-navy-900 sm:w-auto"
        : "flex h-[3.25rem] w-full items-center justify-between rounded-md border-2 border-line bg-transparent px-6 text-[0.95rem] font-bold text-navy-900";

    return (
      <div className={quantityShellClass}>
        <span className="text-text-secondary font-medium">Added to Cart</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleDecrement}
            disabled={isUpdating || isRemoving}
            className="text-action font-extrabold text-lg px-2 hover:text-[#C2410C] disabled:opacity-50 cursor-pointer"
          >
            -
          </button>
          <span className="font-black text-navy-900 min-w-[20px] text-center">
            {cartItem.quantity}
          </span>
          <button
            type="button"
            onClick={handleIncrement}
            disabled={isUpdating}
            className="text-action font-extrabold text-lg px-2 hover:text-[#C2410C] disabled:opacity-50 cursor-pointer"
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
      className={className || (size === "compact" ? COMPACT_CLASS : DEFAULT_CLASS)}
    >
      {isAdding ? "Adding to Cart..." : "Add to Cart"}
    </button>
  );
}
