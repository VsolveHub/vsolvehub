import { NextRequest, NextResponse } from "next/server";

/**
 * Reverse-geocoding proxy.
 *
 * Runs server-side so we can attach a compliant User-Agent (required by the
 * OpenStreetMap Nominatim usage policy) and keep the provider swappable behind
 * a stable response shape. To move to Google/Mapbox later, only this route
 * changes — clients keep calling `/api/geocode/reverse`.
 */

export const runtime = "nodejs";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const CONTACT = process.env.GEOCODE_CONTACT_EMAIL || "support@vsolvehub.com";
const USER_AGENT = `VSolveHub/1.0 (${CONTACT})`;

// Upstream can hang; without a ceiling a stalled Nominatim would tie up the
// route until the platform's own request timeout fires.
const FETCH_TIMEOUT_MS = 8_000;

// Per-IP fixed-window limiter so this open proxy can't be scripted into a free
// geocoding relay (which would also breach Nominatim's usage policy and get the
// platform IP blocked). Best-effort per instance — a real deployment behind
// multiple instances should use a shared store (Redis) or an edge WAF rule.
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();
let lastSweep = Date.now();

// Drop windows that have expired so the map can't grow unbounded from one-shot
// IPs that never return. Cheap amortised sweep, at most once per window.
function sweepExpired(now: number): void {
  if (now - lastSweep < RATE_WINDOW_MS) return;
  for (const [ip, entry] of hits) {
    if (now > entry.resetAt) hits.delete(ip);
  }
  lastSweep = now;
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  sweepExpired(now);
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

type NormalizedLocation = {
  houseNumber: string;
  road: string;
  area: string;
  city: string;
  state: string;
  pincode: string;
  fullAddress: string;
  displayName: string;
  lat: number;
  lng: number;
};

function pick(...values: Array<string | undefined>): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

const inRange = (n: number, min: number, max: number): boolean => n >= min && n <= max;

// Parse and validate lat/lng from the query string. Returns null when either is
// missing, non-numeric, or outside the geographic range. Note Number("") and
// Number(null) both coerce to 0, so the presence check must come first.
function parseCoords(req: NextRequest): { lat: number; lng: number } | null {
  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");
  if (!latParam || !lngParam) return null;

  const lat = Number(latParam);
  const lng = Number(lngParam);
  if (!inRange(lat, -90, 90) || !inRange(lng, -180, 180)) return null;
  return { lat, lng };
}

async function fetchNominatim(lat: number, lng: number): Promise<unknown> {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "en",
      Accept: "application/json",
    },
    // Cache identical lookups at the edge for a day; coordinates -> address is stable.
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  return res.json();
}

// Map Nominatim's loose `address` object onto our stable shape, falling back
// through the many tags OSM uses for the same real-world concept.
function normalizeAddress(data: unknown, lat: number, lng: number): NormalizedLocation {
  const d = (data ?? {}) as { address?: Record<string, string | undefined>; display_name?: string };
  const a = d.address ?? {};

  const area = pick(
    a.suburb,
    a.neighbourhood,
    a.quarter,
    a.village,
    a.town,
    a.city_district,
    a.hamlet,
    a.residential,
    a.road,
  );
  const city = pick(a.city, a.town, a.municipality, a.county, a.state_district, a.state);
  const houseNumber = pick(a.house_number);
  const road = pick(a.road, a.pedestrian, a.footway);
  const displayName = pick(d.display_name);

  const compact = [
    [houseNumber, road].filter(Boolean).join(" "),
    area && area !== road ? area : "",
    city && city !== area ? city : "",
    pick(a.postcode),
  ]
    .filter(Boolean)
    .join(", ");

  return {
    houseNumber,
    road,
    area,
    city,
    state: pick(a.state),
    pincode: pick(a.postcode),
    fullAddress: compact || displayName,
    displayName,
    lat,
    lng,
  };
}

export async function GET(req: NextRequest) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }

  const coords = parseCoords(req);
  if (!coords) {
    return NextResponse.json({ error: "Valid lat and lng are required" }, { status: 400 });
  }

  try {
    const data = await fetchNominatim(coords.lat, coords.lng);
    return NextResponse.json(normalizeAddress(data, coords.lat, coords.lng));
  } catch {
    return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 502 });
  }
}
