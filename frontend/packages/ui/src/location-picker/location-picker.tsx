/// <reference types="google.maps" />
"use client";

import {
  APILoadingStatus,
  APIProvider,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { LocateFixed, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../button";
import { useTOrDefault } from "../i18n";
import { Input } from "../input";
import { Spinner } from "../spinner";

/**
 * Put the pin on the door: search, use the device, or drag the map.
 *
 * The pattern every delivery app converged on — a map with the pin fixed in the
 * centre, so the user moves the *map* under it. Dragging a marker on a phone
 * puts a thumb over the very thing being aimed; moving the map does not.
 *
 * Shared by the Customer address book and the Partner listing forms, and kept
 * behind its own `@vsolve/ui/location-picker` entry so an app that never shows
 * a map never bundles the Maps loader.
 *
 * ## One path to address text
 *
 * However the pin arrives — a search result, the device, a drag — the address
 * text comes from the caller's `reverseGeocode` (Django's reverse geocoder) for
 * the coordinate the pin settled on. A search result's own address is not used,
 * so a picked place and a dragged pin can never produce two differently shaped
 * answers. The browser asks Places for a `location` and nothing else.
 *
 * ## No pin until the user places one
 *
 * The map opens on a city view so there is something to drag, but that view is
 * not an answer: Confirm stays disabled until the user has searched, located,
 * dragged, or arrived with a pin already. Geocoding the default view would
 * invent an address in the middle of Hyderabad.
 *
 * ## Without a browser key
 *
 * The map and search need `apiKey`. With an empty key, or when the script fails
 * to load, the picker says so and still offers the device's location — the same
 * server lookup, minus the map.
 *
 * ## Privacy
 *
 * Coordinates live in this component's state and are handed to `onConfirm`.
 * Nothing is stored, logged or put in a URL.
 */

/** The address fields a reverse geocode answers with. Mirrors the API's shape. */
export interface PickedLocation {
  formatted_address: string;
  line1: string;
  locality: string;
  city: string;
  state: string;
  postal_code: string;
  country_code: string;
  latitude: string;
  longitude: string;
  provider: string;
}

export interface LocationPickerProps {
  /** Google Maps browser key (Maps JavaScript + Places). Empty means no map. */
  apiKey: string;
  /** Coordinate → address text, from the server. Six-decimal strings in. */
  reverseGeocode: (point: { latitude: string; longitude: string }) => Promise<PickedLocation>;
  /** An existing pin to start from, e.g. when re-pinning a saved address. */
  initial?: { latitude: string; longitude: string } | null;
  /** Ask the device for its position as soon as the picker opens. */
  autoLocate?: boolean;
  /**
   * The confirmed pin with the server's address text. When the lookup failed
   * the text fields are empty and the user types them on the next step.
   */
  onConfirm: (location: PickedLocation) => void;
  confirmLabel?: string;
}

/** The opening view when there is no pin. A camera position, never an answer. */
const CITY_VIEW = { lat: 17.385, lng: 78.4867 };
const CITY_ZOOM = 11;
const PIN_ZOOM = 17;
const SEARCH_MIN_CHARS = 3;
const SEARCH_DEBOUNCE_MS = 300;

interface LatLng {
  lat: number;
  lng: number;
}

/** Six decimals: the contract's precision, and the de-duplication key. */
function keyOf(point: LatLng): string {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
}

/** A pin whose text the server could not name. The user types the rest. */
function coordsOnly(point: LatLng): PickedLocation {
  return {
    formatted_address: "",
    line1: "",
    locality: "",
    city: "",
    state: "",
    postal_code: "",
    country_code: "IN",
    latitude: point.lat.toFixed(6),
    longitude: point.lng.toFixed(6),
    provider: "device",
  };
}

/**
 * Why the device gave no position, told apart because the remedies differ:
 * retrying a refused permission does nothing until a browser setting changes,
 * while a timeout is worth another press.
 */
export type DeviceFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export const DEVICE_FAILURE_KEY: Record<DeviceFailure, string> = {
  denied: "ui.locationPicker.error.denied",
  unavailable: "ui.locationPicker.error.unavailable",
  timeout: "ui.locationPicker.error.timeout",
  unsupported: "ui.locationPicker.error.unsupported",
};

export const DEVICE_FAILURE_DEFAULT: Record<DeviceFailure, string> = {
  denied:
    "Location permission is off for this site. Turn it on in your browser settings, or search for the place instead.",
  unavailable:
    "Your device could not get a location fix. Move near a window or try again in a moment.",
  timeout: "Finding your location took too long. Try again.",
  unsupported: "This browser cannot share a location. Search for the place instead.",
};

export function devicePosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 12_000,
    });
  });
}

