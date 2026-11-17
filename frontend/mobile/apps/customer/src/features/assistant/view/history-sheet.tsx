import { BlurBackdrop, Text } from "@vsolve/mobile-ui";
import { MessageCircle, Trash2 } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Animated, Modal, PanResponder, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { SavedChat } from "../queries";

const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.8;

/**
 * The saved chats. It closes by swiping down on its top (the handle and title), by
 * tapping outside it, or with the Android back button. It has no close button.
 */
export function HistorySheet({
  open,
  onClose,
  chats,
  currentToken,
  onSelect,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  chats: SavedChat[];
  currentToken: string | null;
  onSelect: (token: string) => void;
  onDelete: (token: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [offset] = useState(() => new Animated.Value(0));
  // A sheet that was swiped away opens again at rest.
  useEffect(() => {
    if (open) offset.setValue(0);
  }, [open, offset]);

  const swipe = useMemo(() => {
    const settle = () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) offset.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) onClose();
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [offset, onClose]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <BlurBackdrop onPress={onClose} accessibilityLabel="Close chats" />
        <Animated.View
          className="rounded-t-3xl bg-surface px-5 pt-3"
          style={{ transform: [{ translateY: offset }], paddingBottom: Math.max(16, insets.bottom) }}
        >
          <View {...swipe.panHandlers} className="pb-3">
            <View className="mb-3 h-1.5 w-12 self-center rounded-full bg-line-strong/60" />
            <Text className="text-lg font-bold text-navy-900">Chat history</Text>
            <Text className="text-xs text-[#6B6560]">
              {chats.length === 1 ? "1 chat" : `${chats.length} chats`}
            </Text>
          </View>
          {chats.length === 0 ? (
            <View className="items-center gap-2 py-10">
              <MessageCircle size={28} color="#94A3B8" />
              <Text className="text-sm text-slate-500">No chats yet</Text>
            </View>
          ) : (
            <ScrollView
              className="max-h-80"
              contentContainerClassName="gap-2 pb-1"
              showsVerticalScrollIndicator={false}
            >
              {chats.map((chat) => {
                const current = chat.token === currentToken;
                return (
                  <View
                    key={chat.token}
                    className={`flex-row items-center rounded-2xl border pl-3 pr-1 ${
                      current ? "border-[#EA580C]/40 bg-orange-50" : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: current }}
                      onPress={() => {
                        onClose();
                        if (!current) onSelect(chat.token);
                      }}
                      className="min-h-14 flex-1 flex-row items-center gap-3 py-2"
                    >
                      <View
                        className={`size-9 items-center justify-center rounded-full ${
                          current ? "bg-[#EA580C]" : "bg-white"
                        }`}
                      >
                        <MessageCircle size={17} color={current ? "#FFFFFF" : "#64748B"} />
                      </View>
                      <View className="flex-1">
                        <Text
                          numberOfLines={1}
                          className={`text-sm ${current ? "font-bold text-navy-900" : "font-medium text-slate-800"}`}
                        >
                          {chat.title ?? "New chat"}
                        </Text>
                        {current ? <Text className="text-[11px] text-[#EA580C]">Open now</Text> : null}
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete chat ${chat.title ?? "New chat"}`}
                      hitSlop={6}
                      onPress={() => onDelete(chat.token)}
                      className="min-h-11 min-w-11 items-center justify-center rounded-full active:bg-red-100"
                    >
                      <Trash2 size={17} color="#DC2626" />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}
