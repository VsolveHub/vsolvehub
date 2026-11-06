// Ported from frontend/apps/customer/features/stays/view/stay-image-gallery.tsx (its empty state)
import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Building, ImageOff } from "lucide-react-native";
import { View } from "react-native";

/**
 * What a stay with no photos shows, word for word the web gallery's empty state, in place of
 * a stock photo of some other room.
 */
export function NoStayPhotos({ title }: { title: string }) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${title} — no photos yet`}
      className="h-full w-full items-center justify-center gap-2 px-6"
    >
      <View className="size-12 items-center justify-center rounded-full border border-line bg-surface">
        <ImageOff size={20} color={COLOR_TOKENS.textMuted} />
      </View>
      <Text className="text-sm font-semibold text-text-secondary">Photos coming soon</Text>
      <View className="flex-row items-center gap-1.5">
        <Building size={14} color={COLOR_TOKENS.textMuted} />
        <Text className="text-xs text-text-muted">Verified stay listing</Text>
      </View>
    </View>
  );
}
