import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginScreen } from "@/features/session/view/login-screen";

/**
 * The Partner login route.
 *
 * Never cached and never indexed: it reads the current session and a `?next=`
 * return path, so there is nothing here a search engine or a shared cache entry
 * should hold.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    /* `useSearchParams` suspends, and the boundary belongs above the screen so
       the fallback is a page rather than a hole inside one. */
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas text-text relative">
          <main className="mx-auto flex w-full max-w-md items-center justify-center gap-2 px-4 py-32 text-text-secondary">
            Loading…
          </main>
        </div>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}
