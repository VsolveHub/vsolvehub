import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { QueryProvider } from "@vsolve/query";
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
 * No signed-in shell here yet: the customer session (Django OTP) and the
 * browsing/transactional route groups land in the next pass. Catalog and the
 * booking workspace do not require a session provider at this layer — the
 * workspace's own login stage owns authentication inline.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFont.variable} suppressHydrationWarning>
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
