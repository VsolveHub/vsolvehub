// Ported from the phone block of frontend/apps/customer/app/page.tsx.
import { EmptyState, Text } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useState, type ReactNode } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

import { CategoryArtwork } from "@/features/catalog/category-artwork";
import { useCategories, type Category } from "@/features/catalog/client-queries";
import { HomepageClientSections } from "@/features/catalog/view/homepage-sections";

const HERO =
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=2070&auto=format&fit=crop";

export function HomeScreen() {
  const router = useRouter();
  const categories = useCategories();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await categories.refetch();
    setRefreshing(false);
  };

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="gap-8 px-4 pb-8 pt-2"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="h-12 flex-row items-center rounded-xl bg-[#f4f1ec] px-4">
        <Svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="#6B6560" strokeWidth={2.5}>
          <Circle cx={9} cy={9} r={6} />
          <Path d="m20 20-4.5-4.5" strokeLinecap="round" />
        </Svg>
        <TextInput
          placeholder="Search for a service..."
          placeholderTextColor="rgba(107,101,96,0.7)"
          className="ml-3 h-12 flex-1 text-sm font-medium text-[#00112e]"
        />
      </View>

      <View className="relative min-h-[190px] overflow-hidden rounded-[1.5rem]">
        <Image
          source={{ uri: HERO }}
          contentFit="cover"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
        />
        <LinearGradient
          colors={["rgba(0,17,46,0.9)", "rgba(0,17,46,0.5)", "rgba(0,17,46,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ minHeight: 190, justifyContent: "space-between", padding: 20 }}
        >
          <View className="self-start rounded-full bg-[#f87000] px-3 py-1">
            <Text className="text-[9px] font-extrabold uppercase tracking-wider text-white">Premium Quality</Text>
          </View>
          <Text className="mt-8 max-w-[85%] text-[1.5rem] font-extrabold leading-tight text-white">
            Elite Home Services, at Your Doorstep
          </Text>
        </LinearGradient>
      </View>

      <View className="gap-3.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-extrabold text-[#00112e]">Our Services</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push("/catalog")}>
            <Text className="text-sm font-bold text-[#f87000]">See All</Text>
          </Pressable>
        </View>
        {categories.isPending ? (
          <View className="flex-row flex-wrap gap-3">
            {Array.from({ length: 6 }, (_, index) => (
              <View key={index} className="aspect-square w-[31%] rounded-2xl bg-surface-sunken" />
            ))}
          </View>
        ) : null}
        {categories.isError ? (
          <EmptyState
            title="We could not load services"
            description={
              categories.error
                ? `${(categories.error as any).name ?? "Error"}: ${(categories.error as any).message ?? String(categories.error)}${(categories.error as any).cause ? ` (${String((categories.error as any).cause?.message || (categories.error as any).cause)})` : ""}`
                : "Check your connection and try again."
            }
            action={
              <Pressable accessibilityRole="button" onPress={() => void categories.refetch()} className="rounded-control bg-action px-4 py-2">
                <Text className="text-sm font-semibold text-action-text">Try again</Text>
              </Pressable>
            }
          />
        ) : null}
        {!categories.isPending && !categories.isError && (categories.data ?? []).length === 0 ? (
          <EmptyState title="No services are published yet" description="Our catalogue is being set up. Please check back shortly." />
        ) : null}
        {!categories.isPending && !categories.isError ? (
          <View className="flex-row flex-wrap gap-3">
            {(categories.data ?? []).map((category) => (
              <CategoryTile
                key={category.id}
                category={category}
                onPress={() => {
                  if (category.slug === "rental-services") {
                    router.push("/rentals" as never);
                  } else if (category.slug === "rooms-pg-hostel-hotels") {
                    router.push("/stays" as never);
                  } else if (category.slug === "career-jobs") {
                    router.push("/listings" as never);
                  } else {
                    router.push(`/catalog/${category.slug}` as never);
                  }
                }}
              />
            ))}
          </View>
        ) : null}
      </View>

      <HomepageClientSections />

      <View className="rounded-[1.5rem] border border-[#e7e2da]/30 bg-[#f4f1ec] p-6">
        <Text className="mb-6 text-center text-xl font-extrabold text-[#00112e]">The V Solve Way</Text>
        <WayStep
          title="1. Book a Service"
          body="Select your required service and preferred time slot easily."
          icon={<PhoneIcon />}
        />
        <View className="h-6" />
        <WayStep
          title="2. Get Matched"
          body="We assign a highly trained, background-checked professional."
          icon={<CheckCardIcon />}
        />
        <View className="h-6" />
        <WayStep
          title="3. Service at Home"
          body="Sit back and relax while our expert completes the job."
          icon={<HomeIcon />}
          accent
        />
      </View>

      <View className="gap-4">
        <Text className="text-xl font-extrabold text-[#00112e]">Why V Solve Hub?</Text>
        <Reason
          title="100% Quality Assurance"
          body="Guaranteed satisfaction on every job."
          icon={<ShieldIcon />}
        />
        <Reason
          title="Expert Training"
          body="Professionals vetted and trained to elite standards."
          icon={<CapIcon />}
        />
      </View>
    </ScrollView>
  );
}

function CategoryTile({ category, onPress }: { category: Category; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} className="w-[31%] items-center gap-1.5 active:opacity-80">
      <View className="aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border border-line/80 bg-[#F8F9FA] p-2.5 shadow-2xs">
        <CategoryArtwork category={category} iconSize={30} />
      </View>
      <Text numberOfLines={2} className="w-full text-center text-[11px] font-bold leading-tight text-[#00112e]">
        {category.name}
      </Text>
    </Pressable>
  );
}

function WayStep({ title, body, icon, accent = false }: { title: string; body: string; icon: ReactNode; accent?: boolean }) {
  return (
    <View className="flex-row items-start gap-4">
      <View className={accent ? "size-11 items-center justify-center rounded-full bg-[#f87000]" : "size-11 items-center justify-center rounded-full bg-[#00112e]"}>
        {icon}
      </View>
      <View className="flex-1 pt-1">
        <Text className="text-sm font-extrabold text-[#00112e]">{title}</Text>
        <Text className="mt-0.5 text-[11px] font-semibold leading-relaxed text-text-secondary">{body}</Text>
      </View>
    </View>
  );
}

function Reason({ title, body, icon }: { title: string; body: string; icon: ReactNode }) {
  return (
    <View className="flex-row items-center gap-4 rounded-[1.25rem] border border-[#e7e2da]/40 bg-white p-4">
      <View className="size-12 items-center justify-center rounded-full bg-[#00112e]">{icon}</View>
      <View className="flex-1">
        <Text className="text-sm font-extrabold text-[#00112e]">{title}</Text>
        <Text className="mt-0.5 text-xs font-semibold text-text-secondary">{body}</Text>
      </View>
    </View>
  );
}

function PhoneIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#ffffff" strokeWidth={2}>
      <Rect x={5} y={2} width={14} height={20} rx={2} />
      <Line x1={12} y1={18} x2={12} y2={18.01} strokeLinecap="round" />
    </Svg>
  );
}

function CheckCardIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#ffffff" strokeWidth={2}>
      <Rect x={3} y={4} width={18} height={16} rx={2} />
      <Path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HomeIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#ffffff" strokeWidth={2}>
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#ffffff" strokeWidth={2}>
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m9 11 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CapIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#ffffff" strokeWidth={2}>
      <Path d="M22 10v6M2 10l10-5 10 5-10 5z" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
