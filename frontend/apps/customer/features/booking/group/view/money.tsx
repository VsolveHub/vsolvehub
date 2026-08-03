import { formatMoney } from "@vsolve/ui";

import type { Schemas } from "@vsolve/api-client";

/**
 * Renders a server `Money` value and nothing else.
 *
 * The only arithmetic anywhere in this feature is inside `formatMoney`, which
 * divides one integer paise value by 100 for display. No component adds,
 * allocates, rounds or compares amounts: every subtotal, fee, tax, allocation
 * and total on screen is a separate field Django calculated and sent.
 *
 * Taking the whole `Money` object rather than a number is deliberate. A bare
 * `amount_paise` invites a caller to compute one, and the currency travels with
 * the amount so a future non-INR value cannot be silently rendered as rupees.
 */
export function Money({
  value,
  className,
}: {
  value: Schemas["Money"];
  className?: string;
}) {
  if (value.currency !== "INR") {
    // The formatter is INR-only. Showing the wrong symbol on a real amount is a
    // worse failure than showing an unformatted one.
    return (
      <span className={className}>
        {value.currency} {value.amount_paise / 100}
      </span>
    );
  }
  return <span className={className}>{formatMoney(value.amount_paise)}</span>;
}
