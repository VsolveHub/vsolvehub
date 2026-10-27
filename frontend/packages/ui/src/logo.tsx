import { cn } from "./cn";

/**
 * Brand lockup: the V Solve Hub emblem + wordmark. The emblem PNG has a white
 * backing (the source art carries 3D shadows), so on dark surfaces we sit it on
 * a white disc; on light surfaces it blends. `/logo-mark-small.webp` ships in
 * each app's public/ folder.
 *
 * The header draws the emblem at 28 px, so it loads a 112 px WebP (4 KB), not
 * the 256 px `logo-mark.png` (90 KB) — that one stays for the web manifest's
 * install icon. On a slow phone the PNG was competing with the page's own
 * scripts for the first half-second.
 */
export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-bold whitespace-nowrap shrink-0", className)}>
      <span
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full shrink-0",
          dark && "bg-white",
        )}
      >
        <img
          src="/logo-mark-small.webp"
          alt="V Solve Hub"
          width={28}
          height={28}
          className="h-full w-full object-contain"
        />
      </span>
      <span className={cn("font-sans font-extrabold tracking-tight text-[1.15rem] whitespace-nowrap", dark ? "text-white" : "text-navy-900")}>
        V Solve <span className={dark ? "text-[#FF8F50]" : "text-[#EA580C]"}>Hub</span>
      </span>
    </span>
  );
}
