import { Badge, Card, COLOR_TOKENS, Text, cn } from "@vsolve/mobile-ui";
import { Image, Pressable, View } from "react-native";
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
  const canSubmit = canSubmitAsset(asset.moderation_status, asset.status);

  return (
    <Card className="overflow-hidden border border-line bg-surface p-4 shadow-xs rounded-2xl">
      <View className="flex-row gap-3.5">
        {photo ? (
          <Image
            source={{ uri: photo }}
            className="h-24 w-24 rounded-xl bg-surface-muted"
            resizeMode="cover"
          />
        ) : (
          <View className="h-24 w-24 items-center justify-center rounded-xl bg-surface-muted">
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

      {/* Meta & Actions Section */}
      <View className="mt-3.5 border-t border-line/60 pt-3 flex-col gap-2.5">
        {/* Availability info & Submit Review action */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-emerald-500" />
            <Text className="text-xs text-text-secondary">
              Available:{" "}
              <Text className="font-bold text-navy-900 tabular-nums">
                {asset.quantity_available ?? 1} {asset.quantity_available === 1 ? "unit" : "units"}
              </Text>
            </Text>
          </View>

          {canSubmit && onSubmitForReview ? (
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={() => onSubmitForReview(asset)}
              className="flex-row items-center gap-1.5 rounded-lg bg-[#f87000] px-3 py-1.5 active:opacity-85 shadow-xs"
            >
              <Send size={11} color="#ffffff" />
              <Text className="text-xs font-bold text-white">
                {isSubmitting ? "Submitting…" : "Submit Review"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Action Buttons Row */}
        <View className="flex-row items-center gap-2">
          {/* Edit Button */}
          <Pressable
            accessibilityRole="button"
            onPress={() => onEdit(asset)}
            className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-line bg-surface py-2 px-2.5 active:bg-surface-sunken"
          >
            <Edit3 size={13} color="#00112e" />
            <Text className="text-xs font-semibold text-navy-900">Edit</Text>
          </Pressable>

          {/* Pause / Resume Button */}
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => onToggleStatus(asset)}
            className={cn(
              "flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border py-2 px-2.5 active:opacity-85",
              isPaused
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-300 bg-slate-50"
            )}
          >
            {isPaused ? (
              <>
                <Play size={13} color="#059669" />
                <Text className="text-xs font-bold text-emerald-800">Resume</Text>
              </>
            ) : (
              <>
                <Pause size={13} color="#334155" />
                <Text className="text-xs font-semibold text-slate-800">Pause</Text>
              </>
            )}
          </Pressable>

          {/* Delete Button */}
          {onDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete equipment listing"
              disabled={isSubmitting}
              onPress={() => onDelete(asset)}
              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2 px-2.5 active:bg-rose-100"
            >
              <Trash2 size={13} color="#e11d48" />
              <Text className="text-xs font-semibold text-rose-700">Delete</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
