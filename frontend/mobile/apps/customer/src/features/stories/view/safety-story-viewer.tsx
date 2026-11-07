import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { COLOR_TOKENS, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  Clock,
  Pause,
  Play,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  StatusBar,
  View,
} from "react-native";

import type { SafetyStoryItem } from "../model";

export type SafetyStoryViewerProps = {
  isOpen: boolean;
  stories: SafetyStoryItem[];
  initialIndex?: number;
  onClose: () => void;
  onStoryViewed?: (storyId: string) => void;
};

const DEFAULT_IMAGE_DURATION_MS = 5000;

function formatExpiration(expiresAtIso: string): string {
  try {
    const expiresAt = new Date(expiresAtIso).getTime();
    const now = Date.now();
    const diffHours = Math.max(0, Math.round((expiresAt - now) / (1000 * 60 * 60)));
    if (diffHours <= 1) {
      const diffMins = Math.max(1, Math.round((expiresAt - now) / (1000 * 60)));
      return `${diffMins}m left`;
    }
    return `${diffHours}h left`;
  } catch {
    return "Expires today";
  }
}

export function SafetyStoryViewer({
  isOpen,
  stories,
  initialIndex = 0,
  onClose,
  onStoryViewed,
}: SafetyStoryViewerProps) {
  const safeInitial = Math.min(Math.max(0, initialIndex), Math.max(0, stories.length - 1));
  const [currentIndex, setCurrentIndex] = useState(safeInitial);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const currentIndexRef = useRef(safeInitial);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStory = stories[currentIndex];
  const isVideo = currentStory?.media_type === "VIDEO";

  // Video player configuration
  const player = useVideoPlayer(
    isVideo && currentStory ? currentStory.media_url : "",
    (p) => {
      p.loop = false;
      p.muted = isMuted;
      p.play();
    },
  );

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      const validIndex = Math.min(Math.max(0, initialIndex), Math.max(0, stories.length - 1));
      setCurrentIndex(validIndex);
      currentIndexRef.current = validIndex;
      setProgress(0);
      setIsPaused(false);
    }
  }

  useEffect(() => {
    if (isOpen && currentStory) {
      onStoryViewed?.(currentStory.id);
    }
  }, [isOpen, currentStory, onStoryViewed]);

  const handleNext = useCallback(() => {
    if (currentIndexRef.current < stories.length - 1) {
      setCurrentIndex((prev) => {
        const next = prev + 1;
        currentIndexRef.current = next;
        return next;
      });
      setProgress(0);
    } else {
      onClose();
    }
  }, [stories.length, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndexRef.current > 0) {
      setCurrentIndex((prev) => {
        const next = prev - 1;
        currentIndexRef.current = next;
        return next;
      });
      setProgress(0);
    }
  }, []);

  // Video synchronization
  useEffect(() => {
    if (!isVideo || !player) return;

    Reflect.set(player, "muted", isMuted);
    if (isPaused) {
      player.pause();
    } else {
      player.play();
    }
  }, [isVideo, player, isPaused, isMuted]);

  useEffect(() => {
    if (!isVideo || !player) return;

    const timeSub = player.addListener("timeUpdate", (event) => {
      if (player.duration > 0) {
        const p = (event.currentTime / player.duration) * 100;
        setProgress(p);
      }
    });

    const endSub = player.addListener("playToEnd", () => {
      handleNext();
    });

    return () => {
      timeSub.remove();
      endSub.remove();
    };
  }, [isVideo, player, handleNext]);

  // Image progress timer
  useEffect(() => {
    if (!isOpen || isPaused || isVideo || !stories.length) return;

    const intervalMs = 50;
    const step = (intervalMs / DEFAULT_IMAGE_DURATION_MS) * 100;

    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNext();
          return 0;
        }
        return prev + step;
      });
    }, intervalMs);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isOpen, isPaused, isVideo, stories.length, handleNext]);

  if (!isOpen || !currentStory) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View className="flex-1 bg-black justify-between">
        {/* Media Background Layer (Video or Image) */}
        <View className="absolute inset-0">
          {isVideo && player ? (
            <VideoView
              player={player}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              nativeControls={false}
            />
          ) : (
            <Image
              source={{ uri: resolveImageUrl(currentStory.media_url) || currentStory.media_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          )}
          <View className="absolute top-0 left-0 right-0 h-32 bg-black/60" />
        </View>

        {/* Tap Gesture Zones: Left 30% prev, Right 70% next, Press & Hold pause */}
        <View className="absolute inset-0 flex-row z-10">
          <Pressable
            className="w-[30%] h-full"
            onPress={handlePrev}
            onPressIn={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
          />
          <Pressable
            className="w-[70%] h-full"
            onPress={handleNext}
            onPressIn={() => setIsPaused(true)}
            onPressOut={() => setIsPaused(false)}
          />
        </View>

        {/* Top Header Overlays */}
        <SafeAreaView className="z-20 p-4 gap-3">
          {/* Segmented Progress Bars */}
          <View className="flex-row gap-1.5 w-full">
            {stories.map((story, i) => {
              const fill =
                i < currentIndex ? 100 : i === currentIndex ? progress : 0;
              return (
                <View
                  key={story.id}
                  className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden"
                >
                  <View
                    className="h-full bg-white rounded-full"
                    style={{ width: `${fill}%` }}
                  />
                </View>
              );
            })}
          </View>

          {/* Story Meta Header */}
          <View className="flex-row items-center justify-between pt-1">
            <View className="flex-row items-center gap-2">
              <View className="size-7 rounded-full bg-action items-center justify-center">
                <ShieldCheck size={16} color={COLOR_TOKENS.white} />
              </View>
              <View>
                <Text className="text-xs font-bold text-white">
                  {currentStory.title || "Safety Update"}
                </Text>
                <View className="flex-row items-center gap-1">
                  <Clock size={10} color={COLOR_TOKENS.line} />
                  <Text className="text-[10px] font-semibold text-white/80">
                    {formatExpiration(currentStory.expires_at)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Controls: Mute/Unmute, Pause/Play, Close */}
            <View className="flex-row items-center gap-2">
              {isVideo ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isMuted ? "Unmute audio" : "Mute audio"}
                  onPress={() => setIsMuted((m) => !m)}
                  hitSlop={8}
                  className="size-8 rounded-full bg-black/40 items-center justify-center active:bg-black/60"
                >
                  {isMuted ? (
                    <VolumeX size={16} color={COLOR_TOKENS.white} />
                  ) : (
                    <Volume2 size={16} color={COLOR_TOKENS.white} />
                  )}
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isPaused ? "Resume story" : "Pause story"}
                onPress={() => setIsPaused((p) => !p)}
                hitSlop={8}
                className="size-8 rounded-full bg-black/40 items-center justify-center active:bg-black/60"
              >
                {isPaused ? (
                  <Play size={15} color={COLOR_TOKENS.white} />
                ) : (
                  <Pause size={15} color={COLOR_TOKENS.white} />
                )}
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close story"
                onPress={onClose}
                hitSlop={12}
                className="size-8 rounded-full bg-black/40 items-center justify-center active:bg-black/60"
              >
                <X size={18} color={COLOR_TOKENS.white} />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>

        {/* Bottom Banner with Title & Caption */}
        <SafeAreaView className="z-20 p-4">
          <View className="rounded-xl bg-black/60 p-3.5 gap-1">
            {currentStory.caption ? (
              <Text className="text-xs text-white/95 leading-relaxed">
                {currentStory.caption}
              </Text>
            ) : null}
            <Text className="text-[11px] font-semibold text-white/70">
              Verified Trust &amp; Safety Protocol Â· V Solve
            </Text>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
