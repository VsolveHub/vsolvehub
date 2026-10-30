"use client";

import { describeError } from "@vsolve/query";
import { EmptyState, ErrorState, Skeleton, buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useCustomerSession } from "@/features/session/queries";
import {
  cartMergeConflict,
  cartVersionConflict,
} from "@/features/checkout/conflicts";
import { describeRemovalFailure } from "@/features/checkout/reasons";
import {
  useCart,
  useMergeCart,
  useRemoveCartItem,
  useUpdateCartItem,
  type Cart,
  type CartItem,
  useAddCartItem,} from "@/features/checkout/queries";
import { CartItems, CartVersionNote } from "@/features/checkout/view/cart-items";
import { MergeDialog } from "@/features/checkout/view/merge-dialog";
import { RemoveCartItemDialog } from "@/features/checkout/view/remove-dialog";

import { useCartSuggestions } from "../queries";
import { CartSuggestions } from "./cart-suggestions";
import { CART_PAGE_FRAME } from "./cart-layout";
import { CartStickyBar, CartSummary } from "./cart-summary";

/**
 * The cart.
 *
 * A list of what is being bought, and one way forward. It deliberately does not
 * schedule, price a plan, take an address or confirm anything — those moved to
 * `/checkout`, which is what makes this a page a customer can return to rather
 * than the first screen of a wizard they have to walk again.
 *
 * ## Why login is a link, not an interrupt
 *
 * The old wizard raised login as a modal interrupt the first time a step needed
 * a session, and returned the customer to a step index it had to remember.
 * Checkout is where a session is genuinely first required — an address belongs
 * to an account — so the gate lives on the boundary and `next` carries the
 * destination. Nothing has to be reconstructed on the way back.
 *
 * ## What this component does not compute
 *
 * No total, no eligibility, no grouping. Line amounts come from the cart
 * response; which services could share a visit comes from `useCartSuggestions`.
 */

function CartSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 2 }, (_, index) => (
        <Skeleton key={index} className="h-32 w-full" />
      ))}
    </div>
  );
}

