"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";

// Hyderabad centre — the app's default map focus when no pin is set yet.
const DEFAULT_LAT = 17.385;
const DEFAULT_LNG = 78.4867;

type Props = {
  lat?: number;
  lng?: number;
  /** Fired when the user drags the pin or taps the map. */
  onPick: (lat: number, lng: number) => void;
};

// A self-contained SVG pin, so we don't depend on Leaflet's default marker image
// assets (which break under bundlers unless their URLs are patched).
const PIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">` +
  `<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="#2563eb"/>` +
  `<circle cx="15" cy="15" r="6" fill="#fff"/></svg>`;

/**
 * A Leaflet (OpenStreetMap) map with a single draggable pin for choosing a
 * service address. Vanilla Leaflet (no react-leaflet) loaded client-side only,
 * so it never runs during SSR. Dragging the pin or tapping the map reports the
 * new coordinates via onPick; the parent reverse-geocodes them to fill the form.
 */
export function LocationMap({ lat, lng, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  // Keep the latest onPick without re-initialising the map when it changes.
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const startLat = lat ?? DEFAULT_LAT;
      const startLng = lng ?? DEFAULT_LNG;

      const map = L.map(containerRef.current, { attributionControl: false, zoomControl: true }).setView(
        [startLat, startLng],
        15,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      const icon = L.divIcon({
        html: PIN_SVG,
        className: "location-map-pin",
        iconSize: [30, 42],
        iconAnchor: [15, 42],
      });
      const marker = L.marker([startLat, startLng], { draggable: true, icon }).addTo(map);

      marker.on("dragend", () => {
        const p = marker.getLatLng();
        onPickRef.current(p.lat, p.lng);
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        onPickRef.current(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      // Tiles can mis-size when the map mounts inside an animating/opening modal.
      setTimeout(() => map.invalidateSize(), 0);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Init once; prop-driven position changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter the map + pin when the parent sets coordinates (e.g. after
  // "Use my current location").
  useEffect(() => {
    if (lat == null || lng == null) return;
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const current = marker.getLatLng();
    if (Math.abs(current.lat - lat) < 1e-7 && Math.abs(current.lng - lng) < 1e-7) return;
    marker.setLatLng([lat, lng]);
    map.setView([lat, lng], map.getZoom() < 15 ? 15 : map.getZoom());
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className="location-map"
      style={{ height: 200, width: "100%", borderRadius: 12, overflow: "hidden", zIndex: 0 }}
      role="application"
      aria-label="Map — drag the pin to your location"
    />
  );
}
