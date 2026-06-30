import { cn } from "./cn";

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", className)}>
      <span
        aria-hidden
        className="inline-block h-6 w-6 rounded-md bg-gradient-to-br from-brand-500 to-accent-500"
      />
      <span className={cn(dark ? "text-white" : "text-ink-900")}>
        V Solve <span className="text-brand-600">Hub</span>
      </span>
    </span>
  );
}
