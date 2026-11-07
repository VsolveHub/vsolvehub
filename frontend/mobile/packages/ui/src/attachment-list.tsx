// Ported from frontend/packages/ui/src/attachment-list.tsx
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { cn } from "./cn";
import { Text } from "./text";

export type AttachmentStatus = "uploading" | "attached" | "failed";
export type AttachmentKind = "image" | "video" | "audio" | "document";

const KIND_LABEL: Record<AttachmentKind, string> = {
  image: "Photo",
  video: "Video",
  audio: "Voice note",
  document: "Document",
};

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  status: AttachmentStatus;
  size?: string;
  progress?: number;
  error?: string;
}

export interface AttachmentListProps {
  items: readonly Attachment[];
  label: string;
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  empty?: ReactNode;
  className?: string;
}

export function AttachmentList({ items, label, onRemove, onRetry, empty, className }: AttachmentListProps) {
  if (items.length === 0) return empty ? <>{empty}</> : null;
  return (
    <View accessibilityLabel={label} className={cn("gap-2", className)}>
      {items.map((item) => {
        const percent = Math.min(100, Math.max(0, Math.round(item.progress ?? 0)));
        return (
          <View
            key={item.id}
            className={cn(
              "flex-row items-center gap-3 rounded-control border px-3 py-2.5",
              item.status === "failed" ? "border-danger-line bg-danger-surface" : "border-line bg-surface",
            )}
          >
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-text" numberOfLines={1}>
                {item.name}
              </Text>
              {item.status === "failed" ? (
                <Text className="text-xs text-danger-text">
                  {item.error ?? "This file did not upload. It has not been attached."}
                </Text>
              ) : item.status === "uploading" ? (
                <Text className="text-xs text-text-secondary">{percent}%</Text>
              ) : (
                <Text className="text-xs text-text-secondary">
                  {KIND_LABEL[item.kind]}
                  {item.size ? ` · ${item.size}` : ""}
                </Text>
              )}
            </View>
            {item.status === "failed" && onRetry ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Retry ${item.name}`} onPress={() => onRetry(item.id)}>
                <Text className="text-sm font-semibold text-text-link">Retry</Text>
              </Pressable>
            ) : null}
            {onRemove ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} onPress={() => onRemove(item.id)}>
                <Text className="text-sm text-text-muted">Remove</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
