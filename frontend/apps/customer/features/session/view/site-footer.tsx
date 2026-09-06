import Link from "next/link";
import { Logo } from "@vsolve/ui";
import { Instagram, Facebook, Linkedin, Youtube } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="hidden md:block bg-[#FAF9F7] pt-14 pb-10 text-navy-900 border-t border-line">
      <div className="mx-auto max-w-[1216px] px-4 sm:px-6 lg:px-8">
        {/* Desktop Detailed Footer matching mockup */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-5">
          {/* Brand Column */}
          <div className="flex flex-col gap-3 md:col-span-1">
            <Link href="/" aria-label="V Solve Hub home" className="inline-block transition-opacity hover:opacity-90">
              <Logo className="h-6 w-auto" />
            </Link>
            <p className="text-xs leading-relaxed text-text-secondary max-w-xs mt-1 font-medium">
              Professional home services you can trust. We bring expertise directly to your door.
            </p>
          </div>

          {/* Company Column */}
          <div className="flex flex-col gap-3">
            <h4 className="font-bold text-sm text-navy-900">Company</h4>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/about" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>

          {/* Support Column */}
          <div className="flex flex-col gap-3">
            <h4 className="font-bold text-sm text-navy-900">Support</h4>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/contact" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  Help Center
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Partners Column */}
          <div className="flex flex-col gap-3">
            <h4 className="font-bold text-sm text-navy-900">Partners</h4>
            <ul className="flex flex-col gap-2">
              <li>
                <Link href="/join-pro" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  Become a Partner
                </Link>
              </li>
              <li>
                <Link href="/host" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  Host With Us
                </Link>
              </li>
              <li>
                <Link href="/corporate" className="text-xs font-medium text-text-secondary hover:text-signal-700 transition-colors">
                  Corporate Solutions
                </Link>
              </li>
            </ul>
          </div>

          {/* Follow Us Column */}
          <div className="flex flex-col gap-3">
            <h4 className="font-bold text-sm text-navy-900">Follow Us</h4>
            <div className="flex items-center gap-3 text-navy-800">
              <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="hover:text-signal-600 transition-colors">
                <Instagram className="h-4 w-4" />
              </a>
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="hover:text-signal-600 transition-colors">
                <Facebook className="h-4 w-4" />
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="hover:text-signal-600 transition-colors">
                <Linkedin className="h-4 w-4" />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="hover:text-signal-600 transition-colors">
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        <div className="flex mt-10 flex-col sm:flex-row items-center justify-between gap-4 border-t border-line/80 pt-6">
          <p className="text-xs font-medium text-text-muted">
            © 2026 V Solve Hub. All rights reserved.
          </p>
          <p className="text-xs font-medium text-text-muted flex items-center gap-1">
            Made with <span className="text-red-500">❤️</span> in Hyderabad
          </p>
        </div>
      </div>
    </footer>
  );
}
