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
      <span className={cn("font-sans font-extrabold tracking-tight text-[1.15rem]", dark ? "text-white" : "text-navy-900")}>
        V Solve <span className={dark ? "text-[#FF8F50]" : "text-[#EA580C]"}>Hub</span>
      </span>
    </span>
  );
}
