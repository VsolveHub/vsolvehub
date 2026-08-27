import { Skeleton } from "@vsolve/ui";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-48" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-full max-w-xl" />
        <Skeleton className="h-6 w-full max-w-lg" />
        <Skeleton className="h-6 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}
