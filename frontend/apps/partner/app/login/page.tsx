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
        <main className="mx-auto w-full max-w-md px-4 py-16 text-text-secondary">
          Loading…
        </main>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}
