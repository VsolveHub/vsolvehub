import {
  ArrowUpDown,
  Car,
  Check,
  Coffee,
  Droplets,
  Shirt,
  ShieldCheck,
  Sparkles,
  UtensilsCrossed,
  Wifi,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * The icon for each amenity key the server sends. Labels come from the server;
 * only the picture is chosen here. An unknown key gets a plain check mark.
 */
const AMENITY_ICONS: Record<string, LucideIcon> = {
  ac: Wind,
  wifi: Wifi,
  power_backup: Zap,
  cctv: ShieldCheck,
  housekeeping: Sparkles,
  laundry: Shirt,
  hot_water: Droplets,
  parking: Car,
  lift: ArrowUpDown,
  food: UtensilsCrossed,
  breakfast: Coffee,
};

export function amenityIcon(key: string): LucideIcon {
  return AMENITY_ICONS[key] ?? Check;
}
