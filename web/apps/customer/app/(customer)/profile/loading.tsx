import { Skeleton } from "@/components/ui/primitives";

export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-4 p-4" aria-busy="true" aria-label="Loading profile">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={`m-${i}`} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}
