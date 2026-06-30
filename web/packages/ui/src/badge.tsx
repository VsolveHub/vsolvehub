import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "success" | "warning" | "danger" | "brand" | "neutral";

const tones: Record<Tone, string> = {
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  brand: "bg-brand-50 text-brand-700",
  neutral: "bg-gray-100 text-gray-600",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
