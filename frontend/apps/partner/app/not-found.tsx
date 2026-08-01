import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">
        Partner
      </p>
      <h1 className="mt-3 text-2xl font-bold text-ink-900">Partner page not found</h1>
      <p className="mt-3 text-sm text-gray-500">
        The route may be old, or it may belong to a future Partner onboarding or
        workstream milestone.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
      >
        Back to partner home
      </Link>
    </main>
  );
}
