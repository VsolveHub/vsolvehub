import Link from "next/link";
import { Button, Logo } from "@vsolve/ui";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";

const NAV = [
  { href: "/solutions", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

const FOOTER_COLS = [
  {
    title: "Quick links",
    links: [
      { href: "/dashboard", label: "Partner App" },
      { href: "/solutions", label: "Solutions" },
      { href: "/pricing", label: "Payout Policy" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/contact", label: "Contact Us" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                className="text-sm font-medium text-gray-600 transition-colors hover:text-brand-600"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 md:flex">
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-ink-900"
              >
                Login
              </Link>
              <Link href="/login">
                <Button size="sm">Become a Partner</Button>
              </Link>
            </div>
            <MarketingMobileNav items={NAV} />
          </div>
        </div>
      </header>

      {children}

      <footer className="bg-ink-900 text-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Logo dark />
            <p className="mt-4 max-w-xs text-sm">
              Empowering local service providers across India with modern tools and massive
              customer reach.
            </p>
          </div>
          {FOOTER_COLS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50">
                {col.title}
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-5 py-6 text-center text-sm text-white/50">
            © {new Date().getFullYear()} V Solve Hub. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
