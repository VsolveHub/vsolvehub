import * as Location from "expo-location";
import { LocateFixed, MapPin, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  TextInput,
  View,
} from "react-native";

import { COLOR_TOKENS, Spinner, Text } from "@vsolve/mobile-ui";
import { EMPTY_PLACE, type PlaceFilterValue } from "./nearby";

export interface PlaceFilterProps {
  apiKey?: string;
  value: PlaceFilterValue;
  /**
   * Every change. `applyNow` is true for a pick or Near me, which searches straight away;
   * typing waits for the page's search button or submit.
   */
  onChange: (value: PlaceFilterValue, applyNow: boolean) => void;
  placeholder?: string;
  className?: string;
  onSubmit?: () => void;
}

interface PlaceSuggestion {
  placeId: string;
  main: string;
  secondary: string;
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 300;

export function PlaceFilter({
  apiKey = "",
  value,
  onChange,
  placeholder = "City or area",
  className,
  onSubmit,
}: PlaceFilterProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!apiKey || value.source !== "typed" || value.name.trim().length < SEARCH_MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          value.name.trim(),
        )}&components=country:in&types=(regions)&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === "OK" && Array.isArray(data.predictions)) {
          const list: PlaceSuggestion[] = data.predictions.map(
            (p: {
              place_id: string;
              structured_formatting?: { main_text?: string; secondary_text?: string };
              description?: string;
            }) => ({
              placeId: p.place_id,
              main: p.structured_formatting?.main_text || p.description || "",
              secondary: p.structured_formatting?.secondary_text || "",
            }),
          );
          setSuggestions(list);
          setOpen(list.length > 0);
        } else {
          setSuggestions([]);
          setOpen(false);
        }
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoadingSuggestions(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [value.name, value.source, apiKey]);

  const handleNearMe = async () => {
    setErrorMsg(null);
    setLocating(true);
    setOpen(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setErrorMsg("Location permission denied. Search by name or enable location in settings.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      onChange(
        {
          name: "Near me",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "device",
        },
        true,
      );
    } catch {
      setErrorMsg("Could not detect your current location. Please search by name.");
    } finally {
      setLocating(false);
    }
  };

  const handlePickSuggestion = async (item: PlaceSuggestion) => {
    setOpen(false);
    setSuggestions([]);
    if (!apiKey) {
      onChange(
        {
          name: item.main,
          latitude: null,
          longitude: null,
          source: "typed",
        },
        true,
      );
      return;
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${item.placeId}&fields=geometry,name&key=${apiKey}`;
      const res = await fetch(url);
      const data = await res.json();
      const loc = data?.result?.geometry?.location;
      if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
        onChange(
          {
            name: item.main,
            latitude: loc.lat,
            longitude: loc.lng,
            source: "place",
          },
          true,
        );
      } else {
        onChange(
          {
            name: item.main,
            latitude: null,
            longitude: null,
            source: "typed",
          },
          true,
        );
      }
    } catch {
      onChange(
        {
          name: item.main,
          latitude: null,
          longitude: null,
          source: "typed",
        },
        true,
      );
    }
  };

  const handleClear = () => {
    setOpen(false);
    setSuggestions([]);
    setErrorMsg(null);
    onChange(EMPTY_PLACE, false);
  };

  return (
    <View className={`relative ${className ?? ""}`}>
      <View className="flex-row items-center rounded-xl border border-line bg-surface-sunken px-3 py-1.5 focus:border-line-strong">
        <MapPin size={16} color={COLOR_TOKENS.textMuted} />
        <TextInput
          accessibilityLabel="City or area"
          placeholder={placeholder}
          placeholderTextColor={COLOR_TOKENS.placeholderText}
          value={value.name}
          onChangeText={(text) => {
            setErrorMsg(null);
            onChange({ ...EMPTY_PLACE, name: text }, false);
          }}
          onSubmitEditing={() => {
            setOpen(false);
            onSubmit?.();
          }}
          returnKeyType="search"
          className="ml-2 flex-1 text-xs text-navy-900 h-9"
        />

        {value.name ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear location"
            onPress={handleClear}
            hitSlop={8}
            className="p-1 mr-1"
          >
            <X size={14} color={COLOR_TOKENS.textMuted} />
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Near me"
          onPress={handleNearMe}
          disabled={locating}
          className="flex-row items-center gap-1 rounded-lg px-2 py-1 bg-surface border border-line active:bg-surface-hover"
        >
          {locating ? (
            <ActivityIndicator size="small" color={COLOR_TOKENS.action} />
          ) : (
            <LocateFixed size={13} color={COLOR_TOKENS.action} />
          )}
          <Text className="text-[11px] font-bold text-action">Near me</Text>
        </Pressable>
      </View>

      {/* Autocomplete Suggestions Dropdown */}
      {open && suggestions.length > 0 ? (
        <View className="absolute top-12 left-0 right-0 z-50 rounded-xl border border-line bg-surface shadow-md overflow-hidden">
          {suggestions.map((item) => (
            <Pressable
              key={item.placeId}
              onPress={() => void handlePickSuggestion(item)}
              className="flex-row items-center gap-2.5 border-b border-line/50 p-3 active:bg-surface-muted"
            >
              <MapPin size={14} color={COLOR_TOKENS.textMuted} />
              <View className="flex-1">
                <Text className="text-xs font-bold text-navy-900">{item.main}</Text>
                {item.secondary ? (
                  <Text className="text-[11px] text-text-muted" numberOfLines={1}>
                    {item.secondary}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {errorMsg ? (
        <Text className="mt-1 text-[11px] font-medium text-rose-600">{errorMsg}</Text>
      ) : null}
    </View>
  );
}

