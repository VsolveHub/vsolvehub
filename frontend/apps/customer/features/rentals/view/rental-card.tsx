"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Wrench } from "lucide-react";
import { Badge, buttonStyles } from "@vsolve/ui";

import { SaveHeart, useSavedItems } from "@/features/part-a";
import { rentalHref } from "@/lib/routes";

import { formatPaise, type RentalAsset } from "../model";

export function getRentalFallbackImage(title?: string, description?: string): string {
  const text = `${title || ""} ${description || ""}`.toLowerCase();

  // 1. Direct match with new dedicated rental photography
  if (text.includes("impact drill") || text.includes("gsb")) {
    return "/catalog/rentals/bosch-corded-impact-drill.jpg";
  }
  if (text.includes("bosch drill")) {
    return "/catalog/rentals/bosch-electric-drill-on-display.jpg";
  }
  if (text.includes("woodworking")) {
    return "/catalog/rentals/carpentry-tool-kit-in-toolbox.jpg";
  }
  if (text.includes("dewalt") || text.includes("heavy duty angle grinder")) {
    return "/catalog/rentals/industrial-electric-angle-grinder.jpg";
  }
  if (text.includes("angle grinder")) {
    return "/catalog/rentals/angle-grinder-cutting-disc.jpg";
  }
  if (text.includes("pressure washer") || text.includes("karcher") || text.includes("kärcher")) {
    return "/catalog/rentals/karcher-k5-high-pressure-washer.jpg";
  }
  if (text.includes("air compressor")) {
    return "/catalog/rentals/portable-air-compressor-50l.jpg";
  }
  if (text.includes("partybox") || text.includes("sound system") || text.includes("jbl")) {
    return "/catalog/rentals/portable-party-speaker-mic.jpg";
  }
  if (text.includes("ladder") || text.includes("telescopic")) {
    return "/catalog/rentals/telescopic-aluminum-ladder-standing.jpg";
  }
  if (text.includes("carpentry tool kit") || text.includes("stanley pro carpentry")) {
    return "/catalog/rentals/toolbox-organized-tools.jpg";
  }
  if (text.includes("voltas") || text.includes("air conditioner")) {
    return "/catalog/rentals/voltas-inverter-split-ac.jpg";
  }
  if (text.includes("welding") || text.includes("esab")) {
    return "/catalog/rentals/welding-machine-white-bg.jpg";
  }
  if (text.includes("pagoda") || (text.includes("tent") && text.includes("waterproof"))) {
    return "/catalog/rentals/white-pagoda-event-tent.jpg";
  }
  if (text.includes("flood lights") || text.includes("stage lights")) {
    return "/catalog/rentals/four-led-floodlights-grid.jpg";
  }

  // 2. Subcategory category tiles
  if (text.includes("tent") || text.includes("shamiana") || text.includes("canopy")) {
    return "/catalog/tiles/tentshamiana.png";
  }
  if (text.includes("sound") || text.includes("speaker") || text.includes("mic") || text.includes("dj") || text.includes("audio")) {
    return "/catalog/tiles/sound-system-rental.png";
  }
  if (text.includes("light") || text.includes("focus") || text.includes("led") || text.includes("flood") || text.includes("lamp")) {
    return "/catalog/tiles/lighting-rental.png";
  }
  if (text.includes("chair") || text.includes("table") || text.includes("sofa") || text.includes("furniture") || text.includes("desk") || text.includes("lounge")) {
    return "/catalog/tiles/event-furniture-rental.png";
  }
  if (text.includes("ac") || text.includes("air condition") || text.includes("cooler") || text.includes("fan")) {
    return "/catalog/tiles/coolingheating.png";
  }
  if (text.includes("appliance") || text.includes("fridge") || text.includes("refrigerator") || text.includes("washing")) {
    return "/catalog/tiles/home-appliance-rental.png";
  }
  if (text.includes("decor") || text.includes("balloon") || text.includes("prop") || text.includes("carpet") || text.includes("flower")) {
    return "/catalog/tiles/decor-items-rent.png";
  }
  if (text.includes("catering") || text.includes("chafing") || text.includes("buffet") || text.includes("vessel") || text.includes("food")) {
    return "/catalog/tiles/catering-equipment.png";
  }
  if (text.includes("compressor") || text.includes("welding") || text.includes("ladder") || text.includes("scaffold") || text.includes("washer")) {
    return "/catalog/tiles/construction-equipment.png";
  }
  if (text.includes("drill") || text.includes("tool") || text.includes("carpenter") || text.includes("carpentry") || text.includes("hammer") || text.includes("grinder") || text.includes("saw")) {
    return "/catalog/tiles/tools-machinery.png";
  }
  if (text.includes("camera") || text.includes("lens") || text.includes("tripod") || text.includes("dslr") || text.includes("video")) {
    return "/catalog/tiles/camera-media-equipment.png";
  }
  return "/catalog/tiles/rental-services.png";
}

interface RentalCardProps {
  asset: RentalAsset;
}

export function RentalCard({ asset }: RentalCardProps) {
  const saved = useSavedItems("rental");
  const fallback = getRentalFallbackImage(asset.title, asset.description);
  const hero =
    (Array.isArray((asset as { media?: { url?: string }[] }).media) &&
      (asset as { media: { url?: string }[] }).media[0]?.url) ||
    fallback;

  return (
    <article className="group relative flex flex-col justify-between overflow-hidden rounded-card border border-line bg-surface p-4 shadow-card transition duration-fast hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised">
      {hero ? (
        <div className="relative mb-3 h-48 w-full overflow-hidden rounded-control bg-surface-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero}
            alt={asset.title}
            className="h-full w-full object-cover transition duration-slow group-hover:scale-[1.03]"
            onError={(e) => {
              if (e.currentTarget.src !== fallback) {
                e.currentTarget.src = fallback;
              }
            }}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-3">
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <Wrench className="size-3" />
              Verified Tool
            </Badge>
            {typeof asset.quantity_available === "number" && asset.quantity_available > 1 ? (
              <Badge tone="neutral" className="text-xs font-bold">
                Qty {asset.quantity_available}
              </Badge>
            ) : null}
          </div>
          <SaveHeart saved={saved.isSaved(asset.id)} onToggle={() => saved.toggle(asset.id)} />
        </div>

        {/* Title and Partner */}
        <div>
          <h3 className="text-lg font-bold text-text group-hover:text-action">
            {asset.title}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-secondary">
            Offered by <span className="font-semibold text-text">{asset.partner_name}</span>
          </p>
        </div>

        {/* Description */}
        {asset.description && (
          <p className="line-clamp-2 text-xs text-text-secondary leading-relaxed">
            {asset.description}
          </p>
        )}

        {/* Location text */}
        {asset.location_text && (
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin className="size-3.5 text-text-muted shrink-0" />
            <span className="truncate">{asset.location_text}</span>
          </div>
        )}

        {/* Price and Action */}
        <div className="mt-1 flex items-center justify-between border-t border-line/60 pt-3">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-text">
                {formatPaise(asset.daily_rate_paise)}
              </span>
              <span className="text-xs text-text-muted font-medium">/day</span>
            </div>
            {asset.deposit_paise && asset.deposit_paise > 0 ? (
              <p className="text-[11px] text-text-muted">
                Deposit: {formatPaise(asset.deposit_paise)}
              </p>
            ) : null}
          </div>
          <Link
            href={rentalHref(asset.slug || asset.id)}
            className={buttonStyles({
              size: "sm",
              className: "inline-flex items-center gap-1 font-bold shadow-xs",
            })}
          >
            Rent Now
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
