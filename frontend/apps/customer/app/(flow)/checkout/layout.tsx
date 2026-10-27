import type { ReactNode } from "react";

import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate for checkout.
 *
 * The cart stays open to visitors (its summary asks them to sign in before checkout), but
 * checkout itself reads the customer's addresses and places the booking, so opening it by link
 * while signed out sends them to sign in and straight back here.
 */
export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
