import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import "@flaticon/flaticon-uicons/css/regular/rounded.css";
import "./globals.css";
import { QueryProvider, getQueryClient } from "@vsolve/query";
import { ShellSwitcher } from "@/components/shared/ShellSwitcher";
import { getServerSession } from "@/lib/auth/session";
import { qk } from "@/lib/query/keys";

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
          <HydrationBoundary state={dehydratedState}>
            <ShellSwitcher>{children}</ShellSwitcher>
          </HydrationBoundary>
        </QueryProvider>
      </body>
    </html>
  );
}
