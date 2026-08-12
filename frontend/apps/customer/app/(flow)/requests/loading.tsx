import { Skeleton } from "@vsolve/ui";

/** Shell while the client list is fetched. Mirrors the row layout so nothing jumps. */
export default function RequestsLoading() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      <output aria-live="polite" className="block">
        <span className="sr-only">Loading your requests</span>
        <Skeleton className="h-7 w-48" />
        <div className="mt-8 flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      </output>
    </div>
  );
}
