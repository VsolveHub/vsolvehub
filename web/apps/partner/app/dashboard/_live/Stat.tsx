import type { LucideIcon } from "lucide-react";
import { cn } from "@vsolve/ui";
import { Medallion, type Tone } from "@/components/graphics";

type Props = {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: React.ReactNode;
  /** "panel" = dark sidebar stat card; "mini" (default) = white in-app stat card. */
  variant?: "panel" | "mini";
};

export function Stat({ icon: Icon, tone, label, value, variant = "mini" }: Props) {
  const isPanel = variant === "panel";
  return (
    <div className={cn("rounded-2xl p-3", isPanel ? "border border-white/10 bg-white/5" : "border border-border bg-white shadow-sm")}>
      {isPanel ? (
        <Medallion icon={Icon} tone={tone} size={34} />
      ) : (
        <div className="flex items-center justify-between">
          <Medallion icon={Icon} tone={tone} size={30} />
        </div>
      )}
      <p className={cn("mt-2 text-lg font-bold", isPanel ? "text-white" : "text-ink-900")}>{value}</p>
      <p className={cn("text-[10px] uppercase tracking-wide", isPanel ? "text-white/45" : "text-gray-400")}>{label}</p>
    </div>
  );
}
