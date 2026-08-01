import { cn } from "./cn";

/**
 * Brand lockup: the V Solve Hub emblem + wordmark. The emblem PNG has a white
 * backing (the source art carries 3D shadows), so on dark surfaces we sit it on
 * a white disc; on light surfaces it blends. `/logo-mark.png` ships in each
 * app's public/ folder.
 */
export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold", className)}>
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full",
          dark && "bg-white",
        )}
      >
        <img src="/logo-mark.png" alt="V Solve Hub" className="h-full w-full object-contain" />
      </span>
      <span className={cn(dark ? "text-white" : "text-ink-900")}>
        V Solve <span className="text-brand-600">Hub</span>
      </span>
    </span>
  );
}
