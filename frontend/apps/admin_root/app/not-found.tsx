import Link from "next/link";

/**
 * Reachable without a session, so it describes the route and nothing about the
 * system behind it. The previous copy pointed at a readiness dashboard and named
 * "backend contracts" as the reason a page was missing; both told an anonymous
 * visitor more about our build state than about their mistake.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-info-text">
        Operations
      </p>
      <h1 className="mt-3 text-2xl font-bold text-text">Console page not found</h1>
      <p className="mt-3 text-sm text-text-secondary">
        That address does not match anything in this console. Check the link, or
        start again from the beginning.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-control bg-action-secondary px-5 text-sm font-semibold text-action-secondary-text transition-colors hover:bg-action-secondary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        Back to sign in
      </Link>
    </main>
  );
}
