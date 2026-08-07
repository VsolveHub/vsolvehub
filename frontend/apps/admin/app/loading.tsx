import { Skeleton } from "@vsolve/ui";

export default function RootLoading() {
  return (
    <div className="space-y-8 animate-pulse p-4 sm:p-6">
      {/* 4 KPI Skeletons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-line rounded-card p-4 space-y-3">
            <Skeleton className="h-4 w-28 rounded bg-warm-200" />
            <Skeleton className="h-8 w-12 rounded bg-warm-200" />
            <Skeleton className="h-3 w-36 rounded bg-warm-200" />
          </div>
        ))}
      </div>

      {/* Main Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-6 w-36 rounded bg-warm-200" />
          <div className="bg-surface border border-line rounded-card overflow-hidden">
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded bg-warm-200" />
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-6">
          <div className="bg-surface border border-line rounded-card p-5 space-y-3">
            <Skeleton className="h-6 w-32 rounded bg-warm-200" />
            <Skeleton className="h-24 w-full rounded bg-warm-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
