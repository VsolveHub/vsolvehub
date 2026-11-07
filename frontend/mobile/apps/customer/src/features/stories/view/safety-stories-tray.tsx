import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { Play, ShieldCheck } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import type { SafetyStoryItem } from "../model";
import { fetchActiveSafetyStories } from "../queries";
import { SafetyStoryViewer } from "./safety-story-viewer";

export function SafetyStoriesTray({
  initialStories = [],
}: {
  initialStories?: SafetyStoryItem[];
}) {
  const { data: stories = [] } = useQuery({
    queryKey: ["safety-stories"],
    queryFn: fetchActiveSafetyStories,
    initialData: initialStories.length > 0 ? initialStories : undefined,
  });

  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleOpenStory = (index: number) => {
    setSelectedIndex(index);
    setViewerOpen(true);
  };

  const handleStoryViewed = useCallback((storyId: string) => {
    setViewedIds((prev) => {
      if (prev.has(storyId)) return prev;
      return new Set(prev).add(storyId);
    });
  }, []);

  if (!stories || stories.length === 0) {
    return null;
  }

  return (
    <View className="w-full my-3">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-2.5 px-0.5">
        <View className="flex-row items-center gap-2">
          <View className="size-7 items-center justify-center rounded-full bg-[#fdf3ec] border border-[#ffc4a0]/40">
            <ShieldCheck size={16} color="#f87000" />
          </View>
          <Text className="text-base font-extrabold text-navy-900 tracking-tight">
            Safety Stories
          </Text>
          <View className="rounded-full bg-[#fdf3ec] px-2 py-0.5 border border-[#ffc4a0]/50">
            <Text className="text-[10px] font-extrabold uppercase tracking-wide text-[#a94900]">
              24h Updates
            </Text>
          </View>
        </View>

        <Pressable
          hitSlop={8}
          onPress={() => handleOpenStory(0)}
        >
          <Text className="text-xs font-bold text-[#f87000]">
            Watch all â†’
          </Text>
        </Pressable>
      </View>

      {/* Horizontal Story Avatar List */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 14, paddingHorizontal: 2, paddingVertical: 4 }}
      >
        {stories.map((story, index) => {
          const isViewed = viewedIds.has(story.id);

          return (
            <Pressable
              key={story.id}
              onPress={() => handleOpenStory(index)}
              className="items-center"
              accessibilityRole="button"
              accessibilityLabel={`Watch story: ${story.title || "Safety update"}`}
            >
              {/* Outer Ring */}
              <View
                className={`p-[2.5px] rounded-full ${
                  isViewed
                    ? "bg-[#d3ccc0]"
                    : "bg-[#f87000]"
                }`}
              >
                <View className="p-[2px] rounded-full bg-white">
                  <View className="size-16 rounded-full overflow-hidden bg-navy-100 items-center justify-center">
                    <Image
                      source={{ uri: resolveImageUrl(story.thumbnail_url || story.media_url) || (story.thumbnail_url || story.media_url) }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                    />
                    {story.media_type === "VIDEO" ? (
                      <View className="absolute inset-0 bg-black/25 items-center justify-center">
                        <Play size={16} color="#fff" fill="#fff" />
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Title Under Avatar */}
              <Text
                className={`w-16 text-[11px] text-center font-extrabold tracking-tight mt-1 ${
                  isViewed ? "text-text-secondary" : "text-navy-900"
                }`}
                numberOfLines={1}
              >
                {story.title || "Safety"}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Fullscreen Story Viewer */}
      {viewerOpen ? (
        <SafetyStoryViewer
          key={`${selectedIndex}-${stories.length}`}
          isOpen={viewerOpen}
          stories={stories}
          initialIndex={selectedIndex}
          onClose={() => setViewerOpen(false)}
          onStoryViewed={handleStoryViewed}
        />
      ) : null}
    </View>
  );
}
