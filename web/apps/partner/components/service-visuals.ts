import {
  Zap,
  Droplets,
  Car,
  Sparkles,
  Wrench,
  Hammer,
  Wind,
  GlassWater,
  Scissors,
  Brush,
  Hand,
  SprayCan,
  Bug,
  Shirt,
  Leaf,
  PawPrint,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import type { Tone } from "./graphics";

export const SERVICE_VISUALS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  electrician: { icon: Zap, tone: "amber" },
  plumber: { icon: Droplets, tone: "sky" },
  carpenter: { icon: Hammer, tone: "brand" },
  "ac-technician": { icon: Wind, tone: "sky" },
  "ro-technician": { icon: GlassWater, tone: "green" },
  "facial-and-cleanup": { icon: Sparkles, tone: "rose" },
  "waxing-and-threading": { icon: Scissors, tone: "rose" },
  "hair-services": { icon: Scissors, tone: "violet" },
  "manicure-and-pedicure": { icon: Hand, tone: "rose" },
  makeup: { icon: Brush, tone: "violet" },
  "home-cleaning": { icon: Sparkles, tone: "green" },
  "sofa-carpet-cleaning": { icon: SprayCan, tone: "green" },
  "pest-control": { icon: Bug, tone: "amber" },
  laundry: { icon: Shirt, tone: "sky" },
  gardening: { icon: Leaf, tone: "green" },
  "pet-grooming": { icon: PawPrint, tone: "amber" },
  veterinary: { icon: Stethoscope, tone: "green" },
  "pet-walking-boarding": { icon: PawPrint, tone: "violet" },
  driver: { icon: Car, tone: "violet" },
  cleaning: { icon: Sparkles, tone: "green" },
};

export function serviceVisual(slug: string) {
  return SERVICE_VISUALS[slug] ?? { icon: Wrench, tone: "brand" as Tone };
}
