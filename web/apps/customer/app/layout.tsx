import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import "./globals.css";
import { QueryProvider } from "@vsolve/query";
import { ShellSwitcher } from "@/components/shared/ShellSwitcher";

const inter = Inter({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "V Solve Hub — One App, All Solutions",
  description: "Book home services, vehicle repair, events, and more at your doorstep.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              // Prefetch (cheap: just the document) eagerly on hover/pointer-down,
              // but only *prerender* (expensive: runs the full server render) the
              // handful of high-intent routes, and only conservatively. Prerendering
              // every "/*" link on moderate eagerness was hammering the server and
              // making navigation feel slow.
              prefetch: [
                { where: { href_matches: "/*" }, eagerness: "moderate" },
              ],
              prerender: [
                {
                  where: {
                    href_matches: ["/services", "/services/*", "/profile"],
                  },
                  eagerness: "conservative",
                },
              ],
            }),
          }}
        />
      </head>
      <body className={`app-shell ${inter.className}`} suppressHydrationWarning>
        <QueryProvider>
          <ShellSwitcher>{children}</ShellSwitcher>
        </QueryProvider>
      </body>
    </html>
  );
}
