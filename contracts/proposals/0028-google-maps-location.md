# 0028 — Google Maps location: geocoder swap, pinned rental and stay locations

Status: **Published** — B1–B3 at contract 1.73.0, B4 (option 2, `directions_url`) at 1.74.0. See
`contracts/openapi/CHANGELOG.md`.

Implemented by Claude end to end, backend included, on the owner's direction (see `AGENTS.md`,
"Google Maps location — owner directive"). Decisions taken while building, beyond what is written
below:

- **Stay pins are host-only.** Guests get `area_latitude` / `area_longitude`, the pin rounded to
  two decimals (about 1 km), and the customer page shows it as an area map with no marker. The
  public listing already names only the area and city; an exact pin would undo that.
- **The pin field names are `pin_incomplete`** for a half-sent pair (not
  `pickup_location_incomplete`), shared by rentals and stays through `apps/locations/pins.py`.
- **Editing address text keeps the pin**, on rentals and stays alike, as on a Customer address.
- **The geocoding throttle stays at 30/min per client.** The picker only asks when the map settles
  on a new six-decimal point, which a person dragging cannot exceed in practice.

## Why

Location input is text-only outside customer addresses. Customer addresses already carry a pin, but
only from browser GPS reverse-geocoded by the Nominatim adapter, so:

- **Add a new address** cannot be saved without GPS — there is no way to turn typed text into a pin.
- A wrong GPS pin cannot be corrected.
- Rental pickup and stay properties have no coordinates at all; the rental Maps link is a text
  *search* (`apps/rental/pickup_address.py`).

The frontend will add one shared `LocationPicker` (Google Places Autocomplete search, "Use current
location", a map with a fixed centre pin, then "Confirm location"). The browser handles map and
search with its own restricted key. Django keeps reverse geocoding.

## Google services

| Service | Called from | Purpose |
| --- | --- | --- |
| Maps JavaScript API | Browser | Picker map |
| Places API (New) — Autocomplete + Place Details | Browser | Search box; Details fields limited to `location,addressComponents,formattedAddress` |
| Geocoding API | Django only | Pin → address (`POST /api/v1/geocoding/reverse/`) |

Directions links (Maps URLs) and read-only maps (Maps Embed API) need no billed call.

## B1 — Replace Nominatim with Google; remove Nominatim entirely

Owner decision: Google in every environment, including local. No OpenStreetMap code path remains and
there is **no runtime fallback** between providers.

- Add `GoogleReverseGeocoder` implementing the existing `ReverseGeocoder` protocol in
  `apps/locations/geocoding.py`, calling
  `https://maps.googleapis.com/maps/api/geocode/json?latlng=…&key=…&language=en&region=in`.
  Same timeout, same cache, same `GeocodedAddress` output, `provider="google"`.
- Map `address_components`: `street_number` + `route` → `line1`; `sublocality_level_1` /
  `sublocality` / `neighborhood` → `locality`; `locality` (else `administrative_area_level_2`) →
  `city`; `administrative_area_level_1` → `state`; `postal_code`; `country` short name →
  `country_code`. `formatted_address` from the first result.
- `ZERO_RESULTS` → `GeocodingError` (existing 503 `GeocodingUnavailableApiError`).
  `OVER_QUERY_LIMIT` / `REQUEST_DENIED` / `INVALID_REQUEST` / transport errors → `GeocodingError`;
  log the status string only, never the key or the full URL.
- **Remove:** `NominatimReverseGeocoder`, `GEOCODING_NOMINATIM_URL`, `GEOCODING_USER_AGENT` (and
  its production guard), the Nominatim lines in `backend/.env.example`, `local.py`'s
  `default="nominatim"`, and the Nominatim cases in `tests/locations/test_geocoding.py` and
  `tests/test_server_clock_calibration.py`.
- **Add:** `GOOGLE_MAPS_SERVER_KEY` (env only, never committed). `GEOCODING_PROVIDER` accepts
  `google` or `unconfigured`; production keeps refusing `unconfigured` and also refuses an empty key.
  Tests keep `unconfigured` plus a fake — no suite calls Google.
- Cache: the current 7-day TTL is within Google's 30-day limit on cached coordinates. Keep it.
- Cost exposure: the endpoint is unauthenticated (`AllowAny`) with `geocoding: 30/min`. Each miss is
  now a billed call. Please confirm that rate is per-IP and acceptable, or require a session.

Response shape is unchanged, so B1 needs no frontend change beyond `provider` reading `google`.

## B2 — Pinned rental pickup location

Add nullable `pickup_latitude` / `pickup_longitude` (`DecimalField(9, 6)`, range checks like
`Address`) to `RentalAsset`. Write them on the existing owner create/update payloads; read them on
the owner and customer rental detail responses.

- Both or neither: one without the other → 400 `pickup_location_incomplete`.
- With a pin, the server-built Maps link becomes
  `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`; without one, today's text
  search stays.
- Existing assets stay valid with no pin; the editor asks the owner to pin on next edit.

```json
{ "pickup_address_line": "Plot 12, Road 3", "pickup_area": "Kukatpally",
  "pickup_city": "Hyderabad", "pickup_pincode": "500072",
  "pickup_latitude": "17.494812", "pickup_longitude": "78.399574" }
```

## B3 — Pinned stay property location

Same pair (`latitude` / `longitude`, nullable, both-or-neither) on `stay.Property`, written on the
partner create/update payload and returned on the customer stay detail so the page can show an
embedded map and a directions link. `location_text` stays as the display label.

## B4 — Partner visit directions (open question, not a request)

`PartnerSiteAddressSerializer` deliberately omits coordinates. The partner's directions link is
built from the address text, so it can land on the wrong building. Options for the owner/Codex:

1. Keep text only (no change).
2. Return a server-built `directions_url` that embeds the coordinates — same disclosure gate as the
   address, no raw lat/lng field.

The frontend works with either.

## Out of scope

Routes / Distance Matrix (matching keeps haversine bands), live tracking, service-area polygons
(serviceability stays pincode-based), and job-listing / partner-default location (area text is
enough; may get Autocomplete later with no backend change).
