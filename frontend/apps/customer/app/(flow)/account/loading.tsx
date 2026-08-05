import { Skeleton } from "@vsolve/ui";

/** Shell while a section's client component mounts. Mirrors `AccountSection`. */
export default function AccountLoading() {
  return (
    <output aria-live="polite" className="block rounded-card border border-line bg-surface p-5 sm:p-6">
      <span className="sr-only">Loading your account</span>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </output>
  );
}
