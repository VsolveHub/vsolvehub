import type { ReactNode } from "react";

import { AccountNav } from "@/features/account/view/account-nav";
import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate and the frame for the whole `/account` tree.
 *
 * One gate at the layout, for the same reason `/bookings` has one: four screens
 * that each decided separately what an expired cookie means is four chances to
 * word a lock-out differently. Every endpoint behind these screens is
 * `IsAuthenticated`, and `CustomerShell` asks for exactly that — no role
 * requirement, so somebody who is both a Customer and a Partner is not locked
 * out of their own addresses by a rule the server does not have.
 *
 * The nav lives here rather than in each page so moving between sections does
 * not re-render it, and so the current section cannot disagree between two
 * screens.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <CustomerShell>
      <div className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6">
        <h1 className="text-xl font-bold text-text">Your profile</h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Your details, preferences and signed-in devices.
        </p>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:gap-10">
          <AccountNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </CustomerShell>
  );
}
