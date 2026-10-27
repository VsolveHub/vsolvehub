import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import { QueryProvider, SessionSync } from "@vsolve/query";
import { DEFAULT_LOCALE, ToastProvider } from "@vsolve/ui";

import { PartnerGlobalPopup } from "@/features/notifications/view/partner-global-popup";
import { PartnerAudioUnlock } from "@/features/notifications/view/partner-audio-unlock";
import { PartnerPresenceProvider } from "@/features/presence/view/partner-presence-provider";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { PartnerI18nProvider } from "@/i18n/provider";
import { LOCALE_COOKIE_NAME, parseLocale } from "@/i18n/locale-cookie";

import "./globals.css";

const appFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-app",
  display: "swap",
});

/**
 * Pages set a bare `title`; the template adds the brand once. A page title must never carry the
 * brand itself, or it reads twice.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "Become a Service Partner in Hyderabad — V Solve Hub",
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Get booked for home service jobs near you in Hyderabad. Become a verified technician, beauty, home or pet care partner on V Solve Hub and get paid to your bank account.",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read once, server-side, so the first paint already renders in the
  // partner's chosen language — see `i18n/provider.tsx`.
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE;

  return (
    <html lang={locale} className={appFont.variable}>
      <body className="antialiased">
        <PartnerI18nProvider initialLocale={locale}>
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
        </PartnerI18nProvider>
      </body>
    </html>
  );
}
