import type { ReactNode } from "react";

import { AccountNav } from "@/features/account/view/account-nav";
import { NotificationBell } from "@/features/notifications/view/notification-bell";
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
      <div className="mx-auto w-full max-w-[1216px] bg-[#FAF9F7] px-4 pb-24 pt-5 md:bg-transparent md:px-6 md:pb-16 md:pt-8 lg:px-8">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-[1.875rem] font-extrabold leading-[1.15] tracking-tight text-navy-900 sm:text-[2.125rem] md:text-[2.5rem]">
            Your profile
          </h1>
          <div className="md:hidden -mr-1.5 -mt-0.5 shrink-0">
            <NotificationBell />
          </div>
        </div>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-text-secondary md:mt-3 md:text-[1.05rem]">
          Manage your details, communication preferences, and signed-in devices.
        </p>

        <div className="mt-6 flex flex-col gap-6 md:mt-10 lg:flex-row lg:gap-12">
          <AccountNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </CustomerShell>
  );
}
