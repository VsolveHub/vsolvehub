import Link from "next/link";
import { cn } from "@vsolve/ui";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "all", label: "All-time" },
] as const;

export function RangeTabs({ active }: { active: string }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-white p-1">
      {RANGES.map((r) => (
        <Link
          key={r.value}
          href={`/dashboard/earnings?range=${r.value}`}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            active === r.value ? "bg-brand-600 text-white" : "text-gray-500 hover:text-ink-900",
          )}
        >
          {r.label}
        </Link>
      ))}
    </div>
  );
}
