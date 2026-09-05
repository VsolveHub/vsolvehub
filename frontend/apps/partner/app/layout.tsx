import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { QueryProvider, SessionSync } from "@vsolve/query";
import { ToastProvider } from "@vsolve/ui";

import { PartnerGlobalPopup } from "@/features/notifications/view/partner-global-popup";
import { PartnerAudioUnlock } from "@/features/notifications/view/partner-audio-unlock";
import { PartnerPresenceProvider } from "@/features/presence/view/partner-presence-provider";

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
    default: "Become a Partner — V Solve Hub",
    template: "%s — V Solve Hub Partners",
  },
  description:
    "Join 10,000+ partners earning daily across Telangana. Become a verified technician, beauty, home, or pet service partner on V Solve Hub.",
  openGraph: {
    type: "website",
    siteName: "V Solve Hub Partners",
    url: siteUrl,
  },
  robots: { index: true, follow: true },
  // Small, tab-sized icons (16/32/ico ≈ 0.9–15 KB) so the favicon loads instantly.
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFont.variable}>
      <body className="antialiased">
        <QueryProvider>
          <SessionSync />
          {/* The offer inbox announces a live offer through `useToast`, which
              throws without this. Mounted at the root so the live region exists
              before any message arrives, per the WAI-ARIA pattern the provider
              implements. */}
          <ToastProvider>
            <PartnerPresenceProvider>
              <PartnerAudioUnlock />
              {children}
              <PartnerGlobalPopup />
            </PartnerPresenceProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
