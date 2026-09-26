import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { QueryProvider, SessionSync } from "@vsolve/query";
import "./globals.css";

const appFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-app",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://admin.vsolvehub.com";

/**
 * `admin` is the physical application name; **Operations** is the product name
 * (AGENTS.md). Everything a person reads says Operations, and nothing here
 * describes what the console can or cannot do yet — this metadata is served to
 * anyone who requests the origin.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "V Solve Hub Operations",
    template: "%s — V Solve Hub Operations",
  },
  description: "Staff sign-in for V Solve Hub Operations.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFont.variable}>
      <body className="antialiased">
        <QueryProvider>
          <SessionSync />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
