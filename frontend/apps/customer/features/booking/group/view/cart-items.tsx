"use client";

import { Button, EmptyState } from "@vsolve/ui";
import { useId } from "react";

import type { Cart, CartItem } from "../queries";

/**
 * The cart, one row per item the server returned.
 *
 * Every item is rendered independently from `cart.items`. There is no "the item"
 * anywhere in this component and no assumption about how many there are, which
 * is what makes adding a second service an ordinary render rather than a special
 * case.
 *
 * Quantity is the only editable field here. Scope answers belong to the service
 * page that collected them, and re-asking for them in a list row would produce a
 * second, smaller copy of that form.
 */

export interface CartItemsProps {
  cart: Cart;
  /** Ids of items with a mutation in flight, so only those rows disable. */
  pendingItemIds: readonly string[];
  onUpdateQuantity: (input: { item: CartItem; quantity: number }) => void;
  /**
   * Null when removal is not integrable.
   *
   * The published contract still exposes `DELETE /cart/items/{id}/` with no request body,
   * while Django requires the cart and item versions in one. Rather than send a
   * command the server will reject, the row explains the limitation. See
   * `contracts/proposals/0007-cart-item-removal-body.md` and the boundary
   * rendered below.
   */
  onRemove: ((item: CartItem) => void) | null;
  /** Why removal is unavailable, when it is. */
  removalBoundary: string | null;
}

function QuantityStepper({
  item,
  disabled,
  onChange,
}: {
  item: CartItem;
  disabled: boolean;
  onChange: (quantity: number) => void;
}) {
  const labelId = useId();

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm text-text-secondary">
        Quantity
      </span>
      <div className="flex items-center gap-1" role="group" aria-labelledby={labelId}>
        <Button
          variant="outline"
          size="sm"
          // One is the server's minimum. Going lower is a removal, and a
          // stepper that quietly deletes a line is not a stepper.
          disabled={disabled || item.quantity <= 1}
          aria-label={`Reduce ${item.service_name} quantity`}
          onClick={() => onChange(item.quantity - 1)}
        >
          −
        </Button>
        <output
          className="min-w-8 text-center text-sm font-semibold tabular-nums text-text"
          aria-live="polite"
        >
          {item.quantity}
        </output>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={`Increase ${item.service_name} quantity`}
          onClick={() => onChange(item.quantity + 1)}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function ScopeSummary({ scope }: { scope: CartItem["scope"] }) {
  const entries = Object.entries(scope).filter(([, value]) => value !== null && value !== "");
  if (entries.length === 0) return null;

  return (
    <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
      {entries.map(([code, value]) => (
        <div key={code} className="flex gap-1">
          {/* The scope schema's own question codes. Humanised for reading, never
              renamed: a label invented here would drift from the form that
              collected the answer. */}
          <dt className="font-medium">{code.replace(/[_-]+/g, " ")}:</dt>
          <dd>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function CartItemRow({
  item,
  isPending,
  onUpdateQuantity,
  onRemove,
  removalBoundary,
}: {
  item: CartItem;
  isPending: boolean;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: (() => void) | null;
  removalBoundary: string | null;
}) {
  return (
    <li className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-text">{item.service_name}</h3>
          <p className="text-sm text-text-secondary">{item.variant_name}</p>
          <ScopeSummary scope={item.scope} />
        </div>

        {onRemove ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            aria-label={`Remove ${item.service_name}`}
            onClick={onRemove}
          >
            Remove
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <QuantityStepper item={item} disabled={isPending} onChange={onUpdateQuantity} />
      </div>

      {onRemove === null && removalBoundary !== null ? (
        <p className="mt-3 text-sm text-text-secondary">{removalBoundary}</p>
      ) : null}
    </li>
  );
}

export function CartItems({
  cart,
  pendingItemIds,
  onUpdateQuantity,
  onRemove,
  removalBoundary,
}: CartItemsProps) {
  if (cart.items.length === 0) {
    return (
      <EmptyState
        title="Nothing in your booking yet"
        description="Choose a service from the catalog and it will appear here. You can add more than one before you book."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {cart.items.map((item) => (
        <CartItemRow
          key={item.id}
          item={item}
          isPending={pendingItemIds.includes(item.id)}
          onUpdateQuantity={(quantity) => onUpdateQuantity({ item, quantity })}
          onRemove={onRemove ? () => onRemove(item) : null}
          removalBoundary={removalBoundary}
        />
      ))}
    </ul>
  );
}

/**
 * The cart's own concurrency state, shown once rather than per row.
 *
 * The version is not decoration: it is what every command is checked against, so
 * when a conflict sends the customer back here the number they see is the number
 * the next command will carry.
 */
export function CartVersionNote({ cart }: { cart: Cart }) {
  return (
    <p className="text-sm text-text-secondary">
      {cart.items.length} {cart.items.length === 1 ? "service" : "services"} · saved version{" "}
      <span className="tabular-nums">{cart.version}</span>
    </p>
  );
}
