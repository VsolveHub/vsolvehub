import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={appFont.variable}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
