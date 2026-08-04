import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { QueryProvider, SessionSync } from "@vsolve/query";

import { SiteHeader } from "@/features/session/view/site-header";
import "./globals.css";

const appFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-app",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vsolvehub.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "V Solve Hub — Book a verified technician",
    template: "%s — V Solve Hub",
  },
  description: "Book home services with a real, eligible professional. Pay after they commit.",
  openGraph: {
    type: "website",
    siteName: "V Solve Hub",
    url: siteUrl,
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The header sits here, above every route, because navigation is a whole-app
 * concern and because until it existed nothing in this app linked to
 * `/bookings` at all.
 *
 * It is *not* an auth gate. Catalog, `/book/[service]` and `/cart` are usable
 * signed out — the anonymous cart is a deliberate product surface — so the
 * header reads the session to decide what to show and never to decide who may
 * pass. The gate lives on the one tree that needs it, `app/(flow)/bookings/`,
 * and the booking workspace keeps its own inline login interrupt so a customer
 * mid-scope is never thrown to a full page.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFont.variable} suppressHydrationWarning>
      <body className="antialiased">
        <QueryProvider>
          <SessionSync />
          <SiteHeader />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
