import Link from "next/link";
import { Logo } from "@vsolve/ui";

import { PUBLIC_API_BASE_URL } from "@/lib/api/config";
import { SUPPORT } from "@/lib/support";

/** Every policy a customer (or a payment reviewer) may need to reach, on any screen size. */
const LEGAL_LINKS = [
  { href: "/contact", label: "Contact Us" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund-policy", label: "Refunds & Cancellation" },
] as const;

export function SiteFooter() {
  return (
    <>
      <MobileFooter />
      <DesktopFooter />
    </>
  );
}

/**
 * Phones get the links, not the four columns: the tab bar already owns navigation there, but the
 * policies and the support address must still be one scroll away on the smallest screen.
 */
function MobileFooter() {
  return (
    <footer className="border-t border-[#D9D4CC] bg-[#E5E1DC] px-4 pt-6 pb-8 text-navy-900 md:hidden">
      <nav aria-label="Policies and support" className="flex flex-wrap gap-x-4 gap-y-2">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="text-xs font-semibold text-navy-800 hover:text-action">
            {link.label}
          </Link>
        ))}
        <a
          href={`${PUBLIC_API_BASE_URL}/api/v1/legal/sample-receipt/`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-navy-800 hover:text-action"
        >
          Sample Receipt
        </a>
      </nav>
      <p className="mt-3 text-xs font-medium text-navy-800/80">
        <a href={`mailto:${SUPPORT.email}`} className="hover:text-action">
          {SUPPORT.email}
        </a>
        {SUPPORT.phone ? (
          <>
            {" · "}
            <a href={SUPPORT.phone.telHref} className="hover:text-action">
              {SUPPORT.phone.display}
            </a>
          </>
        ) : null}
      </p>
      <p className="mt-2 text-[11px] font-medium text-navy-800/70">
        © {new Date().getFullYear()} V Solve Hub. All rights reserved.
      </p>
    </footer>
  );
}

function DesktopFooter() {
  return (
    <footer className="hidden md:block bg-[#E5E1DC] pt-16 pb-12 text-navy-900 border-t border-[#D9D4CC]">
      <div className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8">
        {/* Desktop Detailed Footer */}
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-8">
          {/* Brand Column */}
          <div className="flex flex-col gap-4">
            <Link href="/" aria-label="V Solve Hub home" className="inline-block transition-opacity hover:opacity-90">
              <Logo className="h-6 w-auto" />
            </Link>
            <p className="text-sm leading-relaxed text-navy-800 max-w-xs mt-2 font-medium">
              Professional home services you can trust. We bring expertise directly to your door.
            </p>
          </div>

          {/* Company Column */}
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-base text-navy-900">Company</h4>
            <ul className="flex flex-col gap-3">
              <li>
                <Link href="/privacy" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Refund &amp; Cancellation Policy
                </Link>
              </li>
              <li>
                <a
                  href={`${PUBLIC_API_BASE_URL}/api/v1/legal/sample-receipt/`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-navy-800 hover:text-action transition-colors"
                >
                  Sample Receipt
                </a>
              </li>
            </ul>
          </div>

          {/* Support Column */}
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-base text-navy-900">Support</h4>
            <ul className="flex flex-col gap-3">
              <li>
                <Link href="/contact#faq-heading" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Contact Us
                </Link>
              </li>
              {SUPPORT.phone ? (
                <li>
                  <a href={SUPPORT.phone.telHref} className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                    {SUPPORT.phone.display}
                  </a>
                </li>
              ) : null}
              <li>
                <a href={`mailto:${SUPPORT.email}`} className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  {SUPPORT.email}
                </a>
              </li>
            </ul>
          </div>

          {/* Partners Column */}
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-base text-navy-900">Partners</h4>
            <ul className="flex flex-col gap-3">
              <li>
                <Link href="/join-pro" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Become a Partner
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex mt-12 md:mt-16 flex-col md:flex-row items-center justify-between gap-4 border-t border-navy-900/10 pt-8">
          <p className="text-xs font-medium text-navy-800/80">
            © {new Date().getFullYear()} V Solve Hub. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
