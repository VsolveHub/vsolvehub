import { Zap, Droplets, Car, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import type { Tone } from "./graphics";

export const SERVICE_VISUALS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  electrician: { icon: Zap, tone: "amber" },
  plumber: { icon: Droplets, tone: "sky" },
  driver: { icon: Car, tone: "violet" },
  cleaning: { icon: Sparkles, tone: "green" },
};

export function serviceVisual(slug: string) {
  return SERVICE_VISUALS[slug] ?? { icon: Wrench, tone: "brand" as Tone };
}
