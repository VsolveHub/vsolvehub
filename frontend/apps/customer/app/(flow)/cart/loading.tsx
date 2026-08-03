import { Skeleton } from "@vsolve/ui";

/**
 * The route-level shell while the client workspace is being fetched.
 *
 * `/cart` is a server shell around a client workspace, so this covers the gap
 * between navigation and hydration — not a data fetch. It deliberately mirrors
 * the workspace's own layout (progress indicator, then a stack of item cards)
 * so the page does not jump when the real thing arrives.
 */
export default function CartLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <output aria-live="polite" className="block">
        <span className="sr-only">Loading your booking</span>

        <Skeleton className="h-6 w-full max-w-md" />

        <div className="mt-8 flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
      </output>
    </div>
  );
}
