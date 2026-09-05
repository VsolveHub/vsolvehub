import type { LucideIcon } from "lucide-react";
import {
  AirVent,
  Armchair,
  Baby,
  Bath,
  Bed,
  Briefcase,
  Building2,
  Cake,
  CalendarDays,
  Camera,
  ChefHat,
  CircleHelp,
  Clock,
  DoorOpen,
  Droplets,
  Fan,
  Flame,
  Flower2,
  Gem,
  Hammer,
  HardHat,
  HeartHandshake,
  Home,
  IndianRupee,
  Landmark,
  Layers,
  Lightbulb,
  Mic,
  Moon,
  Music,
  Package,
  Paintbrush,
  PartyPopper,
  Plug,
  Refrigerator,
  Ruler,
  Scissors,
  ShowerHead,
  Sparkles,
  Store,
  Sun,
  Tent,
  Theater,
  Trees,
  Truck,
  Tv,
  Users,
  UtensilsCrossed,
  Video,
  Wand2,
  WashingMachine,
  Wrench,
  Zap,
} from "lucide-react";

/**
 * A Lucide icon for a catalogue option, matched by keyword — or nothing.
 *
 * ## Why a keyword map and not a code map
 *
 * The catalogue owns the option list and this app does not know its codes in
 * advance: a new option published by Operations must render without a deploy.
 * Matching on words in the code and the label means "Ceiling fan repair" gets a
 * fan whether its code is `fan_repair`, `ceiling_fan` or something nobody here
 * anticipated.
 *
 * ## A missing icon is a monogram, not a wrong icon
 *
 * The fallback is deliberately `null`, and the tile renders the option's first
 * letter instead. A confidently wrong pictogram — a paintbrush on a plumbing
 * job — misleads at a glance, which is the one thing an icon is for. A letter
 * is merely plain.
 *
 * Ordered specific-first: "kitchen deep clean" should match the cleaning rule
 * before the kitchen rule only if cleaning is listed first, so rules whose
 * keywords are narrower sit above the broad room/place rules.
 */
