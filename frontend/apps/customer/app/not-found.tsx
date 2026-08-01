import Link from "next/link";
import { buttonStyles, cn } from "@vsolve/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center sm:px-6">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
        Page not found
      </p>
      <h1 className="mt-3 text-2xl font-bold text-text">This customer page does not exist</h1>
      <p className="mt-3 text-text-secondary">
        The link may be old, or the route may not be part of the current M1
        customer workspace.
      </p>
      <Link href="/catalog" className={cn(buttonStyles({ size: "lg" }), "mt-6")}>
        Go to services
      </Link>
    </main>
  );
}
