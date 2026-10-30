/// <reference types="google.maps" />
"use client";

import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
import { LocateFixed, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "../cn";
import { useTOrDefault } from "../i18n";
import { Spinner } from "../spinner";
import {
  DEVICE_FAILURE_DEFAULT,
  DEVICE_FAILURE_KEY,
  type DeviceFailure,
  classifyDeviceError,
  devicePosition,
} from "./location-picker";

/**
 * The location box on a browse page: suggests areas and cities as you type, and has a
 * "Near me" button.
 *
 * Picking a suggestion or pressing Near me gives a point, and the page searches nearest-first
 * from it at once. Typed text that was never picked has no point, and the page searches by
 * text as before. Without a browser key there are no suggestions, but Near me still works:
 * the phone's location needs no key.
 *
 * Suggestions are areas and cities in India only (Places "(regions)"), never shops or
 * buildings: a browse search is for a neighbourhood. One billing session per search-and-pick,
 * and the pick asks Google for `location` only.
 */

export interface PlaceFilterValue {
  /** What the box shows; for a picked place, its short name ("Kukatpally"). */
  name: string;
  latitude: number | null;
  longitude: number | null;
  /** `typed`: text only. `place`: a picked suggestion. `device`: the phone's location. */
  source: "typed" | "place" | "device";
}

export const EMPTY_PLACE: PlaceFilterValue = {
  name: "",
  latitude: null,
  longitude: null,
  source: "typed",
};

export interface PlaceFilterProps {
  /** Google Maps browser key. Empty means no suggestions. */
  apiKey: string;
  value: PlaceFilterValue;
  /**
   * Every change. `applyNow` is true for a pick or Near me, which the page should search
   * straight away; typing waits for the page's own Search button.
   */
  onChange: (value: PlaceFilterValue, applyNow: boolean) => void;
  placeholder?: string;
  className?: string;
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 300;

export function PlaceFilter({ apiKey, ...props }: PlaceFilterProps) {
  if (apiKey === "") return <FilterBody {...props} />;
  return (
    <APIProvider apiKey={apiKey} region="IN" language="en">
      <FilterBody {...props} withSuggestions />
    </APIProvider>
  );
}

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

function FilterBody({
  value,
  onChange,
  placeholder,
  className,
  withSuggestions = false,
}: Omit<PlaceFilterProps, "apiKey"> & { withSuggestions?: boolean }) {
  const tf = useTOrDefault();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<DeviceFailure | null>(null);
  const [searchFailed, setSearchFailed] = useState(false);

  async function nearMe() {
    setFailure(null);
    setLocating(true);
    try {
      const position = await devicePosition();
      setOpen(false);
      onChange(
        {
          name: tf("ui.placeFilter.nearMe.name", "Near me"),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "device",
        },
        true,
      );
    } catch (error) {
      setFailure(classifyDeviceError(error));
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-2 rounded-control border border-line bg-surface-sunken pl-3.5 pr-1 focus-within:border-line-strong">
        <MapPin className="size-4 shrink-0 text-text-secondary" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
          aria-label={tf("ui.placeFilter.label", "City or area")}
          autoComplete="off"
          value={value.name}
          onChange={(event) => {
            setOpen(true);
            onChange({ ...EMPTY_PLACE, name: event.target.value }, false);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder ?? tf("ui.placeFilter.placeholder", "City or area")}
          className="w-full min-w-0 bg-transparent py-2.5 text-base text-text placeholder:text-text-secondary/70 focus:outline-none sm:text-sm"
        />
        <button
          type="button"
          onClick={() => void nearMe()}
          disabled={locating}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-xs font-bold text-action transition hover:bg-surface disabled:opacity-60"
        >
          {locating ? <Spinner /> : <LocateFixed className="size-4" aria-hidden />}
          {tf("ui.placeFilter.nearMe.button", "Near me")}
        </button>
      </div>

      {withSuggestions ? (
        <Suggestions
          query={value.source === "typed" ? value.name : ""}
          onResults={(found) => {
            setSearchFailed(false);
            setSuggestions(found);
          }}
          onFailed={() => setSearchFailed(true)}
          onPicked={(picked) => {
            setOpen(false);
            setSuggestions([]);
            onChange(picked, true);
          }}
          onPickFailed={() => setSearchFailed(true)}
          suggestions={open ? suggestions : []}
        />
      ) : null}

      {failure ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger-text">
          {tf(DEVICE_FAILURE_KEY[failure], DEVICE_FAILURE_DEFAULT[failure])}
        </p>
      ) : searchFailed ? (
        <p role="alert" className="mt-1.5 text-xs text-warning-text">
          {tf(
            "ui.placeFilter.searchFailed",
            "Suggestions are not working right now. Search by name or use Near me.",
          )}
        </p>
      ) : null}
    </div>
  );
}

/** The suggestion list. Lives inside `APIProvider`, so the Places library can load. */
function Suggestions({
  query,
  suggestions,
  onResults,
  onFailed,
  onPicked,
  onPickFailed,
}: {
  query: string;
  suggestions: Suggestion[];
  onResults: (found: Suggestion[]) => void;
  onFailed: () => void;
  onPicked: (value: PlaceFilterValue) => void;
  onPickFailed: () => void;
}) {
  const places = useMapsLibrary("places");
  const tf = useTOrDefault();
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  // Held in refs so a parent passing fresh callbacks each render does not restart the search.
  const results = useRef(onResults);
  const failed = useRef(onFailed);
  useEffect(() => {
    results.current = onResults;
    failed.current = onFailed;
  });

  useEffect(() => {
    if (places === null) return;
    const input = query.trim();
    if (input.length < SEARCH_MIN_CHARS) {
      results.current([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      token.current ??= new places.AutocompleteSessionToken();
      places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input,
        sessionToken: token.current,
        includedRegionCodes: ["in"],
        includedPrimaryTypes: ["(regions)"],
      })
        .then(({ suggestions: found }) => {
          if (cancelled) return;
          results.current(
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
          if (!cancelled) failed.current();
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [places, query]);

  async function pick(suggestion: Suggestion) {
    try {
      const place = suggestion.prediction.toPlace();
      await place.fetchFields({ fields: ["location"] });
      const location = place.location;
      if (!location) throw new Error("no location");
      onPicked({
        name: suggestion.main,
        latitude: location.lat(),
        longitude: location.lng(),
        source: "place",
      });
    } catch {
      onPickFailed();
    } finally {
      // The pick closes the billing session; the next search starts a new one.
      token.current = null;
    }
  }

  if (suggestions.length === 0) return null;
  return (
    <ul
      role="listbox"
      aria-label={tf("ui.placeFilter.results", "Suggested places")}
      className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-control border border-line bg-surface py-1 shadow-md"
    >
      {suggestions.map((suggestion) => (
        <li key={suggestion.id} role="option" aria-selected={false}>
          <button
            type="button"
            // Before the input's blur closes the list.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void pick(suggestion)}
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
          >
            <MapPin className="mt-0.5 size-4 shrink-0 text-text-secondary" aria-hidden />
            <span>
              <span className="block text-sm font-semibold text-text">{suggestion.main}</span>
              {suggestion.secondary ? (
                <span className="block text-xs text-text-secondary">{suggestion.secondary}</span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
