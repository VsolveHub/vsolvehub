import Link from "next/link";
import { Logo } from "@vsolve/ui";

export function SiteFooter() {
  return (
    <footer className="bg-[#E5E1DC] pt-12 pb-24 md:pt-16 md:pb-12 text-navy-900 border-t border-[#D9D4CC]">
      <div className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8">
        
        {/* Mobile Minimal Footer */}
        <div className="flex md:hidden flex-col items-center justify-center text-center">
          <Link href="/" aria-label="V Solve Hub home" className="inline-block transition-opacity hover:opacity-90">
            <span className="font-bold tracking-tight text-xl text-navy-900">V Solve Hub</span>
          </Link>
          <p className="mt-4 text-xs font-medium leading-relaxed text-navy-800 max-w-[280px]">
            Professional home services you can trust. We bring expertise directly to your door.
          </p>
          
          <div className="flex items-center gap-6 mt-8 text-xs font-semibold text-navy-800">
            <Link href="/privacy" className="hover:text-action transition-colors">Company</Link>
            <Link href="/contact" className="hover:text-action transition-colors">Support</Link>
            <Link href="/join-pro" className="hover:text-action transition-colors">Partners</Link>
          </div>
          
          <p className="mt-10 text-[0.65rem] font-medium text-navy-800/60">
            © 2026 V Solve Hub. All rights reserved.
          </p>
        </div>

        {/* Desktop Detailed Footer */}
        <div className="hidden md:grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-8">
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
            </ul>
          </div>

          {/* Support Column */}
          <div className="flex flex-col gap-4">
            <h4 className="font-bold text-base text-navy-900">Support</h4>
            <ul className="flex flex-col gap-3">
              <li>
                <Link href="/contact" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-sm font-medium text-navy-800 hover:text-action transition-colors">
                  Contact Us
                </Link>
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

        <div className="hidden md:flex mt-12 md:mt-16 flex-col md:flex-row items-center justify-between gap-4 border-t border-navy-900/10 pt-8">
          <p className="text-xs font-medium text-navy-800/80">
            © {new Date().getFullYear()} V Solve Hub. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
