import { cn } from "../cn";

/**
 * A read-only map, through Google's Maps Embed API.
 *
 * An iframe rather than the JavaScript map: nothing to load until it scrolls
 * into view, nothing to drag, and the Embed API is not billed per view. It needs
 * the Maps Embed API enabled on the same browser key.
 *
 * `place` drops a marker on the point, for a place the owner chose to make
 * public — a rental's pickup shop. `area` centres the view without a marker, for
 * a point that is only an area — a stay property, whose building guests are
 * never shown.
 *
 * Without a key it renders nothing; the page's text address still stands.
 */
export interface MapEmbedProps {
  apiKey: string;
  latitude: string;
  longitude: string;
  mode: "place" | "area";
  /** The iframe's accessible name, e.g. "Map of the pickup location". */
  title: string;
  className?: string;
}

const EMBED_URL = "https://www.google.com/maps/embed/v1/";

export function mapEmbedUrl({
  apiKey,
  latitude,
  longitude,
  mode,
}: Pick<MapEmbedProps, "apiKey" | "latitude" | "longitude" | "mode">): string {
  const point = `${latitude},${longitude}`;
  const params =
    mode === "place"
      ? new URLSearchParams({ key: apiKey, q: point, zoom: "16" })
      : new URLSearchParams({ key: apiKey, center: point, zoom: "14" });
  return `${EMBED_URL}${mode === "place" ? "place" : "view"}?${params.toString()}`;
}

export function MapEmbed({ apiKey, latitude, longitude, mode, title, className }: MapEmbedProps) {
  if (apiKey === "" || latitude === "" || longitude === "") return null;
  return (
    <iframe
      title={title}
      src={mapEmbedUrl({ apiKey, latitude, longitude, mode })}
      loading="lazy"
      className={cn("h-48 w-full rounded-card border border-line bg-surface-sunken", className)}
      allowFullScreen
    />
  );
}
