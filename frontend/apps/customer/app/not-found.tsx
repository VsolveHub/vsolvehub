import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles, cn } from "@vsolve/ui";

// Without this the 404 carried the home page's title, so the tab read as if it had loaded.
export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
        Page not found
      </p>
      <h1 className="mt-3 text-2xl font-bold text-text">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-text-secondary">
        The link may be old or mistyped. You can still browse every service from here.
      </p>
      <Link href="/catalog" className={cn(buttonStyles({ size: "lg" }), "mt-6")}>
        Go to services
      </Link>
    </main>
  );
}