export function classifyDeviceError(error: unknown): DeviceFailure {
  if (error instanceof Error && error.message === "unsupported") return "unsupported";
  // `GeolocationPositionError` is not a constructor that can be relied on across
  // browsers, so the numeric codes are read structurally.
  if (typeof error === "object" && error !== null && "code" in error) {
    switch ((error as GeolocationPositionError).code) {
      case 1:
        return "denied";
      case 2:
        return "unavailable";
      case 3:
        return "timeout";
    }
  }
  return "unavailable";
}

export function LocationPicker({ apiKey, ...props }: LocationPickerProps) {
  if (apiKey === "") return <PickerBody {...props} hasMap={false} />;
  return (
    <APIProvider apiKey={apiKey} region="IN" language="en">
      <PickerBody {...props} hasMap />
    </APIProvider>
  );
}

type Lookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: PickedLocation }
  | { status: "failed" };

function PickerBody({
  reverseGeocode,
  initial = null,
  autoLocate = false,
  onConfirm,
  confirmLabel,
  hasMap,
}: Omit<LocationPickerProps, "apiKey"> & { hasMap: boolean }) {
  const tf = useTOrDefault();
  const resolvedConfirmLabel = confirmLabel ?? tf("ui.locationPicker.confirmLabel", "Confirm location");
  // Held in a ref so a caller passing a fresh function each render does not
  // re-create every callback below.
  const geocode = useRef(reverseGeocode);
  useEffect(() => {
    geocode.current = reverseGeocode;
  }, [reverseGeocode]);

  // Captured once: the picker answers "where did it open", and a parent
  // re-render must not move a pin the user has since dragged.
  const [initialPoint] = useState<LatLng | null>(() =>
    initial !== null && initial.latitude !== "" && initial.longitude !== ""
      ? { lat: Number(initial.latitude), lng: Number(initial.longitude) }
      : null,
  );

  const [pin, setPin] = useState<LatLng | null>(initialPoint);
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [isLocating, setIsLocating] = useState(false);
  const [deviceFailure, setDeviceFailure] = useState<DeviceFailure | null>(null);
  /** Where the map should move to. `seq` makes a repeat of the same place a new request. */
  const [target, setTarget] = useState<(LatLng & { seq: number }) | null>(null);

  /**
   * Whether a map settle counts as the user's answer. False until they search,
   * locate, drag, or arrive with a pin — see the module note.
   */
  const armed = useRef(initialPoint !== null);
  const lastKey = useRef<string | null>(null);
  /** Only the latest lookup may write; a slow early answer must not win. */
  const lookupSeq = useRef(0);

  /** Places the pin and names it. Returns whether the server answered. */
  const resolve = useCallback(async (point: LatLng): Promise<boolean> => {
    const key = keyOf(point);
    if (key === lastKey.current) return true;
    lastKey.current = key;
    setPin(point);
    const seq = ++lookupSeq.current;
    setLookup({ status: "loading" });
    try {
      const result = await geocode.current({
        latitude: point.lat.toFixed(6),
        longitude: point.lng.toFixed(6),
      });
      if (seq === lookupSeq.current) setLookup({ status: "done", result });
      return true;
    } catch {
      // Not surfaced or logged: the error's request context carries the coordinate.
      if (seq === lookupSeq.current) setLookup({ status: "failed" });
      return false;
    }
  }, []);

  const moveTo = useCallback(
    (point: LatLng) => {
      armed.current = true;
      setTarget((current) => ({ ...point, seq: (current?.seq ?? 0) + 1 }));
      void resolve(point);
    },
    [resolve],
  );

  const locate = useCallback(async () => {
    setDeviceFailure(null);
    setIsLocating(true);
    let position: GeolocationPosition;
    try {
      position = await devicePosition();
    } catch (error) {
      setDeviceFailure(classifyDeviceError(error));
      return;
    } finally {
      setIsLocating(false);
    }
    moveTo({ lat: position.coords.latitude, lng: position.coords.longitude });
  }, [moveTo]);

  // Mount-only on purpose: the starting pin and the auto-locate are both
  // answers to "how did the picker open", not to anything that changes later.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialPoint !== null) void resolve(initialPoint);
    else if (autoLocate) void locate();
  }, [autoLocate, initialPoint, locate, resolve]);

  function onSettle(point: LatLng) {
    if (!armed.current) return;
    void resolve(point);
  }

  function confirm() {
    if (pin === null) return;
    onConfirm(lookup.status === "done" ? lookup.result : coordsOnly(pin));
  }

  const canConfirm = pin !== null && lookup.status !== "loading" && !isLocating;

  return (
    <div className="flex flex-col gap-3">
      {hasMap ? <PlaceSearch onPick={moveTo} /> : null}

      {hasMap ? (
        <MapCanvas
          start={initialPoint}
          target={target}
          onDragStart={() => {
            armed.current = true;
          }}
          onSettle={onSettle}
        />
      ) : (
        <p className="rounded-control border border-line bg-surface-sunken px-3 py-2.5 text-sm text-text-secondary">
          {tf("ui.locationPicker.noMap", "The map is not available right now. Use your current location instead.")}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        block
        onClick={() => void locate()}
        loading={isLocating}
        loadingLabel={tf("ui.locationPicker.locating", "Finding your location")}
      >
        <LocateFixed className="size-4" aria-hidden />
        {tf("ui.locationPicker.useCurrentLocation", "Use my current location")}
      </Button>
      {deviceFailure ? (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {tf(DEVICE_FAILURE_KEY[deviceFailure], DEVICE_FAILURE_DEFAULT[deviceFailure])}
        </p>
      ) : null}

      <PinPreview pin={pin} lookup={lookup} hasMap={hasMap} />

      <Button type="button" block onClick={confirm} disabled={!canConfirm}>
        {resolvedConfirmLabel}
      </Button>
    </div>
  );
}

function PinPreview({
  pin,
  lookup,
  hasMap,
}: {
  pin: LatLng | null;
  lookup: Lookup;
  hasMap: boolean;
}) {
  const tf = useTOrDefault();
  return (
    <div aria-live="polite" className="min-h-[2.75rem] text-sm">
      {pin === null ? (
        <p className="text-text-secondary">
          {hasMap
            ? tf(
                "ui.locationPicker.instructions.withMap",
                "Search for the area or drag the map to put the pin on the door.",
              )
            : tf(
                "ui.locationPicker.instructions.noMap",
                "Tap Use my current location to place the pin.",
              )}
        </p>
      ) : lookup.status === "loading" ? (
        <p className="flex items-center gap-2 text-text-secondary">
          <Spinner />
          {tf("ui.locationPicker.findingAddress", "Finding the address…")}
        </p>
      ) : lookup.status === "done" ? (
        <p className="font-semibold text-text">{lookup.result.formatted_address}</p>
      ) : lookup.status === "failed" ? (
        <p className="text-warning-text">
          {tf(
            "ui.locationPicker.lookupFailed",
            "We could not name this spot. You can still use the pin and type the address next.",
          )}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The map with a fixed centre pin.
 *
 * Reports every settle; the body decides whether it counts. Moves only when the
 * body asks, through `target`.
 */
function MapCanvas({
  start,
  target,
  onDragStart,
  onSettle,
}: {
  start: LatLng | null;
  target: (LatLng & { seq: number }) | null;
  onDragStart: () => void;
  onSettle: (point: LatLng) => void;
}) {
  const map = useMap();
  const status = useApiLoadingStatus();
  const tf = useTOrDefault();

  useEffect(() => {
    if (map === null || target === null) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    if ((map.getZoom() ?? 0) < PIN_ZOOM) map.setZoom(PIN_ZOOM);
  }, [map, target]);

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <p className="rounded-control border border-line bg-surface-sunken px-3 py-2.5 text-sm text-text-secondary">
        {tf("ui.locationPicker.mapLoadFailed", "The map could not load. Use your current location instead.")}
      </p>
    );
  }

  return (
    <div className="relative h-64 overflow-hidden rounded-card border border-line bg-surface-sunken sm:h-72">
      <GoogleMap
        defaultCenter={start ?? CITY_VIEW}
        defaultZoom={start ? PIN_ZOOM : CITY_ZOOM}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        onDragstart={onDragStart}
        onIdle={(event) => {
          const center = event.map.getCenter();
          if (center) onSettle({ lat: center.lat(), lng: center.lng() });
        }}
        style={{ width: "100%", height: "100%" }}
      />
      {/* The tip of the pin sits on the map's centre, which is the coordinate sent. */}
      <svg
        aria-hidden
        viewBox="0 0 24 32"
        className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-8 -translate-x-1/2 -translate-y-full drop-shadow-md"
      >
        <path
          d="M12 31s10-9.2 10-18A10 10 0 0 0 2 13c0 8.8 10 18 10 18Z"
          fill="#EA580C"
          stroke="white"
          strokeWidth={1.5}
        />
        <circle cx="12" cy="13" r="3.6" fill="white" />
      </svg>
    </div>
  );
}

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * Places Autocomplete with our own list, restricted to India.
 *
 * One session token per search-and-pick, so Google bills the keystrokes and the
 * pick as one session. The pick asks for `location` only.
 */
function PlaceSearch({ onPick }: { onPick: (point: LatLng) => void }) {
  const places = useMapsLibrary("places");
  const map = useMap();
  const tf = useTOrDefault();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  /** Set when the input text is a picked result, so it does not search again. */
  const picked = useRef(false);
  const searchFailed = () => tf("ui.locationPicker.search.failed", SEARCH_FAILED_DEFAULT);

  useEffect(() => {
    if (places === null) return;
    const input = query.trim();
    if (picked.current || input.length < SEARCH_MIN_CHARS) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      token.current ??= new places.AutocompleteSessionToken();
      const center = map?.getCenter();
      places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: token.current,
        includedRegionCodes: ["in"],
        ...(center ? { locationBias: center } : {}),
      })
        .then(({ suggestions: found }) => {
          if (cancelled) return;
          setError(null);
          setSuggestions(
            found.flatMap((item) => {
              const prediction = item.placePrediction;
              if (prediction === null) return [];
              return [
                {
                  id: prediction.placeId,
                  main: prediction.mainText?.text ?? prediction.text.text,
                  secondary: prediction.secondaryText?.text ?? "",
                  prediction,
                },
              ];
            }),
          );
        })
        .catch(() => {
          if (!cancelled) setError(searchFailed());
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, places, query]);

  async function pick(suggestion: Suggestion) {
    picked.current = true;
    setQuery(suggestion.main);
    setSuggestions([]);
    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ["location"] });
      const location = place.location;
      if (!location) throw new Error("no location");
      setError(null);
      onPick({ lat: location.lat(), lng: location.lng() });
    } catch {
      setError(searchFailed());
    } finally {
      // The pick closes the billing session; the next search starts a new one.
      token.current = null;
    }
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="location-search">
        {tf("ui.locationPicker.search.label", "Search for the area, street or building")}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          id="location-search"
          type="search"
          autoComplete="off"
          placeholder={tf("ui.locationPicker.search.placeholder", "Search area, street, society…")}
          className="pl-9"
          value={query}
          onChange={(event) => {
            picked.current = false;
            setQuery(event.target.value);
          }}
          // The picker often sits inside a caller's <form>; Enter here is a
          // search, never a submit of the listing around it.
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </div>
      {suggestions.length > 0 ? (
        <ul
          aria-label={tf("ui.locationPicker.search.results", "Search results")}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-control border border-line bg-surface py-1 shadow-md"
        >
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                type="button"
                className="block w-full px-3 py-2.5 text-left hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
                onClick={() => void pick(suggestion)}
              >
                <span className="block text-sm font-semibold text-text">{suggestion.main}</span>
                {suggestion.secondary ? (
                  <span className="block text-xs text-text-secondary">{suggestion.secondary}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-warning-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const SEARCH_FAILED_DEFAULT = "Search is not working right now. Drag the map or use your location.";
