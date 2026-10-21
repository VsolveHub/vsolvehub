import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { AccountNav } from "@/features/account/view/account-nav";
import { NotificationBell } from "@/features/notifications/view/notification-bell";
import { CustomerShell } from "@/features/session/view/customer-shell";

/**
 * The session gate and the frame for the whole `/account` tree.
 * Exact 100% visual parity with the mobile & web profile specification.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <CustomerShell>
      <div className="mx-auto w-full max-w-[1216px] bg-[#FAF9F7] px-4 pb-24 pt-3 md:bg-transparent md:px-6 md:pb-16 md:pt-8 lg:px-8">
        {/* Mobile Top Bar: Left Back Arrow, Center Logo, Right Bell with Badge */}
        <div className="flex items-center justify-between pb-3 md:hidden">
          <Link
            href="/"
            aria-label="Go to home"
            className="flex size-9 items-center justify-center rounded-full text-[#0F172A] hover:bg-[#F2EFE9] transition-colors"
          >
            <ChevronLeft className="size-6 stroke-[2.2]" />
          </Link>

          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo-mark.png"
              alt="V Solve Hub"
              width={26}
              height={26}
              className="object-contain"
            />
            <span className="text-[1.25rem] font-extrabold tracking-tight text-[#0F172A]">
              V Solve <span className="text-[#EA580C]">Hub</span>
            </span>
          </Link>

          <div className="relative flex size-9 items-center justify-center">
            <NotificationBell />
          </div>
        </div>

        {/* Heading & Subtitle */}
        <div className="mt-2 md:mt-0">
          <h1 className="min-w-0 text-[1.875rem] font-extrabold leading-[1.15] tracking-tight text-[#0B1B3D] sm:text-[2.125rem] md:text-[2.5rem]">
            Your profile
          </h1>
          <p className="mt-1 max-w-prose text-[15px] leading-relaxed text-[#64748B] md:mt-2 md:text-[1.05rem]">
            Manage your details, preferences and devices.
          </p>
        </div>

        {/* Main Content Area */}
        <div className="mt-5 flex flex-col gap-6 md:mt-10 lg:flex-row lg:gap-12">
          <AccountNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </CustomerShell>
  );
}
