import { NextRequest, NextResponse } from "next/server";

/**
 * Reverse-geocoding proxy (OpenStreetMap Nominatim). Server-side so we can send
 * a compliant User-Agent and keep the provider swappable behind a stable shape.
 */

export const runtime = "nodejs";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const CONTACT = process.env.GEOCODE_CONTACT_EMAIL || "support@vsolvehub.com";
const USER_AGENT = `VSolveHub/1.0 (${CONTACT})`;

type NormalizedLocation = {
  area: string;
  city: string;
  state: string;
  pincode: string;
  fullAddress: string;
  lat: number;
  lng: number;
};

function pick(...values: Array<string | undefined>): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export async function GET(req: NextRequest) {
  const latParam = req.nextUrl.searchParams.get("lat");
  const lngParam = req.nextUrl.searchParams.get("lng");
  const lat = Number(latParam);
  const lng = Number(lngParam);

  if (!latParam || !lngParam || Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Valid lat and lng are required" }, { status: 400 });
  }

  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "en", Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Geocoding service unavailable" }, { status: 502 });
    }

    const data = await res.json();
    const a = data?.address ?? {};

    const road = pick(a.road, a.pedestrian, a.footway);
    const area = pick(a.suburb, a.neighbourhood, a.quarter, a.village, a.town, a.city_district, a.hamlet, a.residential, road);
    const city = pick(a.city, a.town, a.municipality, a.county, a.state_district, a.state);
    const state = pick(a.state);
    const pincode = pick(a.postcode);

    const compact = [
      area,
      city && city !== area ? city : "",
      pincode,
    ]
      .filter(Boolean)
      .join(", ");

    const result: NormalizedLocation = {
      area,
      city,
      state,
      pincode,
      fullAddress: compact || pick(data?.display_name),
      lat,
      lng,
    };

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Geocoding request failed" }, { status: 502 });
  }
}
