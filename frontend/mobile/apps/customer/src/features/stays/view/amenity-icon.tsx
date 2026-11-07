import {
  ArrowUpDown,
  Car,
  Check,
  Coffee,
  Droplets,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Wind,
  Zap,
} from "lucide-react-native";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

const AMENITY_ICONS: Record<string, ComponentType<SvgProps & { size?: number; color?: string }>> = {
  ac: Wind,
  wifi: Wifi,
  power_backup: Zap,
  cctv: ShieldCheck,
  housekeeping: Sparkles,
  hot_water: Droplets,
  parking: Car,
  lift: ArrowUpDown,
  food: UtensilsCrossed,
  breakfast: Coffee,
};

export function getAmenityIcon(key: string): ComponentType<SvgProps & { size?: number; color?: string }> {
  return AMENITY_ICONS[key] ?? Check;
}
