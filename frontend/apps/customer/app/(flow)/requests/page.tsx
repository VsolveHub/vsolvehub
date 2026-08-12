import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles } from "@vsolve/ui";

import { MyRequestsScreen } from "@/features/requirement/view/my-requests-screen";

/**
 * `My requests` — `M2-FE-213`.
 *
 * `force-dynamic` and never indexed, on the same rule Session B applied to the
 * seven Partner workspaces: this is authenticated ground. The rows are fetched
 * in the browser under the caller's own credentials and there is no per-caller
 * data at this layer, but the tree is gated by `CustomerShell` in the layout,
 * which reads the session — so the route is dynamic in the same change that
 * made it gated, rather than being left prerenderable next to a gate.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your requests",
  robots: { index: false, follow: false },
};

export default function RequestsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Your requests</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Jobs you have described, and what is happening to each of them.
          </p>
        </div>
        <Link href="/requests/new" className={buttonStyles({ variant: "primary" })}>
          Describe a job
        </Link>
      </div>

      <div className="mt-6">
        <MyRequestsScreen />
      </div>
    </main>
  );
}
