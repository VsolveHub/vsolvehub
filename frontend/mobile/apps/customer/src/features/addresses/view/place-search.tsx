import { describeError } from "@vsolve/query/native";
import { Input, Spinner, Text } from "@vsolve/mobile-ui";
import { MapPin } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { usePlaceSearch, type PlaceSuggestion } from "../queries";

/**
 * Search for a place and put the pin there: the phone's half of the web's location picker,
 * which offers search or "use my location". Picking a result calls `onPick` with its pin; the
 * caller fills the address fields from the reverse geocode of that pin, as the web does.
 */
export function PlaceSearch({
  onPick,
  placeholder = "Search for your area, street or building",
}: {
  onPick: (place: PlaceSuggestion) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 400);
    return () => clearTimeout(timer);
  }, [text]);

  // A picked result is shown in the box; it must not search again.
  const search = usePlaceSearch(picked !== null && picked === text ? "" : debounced);
  const results = search.data?.results ?? [];
  const showResults = picked !== text && debounced.trim().length >= 3;

  return (
    <View className="gap-2">
      <Input
        value={text}
        onChangeText={(value) => {
          setText(value);
          setPicked(null);
        }}
        placeholder={placeholder}
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search for a place"
      />
      {showResults ? (
        <View className="overflow-hidden rounded-xl border border-line bg-surface">
          {search.isFetching && results.length === 0 ? (
            <View className="flex-row items-center gap-2 p-3">
              <Spinner size="sm" />
              <Text className="text-sm text-text-secondary">Searching…</Text>
            </View>
          ) : search.isError ? (
            <Text className="p-3 text-sm text-danger-text">{describeError(search.error, "read").message}</Text>
          ) : results.length === 0 ? (
            <Text className="p-3 text-sm text-text-secondary">
              No matching place. Try a nearby landmark, or use your location.
            </Text>
          ) : (
            results.map((place, index) => (
              <Pressable
                key={`${place.latitude},${place.longitude},${index}`}
                accessibilityRole="button"
                onPress={() => {
                  setText(place.label);
                  setPicked(place.label);
                  onPick(place);
                }}
                className={`flex-row items-start gap-2 p-3 active:bg-surface-sunken ${index > 0 ? "border-t border-line" : ""}`}
              >
                <MapPin size={16} color="#EA580C" />
                <Text className="min-w-0 flex-1 text-sm text-text">{place.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
