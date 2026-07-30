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
const PHOTON_URL = "https://photon.komoot.io/reverse";
const CONTACT = process.env.GEOCODE_CONTACT_EMAIL || "support@vsolvehub.com";
const USER_AGENT = `VSolveHub/1.0 (${CONTACT})`;

// Public geocoders occasionally stall or throttle. Keep each attempt short and
// fall back to a second OSM-backed provider instead of making the location UI
// wait for the platform timeout.
const FETCH_TIMEOUT_MS = 3_500;

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

type PhotonFeature = {
  properties?: Record<string, string | undefined>;
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

async function fetchPhoton(lat: number, lng: number): Promise<unknown> {
  const url = `${PHOTON_URL}?lat=${lat}&lon=${lng}&lang=en`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Photon responded ${res.status}`);
  return res.json();
}

// Map Nominatim's loose `address` object onto our stable shape, falling back
// through the many tags OSM uses for the same real-world concept.
function normalizeNominatim(data: unknown, lat: number, lng: number): NormalizedLocation {
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

function normalizePhoton(data: unknown, lat: number, lng: number): NormalizedLocation {
  const response = (data ?? {}) as PhotonResponse;
  const p = response.features?.[0]?.properties ?? {};
  const houseNumber = pick(p.housenumber);
  const road = pick(p.street);
  const area = pick(p.district, p.locality, p.suburb, p.name);
  const city = pick(p.city, p.county, p.state);
  const pincode = pick(p.postcode);
  const fullAddress = [
    [houseNumber, road].filter(Boolean).join(" "),
    area && area !== road ? area : "",
    city && city !== area ? city : "",
    pincode,
  ]
    .filter(Boolean)
    .join(", ");

  if (!fullAddress) throw new Error("Photon returned no address");

  return {
    houseNumber,
    road,
    area,
    city,
    state: pick(p.state),
    pincode,
    fullAddress,
    displayName: fullAddress,
    lat,
    lng,
  };
}

async function resolveAddress(lat: number, lng: number): Promise<NormalizedLocation> {
  try {
    return normalizeNominatim(await fetchNominatim(lat, lng), lat, lng);
  } catch {
    return normalizePhoton(await fetchPhoton(lat, lng), lat, lng);
  }
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
    return NextResponse.json(await resolveAddress(coords.lat, coords.lng));
  } catch {
    return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 502 });
  }
}
