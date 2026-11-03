import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { BedDouble } from "lucide-react-native";
import { Pressable, View } from "react-native";

import type { RoomLook } from "../looks";
import { availabilityLabel } from "../model";
import { THEME_COLORS } from "../theme-colors";

/**
 * "Other looks of this room": the same room type, same price and features, in another look.
 *
 * Shown under the gallery when the guest's room type has more than one look. Tapping a look
 * swaps the photos and the availability in place, so it reads as one room with a choice of
 * look, not a different listing. Room numbers are never shown.
 */
export function LookSwitcher({
  looks,
  selectedId,
  roomStyle,
  onSelect,
}: {
  looks: RoomLook[];
  selectedId: string;
  roomStyle?: string | null;
  onSelect: (lookId: string) => void;
}) {
  if (looks.length < 2) return null;

  return (
    <View
      accessibilityRole="region"
      accessibilityLabel="Other looks of this room"
      className="rounded-2xl border border-navy-200 bg-navy-50/70 p-3.5 gap-2.5"
    >
      <View>
        <Text className="text-sm font-bold text-navy-950">
          Other looks of this room
        </Text>
        <Text className="mt-0.5 text-xs text-navy-700">
          Same room, same price — different look. {looks.length} looks available.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2 pt-1">
        {looks.map((look) => {
          const on = look.id === selectedId;
          const cover = look.media[0]?.url;

          return (
            <Pressable
              key={look.id}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(look.id)}
              className={`w-[48%] overflow-hidden rounded-xl border bg-surface transition ${
                on
                  ? "border-navy-900 ring-2 ring-navy-900"
                  : "border-line"
              }`}
            >
              <View className="relative aspect-[16/10] w-full bg-surface-muted items-center justify-center">
                {cover ? (
                  <Image
                    source={{ uri: cover }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                ) : (
                  <BedDouble size={24} color={THEME_COLORS.muted} />
                )}
              </View>

              <View className="p-2 gap-0.5">
                <Text
                  className="text-xs font-bold text-text"
                  numberOfLines={1}
                >
                  {look.name || look.display_name}
                </Text>
                <Text className="text-[11px] font-semibold text-emerald-700">
                  {availabilityLabel(look.available_count, roomStyle)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
