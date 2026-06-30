import { SERVICE_CATALOG, slugify } from "./service-catalog";
import type { IconName } from "@/components/ui/ServiceIcons";

export type ServiceCardMeta = {
  icon: IconName;
  color: string;
  subtitle: string;
};

const CATEGORY_DEFAULTS: Record<string, { icon: IconName; color: string }> = {
  "home-services": { icon: "house", color: "#2563eb" },
  "construction-services": { icon: "hard-hat", color: "#ca8a04" },
  "beauty-wellness": { icon: "beauty", color: "#db2777" },
  "event-media-services": { icon: "calendar", color: "#7c3aed" },
  "rental-services": { icon: "car-front", color: "#16a34a" },
  "vehicle-services": { icon: "car-side", color: "#ea580c" },
  "accommodation-services": { icon: "venue", color: "#0891b2" },
  "job-opportunities": { icon: "briefcase", color: "#0d9488" },
  "manpower-support-staff": { icon: "worker", color: "#dc2626" },
  "custom-other-services": { icon: "grid-menu", color: "#7c3aed" },
};

const EXPLICIT_META: Record<string, ServiceCardMeta> = {
  electrician: { icon: "bolt", color: "#ca8a04", subtitle: "All Electrical" },
  "electrical-services": { icon: "bolt", color: "#ca8a04", subtitle: "All Electrical" },
  "plumbing-services": { icon: "faucet", color: "#2563eb", subtitle: "All Plumbing" },
  "carpentry-services": { icon: "hammer", color: "#7c3aed", subtitle: "Carpentry Work" },
  "ac-and-ro-services": { icon: "ac-unit", color: "#0891b2", subtitle: "AC Repair & Install" },
  "cleaning-services": { icon: "broom", color: "#16a34a", subtitle: "Cleaning Services" },
  "painting-services": { icon: "paint-roller", color: "#16a34a", subtitle: "Wall Painting" },
  "appliance-repair": { icon: "toolbox", color: "#ea580c", subtitle: "All Appliances" },
  "home-automation": { icon: "bolt", color: "#7c3aed", subtitle: "Smart Home Setup" },
  "general-labour": { icon: "shovel", color: "#ea580c", subtitle: "Helper, Worker" },
  "mason-work": { icon: "brick-wall", color: "#7c3aed", subtitle: "Brick, Tile Work" },
  "welding-and-fabrication": { icon: "welding-mask", color: "#2563eb", subtitle: "All Welding" },
  "tile-and-flooring-work": { icon: "paint-roller", color: "#16a34a", subtitle: "Floor & Wall" },
  waterproofing: { icon: "faucet", color: "#0891b2", subtitle: "Terrace & Bath" },
  "shuttering-and-steel-work": { icon: "ibeam", color: "#ca8a04", subtitle: "Steel & Formwork" },
  "demolition-work": { icon: "hammer", color: "#dc2626", subtitle: "Breaking & Removal" },
  "civil-and-road-work": { icon: "brick-wall", color: "#7c3aed", subtitle: "Road & Drainage" },
  "facial-and-skin-care": { icon: "beauty", color: "#db2777", subtitle: "Facials, Cleanup" },
  "hair-services": { icon: "beauty", color: "#7c3aed", subtitle: "Cut, Colour, Spa" },
  "waxing-and-threading": { icon: "beauty", color: "#ea580c", subtitle: "Full Body" },
  "makeup-services": { icon: "beauty", color: "#db2777", subtitle: "Party & Bridal" },
  "mehendi-services": { icon: "beauty", color: "#16a34a", subtitle: "Hands & Feet" },
  "manicure-and-pedicure": { icon: "beauty", color: "#0891b2", subtitle: "Nail Care" },
  "bridal-packages": { icon: "beauty", color: "#db2777", subtitle: "Full Bridal" },
  "body-care": { icon: "beauty", color: "#7c3aed", subtitle: "Spa & Massage" },
  photography: { icon: "camera", color: "#dc2626", subtitle: "Photo & Album" },
  videography: { icon: "camera", color: "#2563eb", subtitle: "Video & Reels" },
  decoration: { icon: "arch-flowers", color: "#7c3aed", subtitle: "All Decorations" },
  catering: { icon: "cloche", color: "#ea580c", subtitle: "Food Services" },
  "dj-and-sound": { icon: "headphones-music", color: "#2563eb", subtitle: "DJ, Sound" },
  "event-planning": { icon: "clipboard-check", color: "#16a34a", subtitle: "Full Planning" },
  "entertainment-services": { icon: "calendar-star", color: "#7c3aed", subtitle: "Performers" },
  "editing-and-album-services": { icon: "camera", color: "#0891b2", subtitle: "Edit & Print" },
  "furniture-rental": { icon: "house", color: "#7c3aed", subtitle: "Home & Office" },
  "event-equipment-rental": { icon: "arch-flowers", color: "#db2777", subtitle: "Events & Décor" },
  "construction-equipment-rental": { icon: "hard-hat", color: "#ca8a04", subtitle: "Site Equipment" },
  "vehicle-rental": { icon: "car-front", color: "#2563eb", subtitle: "Car, Van, Truck" },
  "home-appliance-rental": { icon: "toolbox", color: "#ea580c", subtitle: "Fridge, AC, etc." },
  "camera-equipment-rental": { icon: "camera", color: "#dc2626", subtitle: "Cameras & Lenses" },
  "tools-and-machinery-rental": { icon: "tools", color: "#16a34a", subtitle: "Power Tools" },
  "cooling-and-heating-rental": { icon: "ac-unit", color: "#0891b2", subtitle: "AC, Heater" },
  "ride-booking": { icon: "scooter", color: "#7c3aed", subtitle: "Bike, Auto, Car" },
  "taxi-services": { icon: "taxi", color: "#ea580c", subtitle: "Outstation, Local" },
  "goods-transport": { icon: "truck", color: "#16a34a", subtitle: "Mini to Truck" },
  "vehicle-repair": { icon: "wrench", color: "#16a34a", subtitle: "All Vehicles" },
  "vehicle-washing": { icon: "car-side", color: "#0891b2", subtitle: "Wash & Detailing" },
  "roadside-assistance": { icon: "tow-truck", color: "#dc2626", subtitle: "24×7 Support" },
  "ev-services": { icon: "bolt", color: "#16a34a", subtitle: "Charge & Repair" },
  "vehicle-documents-and-insurance": { icon: "doc-shield", color: "#2563eb", subtitle: "All Documents" },
  rooms: { icon: "venue", color: "#0891b2", subtitle: "Daily & Weekly" },
  "pg-accommodation": { icon: "house", color: "#7c3aed", subtitle: "Boys & Girls PG" },
  hostels: { icon: "grad-cap", color: "#2563eb", subtitle: "Student Stay" },
  apartments: { icon: "buildings", color: "#16a34a", subtitle: "Furnished Flats" },
  "rental-properties": { icon: "house", color: "#ca8a04", subtitle: "Long Term Rent" },
  "short-stay": { icon: "venue", color: "#db2777", subtitle: "Hotels & Homestay" },
  "student-accommodation": { icon: "grad-cap", color: "#0d9488", subtitle: "Near Campus" },
  "worker-accommodation": { icon: "worker", color: "#ea580c", subtitle: "Labour Camps" },
  "skilled-jobs": { icon: "briefcase", color: "#16a34a", subtitle: "Trade & Craft" },
  "unskilled-jobs": { icon: "worker", color: "#ca8a04", subtitle: "Field & Site" },
  "technician-jobs": { icon: "tools", color: "#2563eb", subtitle: "Repair & Install" },
  "driver-jobs": { icon: "car-side", color: "#ea580c", subtitle: "All Vehicle Types" },
  "office-jobs": { icon: "buildings", color: "#7c3aed", subtitle: "Admin & Ops" },
  "it-and-software-jobs": { icon: "briefcase", color: "#0891b2", subtitle: "Tech Roles" },
  "healthcare-jobs": { icon: "briefcase", color: "#dc2626", subtitle: "Hospital & Clinic" },
  "work-from-home-jobs": { icon: "house", color: "#0d9488", subtitle: "Remote Roles" },
  "cleaning-staff": { icon: "broom", color: "#16a34a", subtitle: "Home & Office" },
  "logistics-staff": { icon: "truck", color: "#2563eb", subtitle: "Warehouse & Delivery" },
  "event-staff": { icon: "calendar", color: "#7c3aed", subtitle: "Ushers & Crew" },
  drivers: { icon: "car-side", color: "#ea580c", subtitle: "Personal & Commercial" },
  "domestic-staff": { icon: "house", color: "#db2777", subtitle: "Cook, Maid, Nanny" },
  "security-staff": { icon: "shield", color: "#dc2626", subtitle: "Guards & Bouncers" },
  "construction-support-staff": { icon: "hard-hat", color: "#ca8a04", subtitle: "Site Helpers" },
  "office-support-staff": { icon: "briefcase", color: "#0d9488", subtitle: "Reception & Admin" },
  "describe-your-requirement": { icon: "grid-menu", color: "#7c3aed", subtitle: "Tell us your need" },
  "emergency-services": { icon: "warning", color: "#dc2626", subtitle: "Urgent help" },
  "consultation-services": { icon: "headset", color: "#2563eb", subtitle: "Expert advice" },
  "custom-service-requests": { icon: "grid-four", color: "#16a34a", subtitle: "Any custom job" },
};

function fallbackSubtitle(name: string): string {
  if (name.length <= 22) return name;
  return name.split(" ").slice(0, 3).join(" ");
}

export function getCategoryTileMeta(slug: string): { icon: IconName; color: string } {
  return CATEGORY_DEFAULTS[slug] ?? { icon: "grid-menu", color: "#7c3aed" };
}

export function getServiceCardMeta(
  slug: string,
  categorySlug: string,
  serviceName: string
): ServiceCardMeta {
  if (EXPLICIT_META[slug]) return EXPLICIT_META[slug];
  const defaults = CATEGORY_DEFAULTS[categorySlug] ?? { icon: "grid-menu" as IconName, color: "#7c3aed" };
  return {
    icon: defaults.icon,
    color: defaults.color,
    subtitle: fallbackSubtitle(serviceName),
  };
}

export const CATEGORY_HEADER_ICONS: Record<string, IconName> = Object.fromEntries(
  Object.entries(CATEGORY_DEFAULTS).map(([slug, v]) => [slug, v.icon])
) as Record<string, IconName>;

/** Pre-build slug list for validation */
export function allServiceSlugs(): string[] {
  return SERVICE_CATALOG.flatMap((cat) => cat.subServices.map((name) => slugify(name)));
}
