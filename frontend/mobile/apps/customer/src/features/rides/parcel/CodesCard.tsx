import { Button, Text } from "@vsolve/mobile-ui";
import { Share, View } from "react-native";

import { shareableCodes, type ParcelRideLike } from "./model";

/**
 * The codes the booker gives to other people (D10): the pickup code, and the delivery PIN when PIN
 * confirmation is on. Each says who it is for and has a Share button with a ready-made message.
 * Shown only here, in the booker's app: the server never sends them to the captain. A code that
 * does not exist right now (no PIN when it is off) is simply not listed.
 */
export function CodesCard({ ride, money }: { ride: ParcelRideLike; money: string }) {
  const codes = shareableCodes(ride, money);
  if (codes.length === 0) return null;
  return (
    <View className="gap-3 rounded-2xl border border-line bg-surface-sunken p-4">
      {codes.map((item) => (
        <View key={item.key} className="flex-row items-center gap-3">
          <View className="flex-1 gap-0.5">
            <Text className="text-xs font-semibold uppercase text-text-muted">{item.title}</Text>
            <Text className="text-xs text-text-muted">{item.forWhom}</Text>
            <Text
              accessibilityLabel={`${item.title} ${item.code.split("").join(" ")}`}
              className="text-3xl font-extrabold tracking-[0.25em] text-text"
            >
              {item.code}
            </Text>
          </View>
          <Button
            variant="outline"
            size="sm"
            accessibilityLabel={`Share ${item.title}`}
            onPress={() => void Share.share({ message: item.shareText })}
          >
            Share
          </Button>
        </View>
      ))}
    </View>
  );
}