export function CartWorkspace() {
  const session = useCustomerSession();

  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  /**
   * The row the removal dialog is asking about — an **id**, never the row.
   *
   * A `CartItem` held in state is a snapshot of one cart version, and the
   * removal command carries `expected_item_version`. After a version conflict a
   * captured snapshot would resend the version Django just rejected, and Try
   * again would loop against the same refusal forever.
   */
  const [removalItemId, setRemovalItemId] = useState<string | null>(null);
  const [mergeDismissed, setMergeDismissed] = useState(false);

  const cartQuery = useCart();
  const cart: Cart | undefined = cartQuery.data;

  const suggestionsQuery = useCartSuggestions(cart?.version ?? null);
  const addItem = useAddCartItem();
  // Which card is mid-flight, so only that button spins rather than the whole strip.
  const [addingVariantId, setAddingVariantId] = useState<string | null>(null);
  const suggestions = suggestionsQuery.data ?? [];

  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const mergeCart = useMergeCart();

  // Django performs the login merge inside `GET /cart/` and refuses with
  // `cart_merge_conflict` when a human has to choose. Read off the cart response
  // rather than from a separate probe, because a second request would be a
  // second merge attempt.
  const mergeConflict = mergeDismissed ? null : cartMergeConflict(cartQuery.error);

  /**
   * Resolves to `null` the moment the cart no longer contains it, which closes
   * the dialog rather than leaving it asking about a row that is gone.
   */
  const itemPendingRemoval: CartItem | null =
    removalItemId === null
      ? null
      : (cart?.items.find((item) => item.id === removalItemId) ?? null);

  const inlineButtonRef = useRef<HTMLDivElement | null>(null);
  const [isInlineButtonVisible, setIsInlineButtonVisible] = useState(false);

  useEffect(() => {
    const el = inlineButtonRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setIsInlineButtonVisible(entry.isIntersecting);
        }
      },
      {
        threshold: 0.1,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [cart]);

  const isEmpty = cart !== undefined && cart.items.length === 0;

  return (
    // `pb-28` below `lg` keeps the last summary line clear of the pinned continue bar.
    <div className={`${CART_PAGE_FRAME} pb-28 pt-6 lg:pb-16`}>
      <h1 className="text-xl font-bold text-text">Your cart</h1>

      {cartQuery.isPending ? (
        <div className="mt-6">
          <CartSkeleton />
        </div>
      ) : null}

      {cartQuery.isError && mergeConflict === null ? (
        <ErrorState
          className="mt-6"
          title="We could not load your cart"
          message={describeError(cartQuery.error, "read").message}
          actionLabel="Try again"
          onAction={() => void cartQuery.refetch()}
        />
      ) : null}

      {isEmpty ? (
        <EmptyState
          className="mt-6"
          title="Nothing in your cart yet"
          description="Browse services and add what you need. You can book several in one go."
          action={
            <Link href="/catalog" className={buttonStyles({})}>
              Browse services
            </Link>
          }
        />
      ) : null}

      {cart && !isEmpty ? (
        <>
          <div className="mt-1">
            <CartVersionNote cart={cart} />
          </div>

          {/* Items on the left, money and the single action on the right. Stacked below `lg`,
              where a sticky side panel would eat the screen the list needs. */}
          <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
            <div className="min-w-0">
          <div>
            <CartItems
              cart={cart}
              pendingItemIds={pendingItemId === null ? [] : [pendingItemId]}
              onUpdateQuantity={({ item, quantity }: { item: CartItem; quantity: number }) => {
                // One item's mutation touches one item. The id is recorded so
                // only that row disables, and the command carries that row's own
                // version — nothing else in the cart is read, sent or re-derived.
                setPendingItemId(item.id);
                updateItem.mutate(
                  {
                    itemId: item.id,
                    expectedCartVersion: cart.version,
                    expectedItemVersion: item.version,
                    quantity,
                    scope: item.scope,
                  },
                  { onSettled: () => setPendingItemId(null) },
                );
              }}
              onRemove={(item) => {
                removeItem.reset();
                setRemovalItemId(item.id);
              }}
            />
          </div>

          {updateItem.isError ? (
            <p className="mt-3 text-sm text-critical" role="alert">
              {cartVersionConflict(updateItem.error) !== null
                ? "Your cart changed somewhere else, so that edit was not applied. We have reloaded it — try again."
                : describeError(updateItem.error, "mutation").message}
            </p>
          ) : null}

          {/* Only once the dialog has closed. While it is open the page behind
              it is inert, so a second copy would be unreadable — and would be
              announced twice the moment the dialog went away. */}
          {removeItem.isError && itemPendingRemoval === null ? (
            <p className="mt-3 text-sm text-critical" role="alert">
              {describeRemovalFailure(removeItem.error).message}
            </p>
          ) : null}

          <CartSuggestions
            suggestions={suggestions}
            isAdding={addItem.isPending}
            addingVariantId={addingVariantId}
            onAdd={(variantId) => {
              setAddingVariantId(variantId);
              addItem.mutate(
                { expectedCartVersion: cart.version, variantId, quantity: 1 },
                { onSettled: () => setAddingVariantId(null) },
              );
            }}
          />

          {addItem.isError ? (
            <p className="mt-3 text-sm text-critical" role="alert">
              {describeError(addItem.error, "mutation").message}
            </p>
          ) : null}
            </div>

            <CartSummary
              cart={cart}
              isAuthenticated={session.isAuthenticated}
              inlineButtonRef={inlineButtonRef}
            />
            <CartStickyBar
              cart={cart}
              isAuthenticated={session.isAuthenticated}
              visible={!isInlineButtonVisible}
            />
          </div>
        </>
      ) : null}

      <RemoveCartItemDialog
        item={itemPendingRemoval}
        isPending={removeItem.isPending}
        errorMessage={
          removeItem.isError ? describeRemovalFailure(removeItem.error).message : null
        }
        onDismiss={() => {
          if (removeItem.isPending) return;
          removeItem.reset();
          setRemovalItemId(null);
        }}
        onConfirm={() => {
          // Read from the derived row, not a captured one: after a conflict this
          // is the version the server currently holds.
          const item = itemPendingRemoval;
          if (item === null || !cart) return;
          setPendingItemId(item.id);
          removeItem.mutate(
            {
              itemId: item.id,
              expectedCartVersion: cart.version,
              expectedItemVersion: item.version,
            },
            {
              onSuccess: () => setRemovalItemId(null),
              onError: (error) => {
                // A conflict and an already-gone item are both answered by the
                // cart re-read the mutation triggers. Closing hands the customer
                // back to the reloaded list, which is what a modal holds inert.
                if (!describeRemovalFailure(error).retryable) setRemovalItemId(null);
              },
              onSettled: () => setPendingItemId(null),
            },
          );
        }}
      />

      <MergeDialog
        conflict={mergeConflict}
        isMerging={mergeCart.isPending}
        errorMessage={mergeCart.isError ? describeError(mergeCart.error, "mutation").message : null}
        onConfirm={(decisions) => {
          if (
            mergeConflict?.customerCartVersion == null ||
            mergeConflict.sessionCartVersion == null
          ) {
            return;
          }
          mergeCart.mutate(
            {
              expectedCustomerCartVersion: mergeConflict.customerCartVersion,
              expectedSessionCartVersion: mergeConflict.sessionCartVersion,
              decisions,
            },
            { onSuccess: () => setMergeDismissed(true) },
          );
        }}
        onRefresh={() => {
          mergeCart.reset();
          void cartQuery.refetch();
        }}
        onDismiss={() => setMergeDismissed(true)}
      />
    </div>
  );
}
