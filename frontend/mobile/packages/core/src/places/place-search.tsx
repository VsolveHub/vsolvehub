// Ported from frontend/mobile/apps/customer/src/features/addresses/view/place-search.tsx
import { describeError } from "@vsolve/query/native";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { usePlaceSearch, type PlaceSuggestion } from "./queries";

export interface PlaceSearchProps {
  onPick: (place: PlaceSuggestion) => void;
  placeholder?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  icon?: ReactNode;
}

/**
 * Search for a place and put the pin there: the phone's half of the web's location picker,
 * which offers search or "use my location". Picking a result calls `onPick` with its pin; the
 * caller fills the address fields from the reverse geocode of that pin, as the web does.
 */
export function PlaceSearch({
  onPick,
  placeholder = "Search for your area, street or building",
  containerStyle,
  inputStyle,
  icon,
}: PlaceSearchProps) {
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
    <View style={[styles.container, containerStyle]}>
      <TextInput
        value={text}
        onChangeText={(value) => {
          setText(value);
          setPicked(null);
        }}
        placeholder={placeholder}
        placeholderTextColor="#756c5e"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search for a place"
        style={[styles.input, inputStyle]}
      />
      {showResults ? (
        <View style={styles.resultsCard}>
          {search.isFetching && results.length === 0 ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color="#EA580C" />
              <Text style={styles.statusText}>Searching…</Text>
            </View>
          ) : search.isError ? (
            <Text style={styles.errorText}>
              {describeError(search.error, "read").message}
            </Text>
          ) : results.length === 0 ? (
            <Text style={styles.emptyText}>
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
                android_ripple={{ color: "#F3F4F6" }}
                style={[styles.resultItem, index > 0 && styles.resultItemBorder]}
              >
                {icon ?? <Text style={styles.resultIcon}>📍</Text>}
                <Text style={styles.resultLabel}>{place.label}</Text>
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  input: {
    minHeight: 44,
    width: "100%",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 16,
    color: "#111827",
  },
  resultsCard: {
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  statusText: {
    fontSize: 14,
    color: "#6B7280",
  },
  errorText: {
    padding: 12,
    fontSize: 14,
    color: "#DC2626",
  },
  emptyText: {
    padding: 12,
    fontSize: 14,
    color: "#6B7280",
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
  },
  resultItemBorder: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  resultIcon: {
    marginTop: 2,
    fontSize: 16,
  },
  resultLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: "#111827",
  },
});
