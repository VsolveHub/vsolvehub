"use client";

import Link from "next/link";
import { buttonStyles, formatMoney } from "@vsolve/ui";

import type { Cart } from "@/features/checkout/queries";

/**
 * What the cart costs, and the one action that follows from it.
 *
 * The cart used to show no money at all — the API published none, so the page could only list
 * names and quantities. A basket that will not say what is in it is a basket nobody checks out
 * of, and the number belongs next to the button that commits to it.
 *
 * ## Every figure is the server's
 *
 * `estimate` is computed by `carts.pricing_preview` with the same policy, the same fee and the
 * same inclusive GST as `create_quote`. Nothing here adds, multiplies or rounds — a second
 * implementation in the browser is how a cart and a checkout start disagreeing about a total.
 *
 * ## Why it is called an estimate
 *
 * A quote needs an address and a chosen arrival window; a cart has neither. Saying "estimate"
 * and naming what is still to come is honest. Showing this as a final price and then producing
 * a different one at checkout is the thing that makes people abandon a booking.
 *
 * ## Every service is named
 *
 * One "Services" line hid which of them cost what, which is the first question anybody has when
 * a total surprises them. Each cart line is listed by name, then the services total, then each
 * charge on top of it, then the amount payable. Nothing is folded: the gap between what the work
 * costs and what is due is exactly the thing customers ask about, so it is itemised rather than
 * left to be derived.
 *
 * The visit top-up appears only when it is charged. A ₹0 line is not a charge, and asking
 * somebody to work out that it means nothing is worse than not showing it.
 */
export function CartSummary({
  cart,
  isAuthenticated,
}: {
  cart: Cart;
  isAuthenticated: boolean;
}) {
  const estimate = cart.estimate;

  return (
    <aside
      aria-labelledby="cart-summary-heading"
      className="rounded-card border border-line bg-surface p-6 shadow-card lg:sticky lg:top-24"
    >
      <h2 id="cart-summary-heading" className="text-lg font-extrabold text-navy-900">
        Payment summary
      </h2>

      {estimate === null || estimate === undefined ? (
        <p className="mt-3 text-sm text-text-secondary leading-relaxed">
          We could not work out a price for this cart just now. You can still continue — the
          exact amount is confirmed at checkout before you pay.
        </p>
      ) : (
        <dl className="mt-5 space-y-3 text-sm">
          {cart.items.map((item) => (
            <div key={item.id} className="flex items-baseline justify-between gap-3">
              <dt className="min-w-0 text-text-secondary">
                {item.service_name}
                {item.quantity > 1 ? (
                  <span className="font-semibold text-navy-700"> × {item.quantity}</span>
                ) : null}
              </dt>
              <dd data-numeric className="shrink-0 font-semibold text-navy-900">
                {item.amount === null || item.amount === undefined
                  ? "—"
                  : formatMoney(item.amount.amount_paise)}
              </dd>
            </div>
          ))}

          <div className="flex items-baseline justify-between gap-3 border-t border-line/80 pt-3">
            <dt className="font-bold text-navy-900">Subtotal</dt>
            <dd data-numeric className="font-bold text-navy-900">
              {formatMoney(estimate.subtotal.amount_paise)}
            </dd>
          </div>

          {estimate.minimum_visit_topup.amount_paise > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-text-secondary">
                Minimum visit charge
                <span className="block text-xs text-text-muted">
                  Applied because the work is under the minimum
                </span>
              </dt>
              <dd data-numeric className="font-semibold text-navy-900">
                {formatMoney(estimate.minimum_visit_topup.amount_paise)}
              </dd>
            </div>
          ) : null}

          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-text-secondary">Platform fee</dt>
            <dd data-numeric className="font-semibold text-navy-900">
              {formatMoney(estimate.platform_fee.amount_paise)}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3 border-t border-line/80 pt-3">
            <dt className="font-extrabold text-navy-900 text-base">Amount to pay</dt>
            <dd data-numeric className="text-xl font-extrabold text-navy-900">
              {formatMoney(estimate.total.amount_paise)}
            </dd>
          </div>

          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-xs font-medium text-text-muted">Includes GST</dt>
            <dd data-numeric className="text-xs font-medium text-text-muted">
              {formatMoney(estimate.tax.amount_paise)}
            </dd>
          </div>
        </dl>
      )}

      <div className="mt-6">
        {isAuthenticated ? (
          <Link href="/checkout" className={buttonStyles({ size: "lg", className: "w-full" })}>
            Proceed to checkout
          </Link>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent("/checkout")}`}
            className={buttonStyles({ size: "lg", className: "w-full" })}
          >
            Log in to continue
          </Link>
        )}
      </div>

      <p className="mt-3.5 text-center text-xs text-text-secondary">
        {isAuthenticated
          ? "You pick a time and address next. Nothing is charged until you confirm."
          : "Your cart is saved and will still be here after you log in."}
      </p>
    </aside>
  );
}
