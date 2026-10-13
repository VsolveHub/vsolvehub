import { Badge, Button, Card, COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Image, View } from "react-native";
import { Edit3, MapPin, Pause, Play, Send, Trash2 } from "lucide-react-native";

import {
  canSubmitAsset,
  formatPaise,
  getRentalStatusBadge,
  type PartnerRentalAsset,
} from "../model";

export function RentalAdCard({
  asset,
  onEdit,
  onToggleStatus,
  onSubmitForReview,
  onDelete,
  isSubmitting,
}: {
  asset: PartnerRentalAsset;
  onEdit: (asset: PartnerRentalAsset) => void;
  onToggleStatus: (asset: PartnerRentalAsset) => void;
  onSubmitForReview?: (asset: PartnerRentalAsset) => void;
  onDelete?: (asset: PartnerRentalAsset) => void;
  isSubmitting?: boolean;
}) {
  const badge = getRentalStatusBadge(asset.status, asset.moderation_status);
  const isPaused = asset.status === "PAUSED";
  const photo = asset.media?.[0]?.url || asset.image_urls?.[0];
  const canSubmit = canSubmitAsset(asset.moderation_status);

  return (
    <Card className="overflow-hidden border border-line bg-surface p-4 shadow-sm">
      <View className="flex-row gap-3.5">
        {photo ? (
          <Image
            source={{ uri: photo }}
            className="h-24 w-24 rounded-lg bg-surface-muted"
            resizeMode="cover"
          />
        ) : (
          <View className="h-24 w-24 items-center justify-center rounded-lg bg-surface-muted">
            <Text className="text-2xl">📦</Text>
          </View>
        )}

        <View className="flex-1 justify-between">
          <View>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-base font-bold text-text" numberOfLines={1}>
                {asset.title}
              </Text>
              <Badge tone={badge.tone}>{badge.label}</Badge>
            </View>

            {asset.location_text ? (
              <View className="mt-1 flex-row items-center gap-1">
                <MapPin size={12} color={COLOR_TOKENS.textMuted} />
                <Text className="text-xs text-text-muted" numberOfLines={1}>
                  {asset.location_text}
                </Text>
              </View>
            ) : null}
          </View>

          <View className="mt-2 flex-row flex-wrap items-baseline gap-2">
            <Text className="text-base font-extrabold text-brand tabular-nums">
              {formatPaise(asset.daily_rate_paise)}
              <Text className="text-xs font-normal text-text-muted"> / day</Text>
            </Text>
            <Text className="text-xs text-text-muted tabular-nums">
              · Deposit {formatPaise(asset.deposit_paise)}
            </Text>
          </View>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between border-t border-line/60 pt-3">
        <Text className="text-xs font-medium text-text-muted">
          Available: <Text className="font-bold text-text tabular-nums">{asset.quantity_available} units</Text>
        </Text>

        <View className="flex-row items-center gap-2">
          {canSubmit && onSubmitForReview ? (
            <Button
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              onPress={() => onSubmitForReview(asset)}
              className="h-8 flex-row items-center gap-1 px-2.5"
            >
              <Send size={12} color={COLOR_TOKENS.textInverse} />
              <Text className="text-xs font-bold text-white">
                {isSubmitting ? "Submitting…" : "Submit Review"}
              </Text>
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            onPress={() => onEdit(asset)}
            className="h-8 flex-row items-center gap-1 px-2.5"
          >
            <Edit3 size={13} color={COLOR_TOKENS.text} />
            <Text className="text-xs font-semibold text-text">Edit</Text>
          </Button>

          <Button
            variant={isPaused ? "primary" : "secondary"}
            size="sm"
            onPress={() => onToggleStatus(asset)}
            className="h-8 flex-row items-center gap-1 px-2.5"
          >
            {isPaused ? (
              <>
                <Play size={13} color={COLOR_TOKENS.textInverse} />
                <Text className="text-xs font-semibold text-white">Resume</Text>
              </>
            ) : (
              <>
                <Pause size={13} color={COLOR_TOKENS.text} />
                <Text className="text-xs font-semibold text-text">Pause</Text>
              </>
            )}
          </Button>

          {onDelete ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => onDelete(asset)}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center p-0"
              accessibilityLabel="Delete equipment listing"
            >
              <Trash2 size={13} color={COLOR_TOKENS.danger} />
            </Button>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
