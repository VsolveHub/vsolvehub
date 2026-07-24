import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import "./globals.css";
import { QueryProvider, getQueryClient } from "@vsolve/query";
import { ShellSwitcher } from "@/components/shared/ShellSwitcher";
import { getServerSession } from "@/lib/auth/session";
import { qk } from "@/lib/query/keys";

const inter = Inter({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  weight: ["600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Seed the session into the query cache from the server, so the shell doesn't
  // fire a client-side /api/auth/session round-trip on first load. With the 60s
  // default staleTime the hydrated data is fresh, so useSessionQuery reads it
  // without an immediate refetch. Request-scoped client — never shared/leaked.
  const queryClient = getQueryClient();
  const session = await getServerSession();
  queryClient.setQueryData(qk.session(), { user: session });
  const dehydratedState = dehydrate(queryClient);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Production only. In dev there is no build output to prefetch — every
          speculated URL forces Next to compile that route on demand and render it
          server-side, so simply hovering the nav would kick off several 1-3s
          compiles and duplicate SSR passes that compete with the page you are
          actually navigating to.
        */}
        {process.env.NODE_ENV === "production" && (
          <script
            type="speculationrules"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
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
        )}
      </head>
      <body className={`flex flex-col min-h-screen w-full bg-[#f8f9ff] text-[#0b1c30] ${inter.variable} ${plusJakarta.variable} ${inter.className}`} suppressHydrationWarning>
        <QueryProvider>
          <HydrationBoundary state={dehydratedState}>
            <ShellSwitcher>{children}</ShellSwitcher>
          </HydrationBoundary>
        </QueryProvider>
      </body>
    </html>
  );
}
