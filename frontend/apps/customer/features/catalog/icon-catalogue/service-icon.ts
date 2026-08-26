import {
  AirVent,
  Bone,
  Boxes,
  Bug,
  Camera,
  Cctv,
  ClipboardCheck,
  Container,
  Cpu,
  Dog,
  Droplet,
  Droplets,
  Fan,
  Feather,
  Flame,
  Flower2,
  Footprints,
  GlassWater,
  Hammer,
  Hand,
  HardHat,
  KeyRound,
  Laptop,
  LifeBuoy,
  Palette,
  PawPrint,
  PersonStanding,
  Scissors,
  Shapes,
  Siren,
  Smartphone,
  Smile,
  Sofa,
  Sparkle,
  Sparkles,
  SprayCan,
  Sprout,
  Stethoscope,
  Users,
  WashingMachine,
  Waves,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { IconKey } from "../queries";

/**
 * The backend's icon vocabulary, mapped once to this app's icon family.
 *
 * FE-9's rule, and the reason this file is a lookup rather than a heuristic: the
 * catalogue used to infer icons from service-name keywords, and a wrong
 * pictogram is worse than a generic one. "Water Tank Cleaning" matching a
 * cleaning rule instead of a tank rule is not a small error — it tells the
 * customer they are booking something else. So the server owns the vocabulary,
 * a database constraint refuses to publish a service without one, and this file
 * is the only place a key becomes a glyph.
 *
 * `Record<IconKey, LucideIcon>` is doing real work: `IconKey` comes from the
 * generated client, so the day the backend adds a value to `IconKeyEnum` and
 * someone regenerates, **this file stops compiling** until the new key is given
 * a glyph. That is the intended failure. A `Partial<Record<…>>` with a fallback
 * would let a new category ship silently as the generic mark, which is exactly
 * the quiet degradation FE-9 forbids.
 *
 * KNOWN LIMIT, worth raising before this ships: the published vocabulary is
 * trade-level, not service-level — one `electrical` for all 28 electrician
 * services. So a category grid renders 28 identical marks and the icon
 * distinguishes the *trade*, never the service. The service name is doing all
 * the identifying work. Either that is accepted and the grid is designed around
 * it, or `IconKeyEnum` needs finer values from Codex.
 */
const SERVICE_ICONS: Record<IconKey, LucideIcon> = {
  // The explicit generic. Reserved by the backend for a genuinely new service
  // type, so it is a real value rather than a fallback — see `iconForService`.
  service: Shapes,

  // Trades
  electrical: Zap,
  plumbing: Droplets,
  carpentry: Hammer,
  "air-conditioning": AirVent,
  "water-purifier": GlassWater,
  "internet-wifi": Wifi,
  "gas-stove": Flame,
  computer: Laptop,
  mobile: Smartphone,
  "security-camera": Cctv,
  locksmith: KeyRound,
  "home-automation": Cpu,
  "fire-safety": Siren,

  // Beauty and personal care
  "face-care": Smile,
  "beauty-treatment": Sparkles,
  waxing: Sparkle,
  threading: Feather,
  "hair-care": Scissors,
  "nail-care": Hand,
  makeup: Palette,
  mehendi: Flower2,
  "body-care": PersonStanding,
  "skin-care": Droplet,

  // Home services
  "home-cleaning": SprayCan,
  "sofa-carpet": Sofa,
  "pest-control": Bug,
  "water-tank": Container,
  "septic-tank": Waves,
  laundry: WashingMachine,
  gardening: Sprout,
  "swimming-pool": LifeBuoy,
  "chimney-exhaust": Fan,
  "home-organization": Boxes,
  "home-inspection": ClipboardCheck,
  "home-maintenance": Wrench,

  // Pets
  "pet-grooming": Dog,
  veterinary: Stethoscope,
  "pet-walking": Footprints,
  "pet-sitting": PawPrint,
  "pet-training": Bone,
  "pet-photography": Camera,

  // Commercial archetypes
  workforce: Users,
  "custom-project": HardHat,
};

/**
 * Keys already reported, so a mismatch is logged once rather than once per
 * render. A catalogue grid renders hundreds of tiles; a per-render warning would
 * bury the signal it exists to raise.
 */
const reported = new Set<string>();

/**
 * The glyph for a published service.
 *
 * The typed map above covers every key the current contract can produce, so the
 * fallback below is unreachable through TypeScript — it exists for the one case
 * types cannot cover: a server running ahead of this deploy, sending a key added
 * after these types were generated. That degrades to the generic mark rather
 * than crashing a whole catalogue over one unknown service, and says so out
 * loud, because a silent fallback is how a missing mapping survives to
 * production.
 */
export function iconForService(iconKey: string): LucideIcon {
  const icon = SERVICE_ICONS[iconKey as IconKey] as LucideIcon | undefined;
  if (icon !== undefined) return icon;

  if (!reported.has(iconKey)) {
    reported.add(iconKey);
    // Deliberate console use: a contract mismatch is an operational signal, not
    // a user-facing error, and there is no telemetry seam in this app yet.
    console.warn(
      `[catalogue] No icon mapped for icon_key "${iconKey}". ` +
        `The server is publishing a value this build does not know. ` +
        `Add it to SERVICE_ICONS after regenerating the client.`,
    );
  }

  return SERVICE_ICONS.service;
}
