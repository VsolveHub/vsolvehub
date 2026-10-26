import { cn } from "./cn";

/**
 * Loading placeholder.
 *
 * Two rules that keep skeletons honest:
 *
 * 1. A skeleton is `aria-hidden`. It is a visual hint about layout, not content.
 *    The region that owns it carries `aria-busy` and a live message, so a screen
 *    reader hears "Loading services" once instead of nothing at all.
 *
 * 2. A skeleton must match the shape of what actually arrives. A three-line
 *    skeleton that resolves into a one-line row is a layout shift with extra
 *    steps, and it counts against CLS exactly the same.
 *
 * Never use a skeleton to stand in for data that may not exist. An empty result
 * is an `EmptyState`, not a permanent shimmer.
 */

export interface SkeletonProps {
  className?: string;
  /** Renders a pill, for avatars and icon placeholders. */
  circle?: boolean;
}

export function Skeleton({ className, circle = false }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative overflow-hidden block bg-surface-sunken before:absolute before:inset-0 before:-translate-x-full before:animate-[skeleton-shimmer_1.75s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent motion-reduce:before:hidden",
        circle ? "rounded-full" : "rounded-plate",
        className,
      )}
    />
  );
}

/**
 * Wraps a loading region so the placeholder is announced once, correctly.
 *
 * ```tsx
 * <SkeletonRegion loading={isPending} label="Loading available times">
 *   {isPending ? <Skeleton className="h-24 w-full" /> : <SlotGrid slots={slots} />}
 * </SkeletonRegion>
 * ```
 */
export function SkeletonRegion({
  loading,
  label,
  children,
  className,
}: {
  loading: boolean;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div aria-busy={loading || undefined} aria-live="polite" className={className}>
      {loading ? <span className="sr-only">{label}</span> : null}
      {children}
    </div>
  );
}

/** Text-shaped skeleton lines with a shortened last line, as real text wraps. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-4", index === lines - 1 && lines > 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </span>
  );
}
