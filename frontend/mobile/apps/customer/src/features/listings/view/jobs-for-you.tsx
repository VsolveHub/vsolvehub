import { useQuery } from "@tanstack/react-query";
import { Badge, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import { MapPin, Sparkles, UserCheck } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";

import {
  fetchJobsForYou,
  fetchMyJobProfile,
  MATCH_LOOK,
  type JobForYou,
} from "../seeker-queries";

export function JobsForYou() {
  const router = useRouter();
  const profileQuery = useQuery({
    queryKey: ["my-job-profile"],
    queryFn: fetchMyJobProfile,
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs-for-you"],
    queryFn: fetchJobsForYou,
    enabled: Boolean(profileQuery.data),
  });

  if (profileQuery.isLoading) return null;

  if (!profileQuery.data) {
    return (
      <View className="rounded-2xl border border-brand/30 bg-brand/5 p-4 gap-3">
        <View className="flex-row items-start gap-3">
          <View className="rounded-full bg-brand/10 p-2">
            <UserCheck size={18} color="#EA580C" />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-sm font-black text-navy-900">Make your job profile once</Text>
            <Text className="text-xs text-text-secondary leading-relaxed">
              Tap the jobs and skills you have. We will show matching jobs and you can apply in one tap.
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings/profile" as never)}
          className="self-end rounded-xl bg-brand px-4 py-2 active:bg-brand/90"
        >
          <Text className="text-xs font-bold text-white">Create profile</Text>
        </Pressable>
      </View>
    );
  }

  const rows: JobForYou[] = jobsQuery.data ?? [];

  return (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Sparkles size={16} color="#EA580C" />
          <Text className="text-sm font-black text-navy-900">Jobs for you</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/listings/profile" as never)}
        >
          <Text className="text-xs font-bold text-brand">Edit profile</Text>
        </Pressable>
      </View>

      {rows.length === 0 && !jobsQuery.isLoading ? (
        <Text className="text-xs text-text-secondary">
          No close matches yet. We will notify you when one is posted.
        </Text>
      ) : null}

      {rows.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 pb-1"
        >
          {rows.slice(0, 10).map(({ listing, match }) => {
            const look = (match.level && MATCH_LOOK[match.level]) ?? MATCH_LOOK.OTHER!;
            const slug = listing.slug || listing.id;

            return (
              <Pressable
                key={listing.id}
                onPress={() => {
                  if (slug) router.push(`/listings/${slug}` as never);
                }}
                className="w-56 rounded-2xl border border-line bg-surface p-3.5 gap-2 shadow-xs active:border-brand"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-base font-black text-navy-900">{match.score}%</Text>
                  <Badge tone={look.tone}>
                    <Text className="text-[10px] font-bold">{look.label}</Text>
                  </Badge>
                </View>

                <View className="gap-0.5">
                  <Text className="text-xs font-extrabold text-navy-900" numberOfLines={1}>
                    {listing.title}
                  </Text>
                  {listing.poster_name ? (
                    <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
                      {listing.poster_name}
                    </Text>
                  ) : null}
                </View>

                {listing.location_text ? (
                  <View className="flex-row items-center gap-1 mt-auto pt-1">
                    <MapPin size={11} color="#6B6560" />
                    <Text className="text-[10px] text-text-muted" numberOfLines={1}>
                      {listing.location_text}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}
