import { createElement } from "react";

import { iconForService } from "../icon-catalogue/service-icon";

/**
 * Category vs browse-tile artwork.
 *
 * Categories render the authored 3D icon (`object-contain`). Browse tiles
 * (subcategories) render the Service Cover 3D icons the same way — never crop
 * them like a photograph. Bookable service detail pages still use action
 * photographs via `service.cover`.
 */

const TILE_CONTAINER =
  "grid place-items-center overflow-hidden rounded-card shadow-xs aspect-square w-full bg-[#F4F1EC]";

const TILE_IMG_CLASS = "size-[72%] object-contain object-center";

const ILLUSTRATION_BASE = "max-h-full max-w-full object-contain object-center";

/** Desktop card optical tuning — compensates for uneven transparent margins. */
const DESKTOP_CARD_OPTICS: Readonly<Record<string, string>> = {
  technician: `${ILLUSTRATION_BASE} h-[92%] w-[96%]`,
  electrician: `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  plumber: `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  "ac-services": `${ILLUSTRATION_BASE} h-[92%] w-[92%]`,
  beautician: `${ILLUSTRATION_BASE} h-[96%] w-[96%]`,
  "home-services": `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  "pet-services": `${ILLUSTRATION_BASE} h-[94%] w-[88%]`,
  construction: `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  events: `${ILLUSTRATION_BASE} h-[92%] w-[92%]`,
};

/** Featured card — larger fill in the right-hand visual region. */
const DESKTOP_FEATURED_OPTICS: Readonly<Record<string, string>> = {
  technician: `${ILLUSTRATION_BASE} h-[96%] w-[98%]`,
  electrician: `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  plumber: `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  "ac-services": `${ILLUSTRATION_BASE} h-[92%] w-[92%]`,
  beautician: `${ILLUSTRATION_BASE} h-[96%] w-[96%]`,
  "home-services": `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  "pet-services": `${ILLUSTRATION_BASE} h-[94%] w-[90%]`,
  construction: `${ILLUSTRATION_BASE} h-[94%] w-[94%]`,
  events: `${ILLUSTRATION_BASE} h-[92%] w-[92%]`,
};

export type CategoryIllustrationPresentation = "desktop-featured" | "desktop-card";

function illustrationImageClass(
  presentation: CategoryIllustrationPresentation,
  slug?: string,
): string {
  const optics =
    presentation === "desktop-featured" ? DESKTOP_FEATURED_OPTICS : DESKTOP_CARD_OPTICS;
  if (slug && optics[slug]) {
    return optics[slug];
  }
  return presentation === "desktop-featured"
    ? `${ILLUSTRATION_BASE} h-[94%] w-[94%]`
    : `${ILLUSTRATION_BASE} h-[92%] w-[92%]`;
}

/** Mobile tile icon — square card with contained artwork. */
export function CategoryIcon({
  imageUrl,
  className,
}: {
  imageUrl: string;
  className?: string;
}) {
  if (imageUrl !== "") {
    return (
      <span className={`${TILE_CONTAINER} ${className ?? ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className={TILE_IMG_CLASS}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`${TILE_CONTAINER} text-navy-700 ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
      >
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    </span>
  );
}

/**
 * Desktop Curated Services illustration region — artwork scales within the
 * card's image area with per-slug optical tuning. No nested square box.
 */
export function CategoryIllustration({
  imageUrl,
  slug,
  presentation,
  className,
}: {
  imageUrl: string;
  slug?: string;
  presentation: CategoryIllustrationPresentation;
  className?: string;
}) {
  if (imageUrl !== "") {
    return (
      <span
        className={`flex min-h-0 min-w-0 items-center justify-center ${className ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className={illustrationImageClass(presentation, slug)}
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`flex min-h-0 min-w-0 items-center justify-center text-navy-700 ${className ?? ""}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-10"
      >
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    </span>
  );
}

export function ServicePhoto({
  imageUrl,
  iconKey,
  className,
}: {
  imageUrl: string;
  iconKey?: string;
  className?: string;
}) {
  const CONTAINER =
    "grid place-items-center overflow-hidden rounded-card shadow-xs";

  if (imageUrl !== "") {
    const isServiceCover = imageUrl.includes("/Service%20Cover/") || imageUrl.includes("/Service Cover/") || imageUrl.includes("/catalog/tiles/");
    return (
      <span
        className={`${CONTAINER} aspect-square w-full ${
          isServiceCover ? "bg-[#F4F1EC]" : "bg-surface-sunken"
        } ${className ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className={
            isServiceCover
              ? "size-[72%] object-contain object-center"
              : "size-full object-cover object-center"
          }
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={`${CONTAINER} aspect-square w-full bg-surface-sunken text-text-secondary ${className ?? ""}`}
    >
      {createElement(iconForService(iconKey || "service"), {
        className: "size-7",
        strokeWidth: 1.6,
      })}
    </span>
  );
}
