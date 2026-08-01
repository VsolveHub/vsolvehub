import { Skeleton, SkeletonRegion, SkeletonText } from "@vsolve/ui";

/**
 * Route-level loading shell for `/book/[service]`.
 *
 * Keep this server-renderable and shape-matched to the real booking workspace:
 * a title block, a step rail and the current stage card. That avoids the
 * generic spinner flash while the service config and dynamic workspace load.
 */
export function BookingLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <SkeletonRegion loading label="Loading booking workspace" className="space-y-6">
        <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-8 w-64 max-w-full" />
          <SkeletonText lines={2} className="mt-3 max-w-2xl" />
        </section>

        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <aside className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <Skeleton className="h-5 w-32" />
            <div className="mt-5 space-y-4">
              {["address", "scope", "window", "review"].map((stage) => (
                <div key={stage} className="flex items-center gap-3">
                  <Skeleton circle className="h-9 w-9" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="mt-2 h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          </aside>

          <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
            <Skeleton className="h-6 w-52" />
            <SkeletonText lines={2} className="mt-3 max-w-xl" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
            <Skeleton className="mt-6 h-11 w-40" />
          </section>
        </div>
      </SkeletonRegion>
    </main>
  );
}
