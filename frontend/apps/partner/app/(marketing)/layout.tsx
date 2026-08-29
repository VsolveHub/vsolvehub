import Link from "next/link";
import { Logo } from "@vsolve/ui";
import { ShieldCheck, PhoneCall, Lock, Zap } from "lucide-react";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { MarketingNavCta } from "@/components/marketing-nav-cta";
import { HomeHeroLink } from "@/components/home-hero-link";

const NAV = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/benefits", label: "Earnings & Benefits" },
  { href: "/trades", label: "Trades & Services" },
  { href: "/contact", label: "Support" },
];

const FOOTER_COLS = [
  {
    title: "Partner With Us",
    links: [
      { href: "/apply", label: "Become a Partner" },
      { href: "/solutions", label: "High-Demand Trades" },
      { href: "/pricing", label: "Payout Rates & Schedule" },
      { href: "/#how-it-works", label: "How Onboarding Works" },
      { href: "/apply/capabilities", label: "Contractors & Crew Supply" },
    ],
  },
  {
    title: "Support & Help",
    links: [
      { href: "/contact", label: "24/7 Partner Support Desk" },
      { href: "/#faq", label: "Frequently Asked Questions" },
      { href: "/blog", label: "Partner Guides & Earnings Tips" },
      { href: "/contact", label: "Safety & Emergency Response" },
    ],
  },
  {
    title: "Company & Trust",
    links: [
      { href: "/about", label: "About V Solve Hub" },
      { href: "/contact", label: "Partner Offices & Helpdesk" },
      { href: "/privacy", label: "Privacy & Data Protection" },
      { href: "/terms", label: "Partner Terms & Policies" },
    ],
  },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-text relative">
      {/* Floating Dynamic-Island Navigation with White Background */}
      <div className="fixed top-3 inset-x-0 z-50 px-3 sm:px-6 pointer-events-none">
        <header className="pointer-events-auto mx-auto max-w-6xl xl:max-w-7xl rounded-2xl sm:rounded-full bg-white/95 backdrop-blur-2xl border border-line-strong shadow-[0_12px_32px_rgba(0,17,46,0.12),0_1px_3px_rgba(0,0,0,0.05)] px-3.5 sm:px-5 py-2.5 transition-all duration-300">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Brand & Live Demand Tag */}
            <div className="flex items-center gap-2.5 sm:gap-3">
              <HomeHeroLink className="flex items-center gap-2 group">
                <Logo className="h-6 sm:h-7 w-auto" />
              </HomeHeroLink>

              {/* Live Demand Status Badge */}
              <div className="hidden xl:flex items-center gap-2 rounded-full bg-surface-sunken border border-line px-2.5 py-1 text-[11px]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
                </span>
                <span className="text-text-secondary font-medium">Daily Bookings:</span>
                <span className="text-navy-900 font-bold">1,400+ Active</span>
              </div>
            </div>

            {/* Desktop Center Navigation Capsule */}
            <nav className="hidden lg:flex items-center gap-1 rounded-full bg-surface-sunken/80 border border-line p-1">
              {NAV.map((n) => (
                <Link
                  key={n.label}
                  href={n.href}
                  className="whitespace-nowrap rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold text-text-secondary transition-colors duration-150 hover:bg-surface hover:text-navy-900"
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            {/* Right Action CTA & Mobile Drawer */}
            <div className="flex items-center gap-2">
              <MarketingNavCta />
              <MarketingMobileNav items={NAV} />
            </div>
          </div>
        </header>
      </div>

      {/* Page Content */}
      {children}

      {/* High-End Modern Footer */}
      <footer className="border-t border-navy-800 bg-[#000e29] text-slate-300 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="pointer-events-none absolute left-0 bottom-0 h-96 w-96 bg-signal-500/5 blur-3xl -z-0" />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 bg-navy-500/10 blur-3xl -z-0" />

        <div className="relative z-10 mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 lg:pt-20">
          {/* Top Row: Brand Info + Links Grid */}
          <div className="grid gap-10 lg:grid-cols-12 pb-14 border-b border-navy-800/80">
            {/* Left Brand Summary (5 cols) */}
            <div className="lg:col-span-5 flex flex-col justify-between">
              <div>
                <HomeHeroLink className="flex items-center gap-2 group">
                  <Logo dark className="h-7 w-auto" />
                </HomeHeroLink>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
                  Empowering skilled technicians, electricians, plumbers, drivers, and service
                  entrepreneurs across Telangana with steady local jobs, direct weekly payouts, and
                  modern digital tools.
                </p>
              </div>

              {/* Platform Trust Pills */}
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-slate-200">
                  <ShieldCheck className="h-3.5 w-3.5 text-signal-400 shrink-0" />
                  Verified Platform
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-slate-200">
                  <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  Weekly Payouts
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1 text-slate-200">
                  <Lock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  Bank-Grade Security
                </span>
              </div>
            </div>

            {/* Right Links (7 cols) */}
            <div className="lg:col-span-7 grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-8">
              {FOOTER_COLS.map((col) => (
                <div key={col.title}>
                  <p className="text-xs font-extrabold uppercase tracking-wider text-slate-100">
                    {col.title}
                  </p>
                  <ul className="mt-4 space-y-2.5 text-sm">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <Link
                          href={l.href}
                          className="text-slate-400 transition-colors hover:text-white hover:underline underline-offset-4"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Middle Operational Cities Banner */}
          <div className="py-6 border-b border-navy-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-slate-200">Operational Hubs in Telangana:</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-slate-300">Hyderabad</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-slate-300">Warangal</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-slate-300">Nizamabad</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-slate-300">Karimnagar</span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5 text-slate-300">Khammam</span>
            </div>

            <Link href="/contact" className="inline-flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-bold transition-colors">
              <PhoneCall className="h-3.5 w-3.5" />
              <span>Partner Helpline: +91 (800) 876-5832</span>
            </Link>
          </div>

          {/* Bottom Copyright and Legal Row */}
          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 text-center sm:text-left">
            <p>© {new Date().getFullYear()} V Solve Hub Technologies Pvt. Ltd. All rights reserved.</p>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              <Link href="/privacy" className="hover:text-slate-200 transition-colors">Privacy Policy</Link>
              <span>•</span>
              <Link href="/terms" className="hover:text-slate-200 transition-colors">Terms of Service</Link>
              <span>•</span>
              <Link href="/pricing" className="hover:text-slate-200 transition-colors">Payout Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