const ICON_RULES: readonly { icon: LucideIcon; keywords: readonly string[] }[] = [
  // Occasions, decor and event scale — first, because their words collide with
  // the trade rules below ("baby shower" is not plumbing, "function hall" is not
  // a party) and because a wedding, a birthday and a pooja used to render as
  // the same popper while "Festival" fell through to a letter. A rupee on every
  // budget tile and a person on every guest tile reads as one scale.
  { icon: HeartHandshake, keywords: ["engagement", "roka"] },
  { icon: Gem, keywords: ["wedding", "sangeet", "reception", "marriage"] },
  { icon: Cake, keywords: ["birthday", "cake", "anniversary"] },
  { icon: Baby, keywords: ["baby", "seemantham", "naming", "cradle"] },
  { icon: Flame, keywords: ["pooja", "festival", "religious", "diwali", "haldi", "havan"] },
  { icon: Briefcase, keywords: ["corporate", "conference", "launch"] },
  { icon: Flower2, keywords: ["flower", "floral", "marigold"] },
  { icon: Theater, keywords: ["stage", "backdrop"] },
  { icon: Tent, keywords: ["mandap", "pandal", "shamiana", "canopy"] },
  { icon: Landmark, keywords: ["function hall", "banquet"] },
  { icon: Trees, keywords: ["lawn", "farmhouse", "garden", "outdoor", "open ground"] },
  { icon: Sun, keywords: ["terrace", "rooftop", "morning"] },
  { icon: Moon, keywords: ["evening", "night"] },
  { icon: Wand2, keywords: ["suggest"] },
  { icon: IndianRupee, keywords: ["₹", "budget", "lakh"] },
  { icon: CircleHelp, keywords: ["not sure"] },
  // Electrical
  { icon: Fan, keywords: ["fan"] },
  { icon: Lightbulb, keywords: ["light", "lamp", "led", "bulb", "chandelier"] },
  { icon: AirVent, keywords: ["ac ", " ac", "air condition", "cooler", "ventilation", "hvac"] },
  { icon: Plug, keywords: ["switch", "socket", "wiring", "electric", "mcb", "db box", "inverter", "power"] },
  // Plumbing
  { icon: ShowerHead, keywords: ["shower", "geyser", "heater"] },
  { icon: Bath, keywords: ["bathroom", "bath", "toilet", "sanitary"] },
  { icon: Droplets, keywords: ["leak", "tap", "pipe", "plumb", "drain", "water", "tank", "motor"] },
  // Painting and finishes
  { icon: Paintbrush, keywords: ["paint", "putty", "texture", "polish", "wallpaper", "distemper"] },
  { icon: Layers, keywords: ["floor", "tile", "ceiling", "drape", "partition"] },
  // Appliances
  { icon: Refrigerator, keywords: ["fridge", "refrigerator"] },
  { icon: WashingMachine, keywords: ["washing machine", "laundry"] },
  { icon: Tv, keywords: ["tv", "television"] },
  // Care, cleaning and beauty
  { icon: Sparkles, keywords: ["clean", "sanit", "pest", "facial", "makeup", "glow"] },
  { icon: Scissors, keywords: ["salon", "hair", "beauty", "groom", "spa", "massage"] },
  // Food
  { icon: ChefHat, keywords: ["cook", "chef", "kitchen"] },
  { icon: UtensilsCrossed, keywords: ["cater", "food", "meal", "buffet", "restaurant", "hospitality", "cafe"] },
  // Events and media
  { icon: Camera, keywords: ["photo", "camera", "shoot"] },
  { icon: Video, keywords: ["video", "film", "drone"] },
  { icon: Music, keywords: ["music", "dj", "sound", "band"] },
  { icon: Mic, keywords: ["mic", "anchor", "host"] },
  { icon: PartyPopper, keywords: ["event", "party", "decor", "function", "balloon", "venue"] },
  // Moving, equipment and crews
  { icon: Truck, keywords: ["transport", "moving", "shift", "delivery", "logistics"] },
  { icon: Package, keywords: ["equipment", "rental", "hire", "machine"] },
  { icon: HardHat, keywords: ["construction", "civil", "site", "mason", "demolition"] },
  { icon: Hammer, keywords: ["carpent", "wood", "install", "fit-out", "fit out", "fabricat"] },
  { icon: Users, keywords: ["crew", "team", "staff", "worker", "labour", "helper", "manpower", "guest"] },
  // Rooms and places — broad, so late
  { icon: Bed, keywords: ["bedroom", "bed "] },
  { icon: Armchair, keywords: ["furniture", "sofa", "chair"] },
  { icon: DoorOpen, keywords: ["door", "gate", "entrance"] },
  { icon: Store, keywords: ["shop", "retail", "store", "showroom"] },
  { icon: Building2, keywords: ["office", "commercial", "building", "shell", "core"] },
  { icon: Home, keywords: ["home", "house", "apartment", "flat", "villa", "residen"] },
  // Time and size — for scale-style questions
  { icon: CalendarDays, keywords: ["day", "week", "month", "date"] },
  { icon: Clock, keywords: ["hour", "shift", "time", "urgent", "today", "tomorrow"] },
  { icon: Ruler, keywords: ["sq ft", "sqft", "size", "area", "measure"] },
  // Generic work — last resort before the monogram
  { icon: Wrench, keywords: ["repair", "fix", "service", "maintenance"] },
  { icon: Zap, keywords: ["new", "other", "custom"] },
];

/**
 * The icon for one option, or null when no rule matches.
 *
 * Null is a real answer the tile handles (a letter monogram), never an error.
 */
export function iconForOption(option: { value: string; label: string }): LucideIcon | null {
  const haystack = `${option.value.replaceAll("_", " ").replaceAll("-", " ")} ${option.label}`.toLowerCase();
  for (const rule of ICON_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword))) return rule.icon;
  }
  return null;
}
