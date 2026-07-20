import { Skeleton } from "@/components/ui/primitives";

export default function NotificationsLoading() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 p-4" aria-busy="true" aria-label="Loading notifications">
      <Skeleton className="h-10 w-48 rounded-xl" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}
