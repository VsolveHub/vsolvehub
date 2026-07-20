import { Skeleton } from "@/components/ui/primitives";

export default function CustomerLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[1600px] space-y-4 px-4 py-6 sm:px-6 lg:px-12"
      aria-busy="true"
      aria-label="Loading"
    >
      <Skeleton className="h-[300px] w-full rounded-[32px]" />
      <Skeleton className="h-6 w-64 rounded-lg" />
      <Skeleton className="h-4 w-40 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-4 w-48 rounded-lg" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`b-${i}`} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
