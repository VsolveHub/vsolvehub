import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { QueryProvider, SessionSync } from "@vsolve/query";
import { ToastProvider } from "@vsolve/ui";

import { AppChrome } from "@/features/session/view/app-chrome";
import { CUSTOMER_VIEWPORT_WIDTH_CLASS } from "@/features/session/view/app-chrome-layout";
import { DEFAULT_DESCRIPTION, HOME_TITLE, SITE_NAME, SITE_URL } from "@/lib/site";
import { OneSignalInit } from "@/features/notifications/view/onesignal-init";
import "./globals.css";

const appFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-app",
  display: "swap",
});

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

/**
 * Site-wide metadata. Pages set a bare `title` ("Fan Installation in Hyderabad"); the template adds
 * the brand once. A page title must never carry the brand itself, or it reads twice. The home page
 * is the one exception and uses `title.absolute`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: HOME_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_IN",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  formatDetection: { telephone: false },
  ...(googleVerification ? { verification: { google: googleVerification } } : {}),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#00112e",
};

/**
 * The header sits here, above every route, because navigation is a whole-app
 * concern and because until it existed nothing in this app linked to
 * `/bookings` at all.
 *
 * It is rendered through `AppChrome` rather than directly, because a few screens
 * are not pages inside an app — on a phone the booking flow *is* the app while
 * it is open, with its own header, scroll region and docked action. Those screens
 * claim the viewport and the navigation steps aside; see `lib/focus-mode`.
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
    <html lang="en-IN" className={`${appFont.variable} bg-[#FAF9F7]`} suppressHydrationWarning>
      <body className={`${CUSTOMER_VIEWPORT_WIDTH_CLASS} bg-[#FAF9F7] antialiased`}>
        <QueryProvider showDevtools={false}>
          <ToastProvider>
            <SessionSync />
            {/* The chrome wraps the page rather than sitting above it: the phone
                tab bar is fixed to the bottom of the viewport, so the same
                component that decides whether it renders must also reserve the
                space it covers. See `AppChrome`. */}
            <AppChrome>{children}</AppChrome>
            <OneSignalInit />
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
