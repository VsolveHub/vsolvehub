import Link from "next/link";
import { buttonStyles, cn } from "@vsolve/ui";

/**
 * Shown for an unknown category or service slug.
 *
 * Distinct from the catalog error boundary on purpose: "this does not exist" and
 * "we could not reach our catalogue" need different words and different actions.
 * Collapsing them is how a customer is told a service was removed when the API
 * was simply down.
 */
export default function CatalogNotFound() {
  return (
    <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center sm:px-6">
      <h1 className="text-2xl font-bold text-text">We could not find that service</h1>
      <p className="mt-2 text-text-secondary">
        It may have been renamed or is no longer offered. Everything we currently do is on the
        services page.
      </p>
      <Link href="/catalog" className={cn(buttonStyles({ size: "lg" }), "mt-6")}>
        Browse all services
      </Link>
    </main>
  );
}
