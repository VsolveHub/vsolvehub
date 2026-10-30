// Ported from frontend/apps/customer/app/page.tsx.
// Supports 100% faithful desktop layout matching the web customer portal when on desktop,
// while leaving the mobile version 100% unchanged.
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
import { DesktopSiteFooter } from "@/features/session/view/desktop-site-footer";
import { useIsDesktop } from "@/lib/responsive";

const HERO =
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=2070&auto=format&fit=crop";

export function HomeScreen() {
  const isDesktop = useIsDesktop();
  if (isDesktop) {
    return <DesktopHomeScreen />;
  }
  return <MobileHomeScreen />;
}

/**
 * 100% faithful desktop layout matching Image 1 (frontend/apps/customer/app/page.tsx)
 */
function DesktopHomeScreen() {
  const router = useRouter();
  const categories = useCategories();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await categories.refetch();
    setRefreshing(false);
  };

  const handleCategoryPress = (category: Category) => {
    if (category.slug === "rental-services") {
      router.push("/rentals" as never);
    } else if (category.slug === "rooms-pg-hostel-hotels") {
      router.push("/stays" as never);
    } else if (category.slug === "career-jobs") {
      router.push("/listings" as never);
    } else {
      router.push(`/catalog/${category.slug}` as never);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="pb-0 pt-0"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="mx-auto w-full max-w-[1216px] px-6 lg:px-8 pt-6">
        {/* 1. Desktop Hero Section */}
        <View className="relative w-full min-h-[520px] mt-2 mb-20">
          {/* Floating Vetted Badge */}
          <View className="absolute -top-3.5 right-[8%] z-10 flex-row items-center gap-2 rounded-full border border-[#e7e2da] bg-white px-4 py-2 shadow-sm">
            <View className="size-5 items-center justify-center rounded-full bg-[#fdf3ec]">
              <Svg viewBox="0 0 20 20" width={14} height={14} fill="#EA580C">
                <Path
                  fillRule="evenodd"
                  d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0 3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </Svg>
            </View>
            <Text className="text-sm font-bold text-navy-900">100% Vetted Pros</Text>
          </View>

          {/* Right Image Container */}
          <View className="ml-auto w-3/4 h-[520px] rounded-[1.5rem] overflow-hidden bg-navy-100 shadow-inner">
            <Image
              source={{ uri: HERO }}
              contentFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          </View>

          {/* Left Dark Floating Card */}
          <View className="absolute left-0 top-[10%] w-[480px] z-10 rounded-[1.5rem] bg-navy-900 p-10 shadow-2xl">
            <Text className="text-[2.75rem] font-extrabold leading-[1.1] text-white tracking-tight">
              Your Home,{"\n"}
              <Text className="text-[#FFAE7B] font-extrabold">Masterfully</Text>{"\n"}
              Handled.
            </Text>
            <Text className="mt-5 text-[1.05rem] leading-relaxed text-white/80 font-normal">
              Bespoke professional services for the modern homeowner. Elite, vetted specialists for every domestic need.
            </Text>
            <View className="mt-8">
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/catalog")}
                className="self-start flex-row items-center gap-2 rounded-full bg-[#EA580C] px-8 py-3.5 shadow-sm active:scale-95 hover:bg-[#d65e00]"
              >
                <Text className="text-[0.95rem] font-bold text-white">Explore Services</Text>
                <Svg viewBox="0 0 20 20" width={16} height={16} fill="none">
                  <Path d="M4 10h11m-4-4 4 4-4 4" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Pressable>
            </View>
          </View>
        </View>

        {/* 2. Curated Services Section */}
        <View className="mb-20">
          <View className="flex-row items-end justify-between mb-8">
            <View>
              <Text className="text-[2.75rem] font-extrabold tracking-tight text-navy-900">Curated Services</Text>
              <Text className="mt-2 text-[1.05rem] text-text-secondary font-normal">
                Expertise across every domain of your property.
              </Text>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/catalog")}
              className="flex-row items-center self-start text-sm font-bold text-[#b46535] hover:text-[#EA580C]"
            >
              <Text className="text-sm font-bold text-[#b46535] mr-1">View All Categories</Text>
              <Svg viewBox="0 0 20 20" width={16} height={16} fill="none">
                <Path d="M4 10h11m-4-4 4 4-4 4" stroke="#b46535" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>

          {categories.isPending ? (
            <View className="flex-row flex-wrap gap-5">
              {Array.from({ length: 6 }, (_, index) => (
                <View key={index} style={{ width: "14.8%" }} className="aspect-square rounded-2xl bg-surface-sunken" />
              ))}
            </View>
          ) : null}

          {categories.isError ? (
            <EmptyState
              title="We could not load services"
              description="Check your connection and try again."
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
            <View className="flex-row flex-wrap gap-5">
              {(categories.data ?? []).map((category) => (
                <Pressable
                  key={category.id}
                  accessibilityRole="link"
                  onPress={() => handleCategoryPress(category)}
                  style={{ width: "14.8%" }}
                  className="items-center gap-2.5 group hover:scale-105"
                >
                  <View className="aspect-square w-full rounded-2xl bg-[#F8F9FA] border border-[#e7e2da] overflow-hidden items-center justify-center p-3.5 shadow-xs">
                    <CategoryArtwork category={category} iconSize={48} />
                  </View>
                  <Text numberOfLines={2} className="w-full text-center text-[14px] font-bold leading-tight text-navy-900 px-1">
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {/* 3. Rich Client Sections (Best Sellers, Electrical Safety Carousel, Electrician, Guides, Plumbing, Carpenter, Testimonials) */}
        <View className="mb-20">
          <HomepageClientSections />
        </View>

        {/* 4. The V Solve Approach Section */}
        <View className="my-16 items-center">
          <Text className="text-[2.75rem] font-extrabold tracking-tight text-navy-900 text-center">
            The V Solve Approach
          </Text>
          <Text className="mt-3 text-[1.05rem] text-text-secondary font-normal text-center max-w-xl">
            A seamless, curated process designed to deliver excellence without friction.
          </Text>

          <View className="mt-16 w-full relative">
            {/* Dashed connecting line across the 3 nodes */}
            <View
              style={{
                position: "absolute",
                top: 32,
                left: "18%",
                right: "18%",
                height: 1,
                borderTopWidth: 2,
                borderStyle: "dashed",
                borderColor: "#F3E7D3",
              }}
            />

            <View className="flex-row justify-between w-full">
              <View className="flex-1 items-center px-6">
                <View className="z-10 size-16 items-center justify-center rounded-full bg-navy-900 text-white shadow-sm mb-6">
                  <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672ZM12 2.25V4.5m5.834.166-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-5.834L6.166 3.075m11.226 10.155a5.25 5.25 0 0 1-5.756 8.356L12 21v-4.5Z" />
                  </Svg>
                </View>
                <Text className="text-lg font-bold text-navy-900">1. Request</Text>
                <Text className="mt-3 text-sm text-text-secondary leading-relaxed font-normal text-center max-w-xs">
                  Detail your needs through our intuitive platform. We analyze the scope instantly.
                </Text>
              </View>

              <View className="flex-1 items-center px-6">
                <View className="z-10 size-16 items-center justify-center rounded-full bg-navy-900 text-white shadow-sm mb-6">
                  <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
                  </Svg>
                </View>
                <Text className="text-lg font-bold text-navy-900">2. Match</Text>
                <Text className="mt-3 text-sm text-text-secondary leading-relaxed font-normal text-center max-w-xs">
                  We pair you with a top-tier, rigorously vetted professional suited for your specific task.
                </Text>
              </View>

              <View className="flex-1 items-center px-6">
                <View className="z-10 size-16 items-center justify-center rounded-full bg-navy-900 text-white shadow-sm mb-6">
                  <Svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="#ffffff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M4.5 12.75l6 6 9-13.5" />
                  </Svg>
                </View>
                <Text className="text-lg font-bold text-navy-900">3. Resolve</Text>
                <Text className="mt-3 text-sm text-text-secondary leading-relaxed font-normal text-center max-w-xs">
                  The job is completed to our exacting standards, with seamless cashless payment.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 5. Desktop Site Footer */}
      <DesktopSiteFooter />
    </ScrollView>
  );
}

/**
 * Mobile layout (100% UNTOUCHED & PRESERVED for phone users)
 */
function MobileHomeScreen() {
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
