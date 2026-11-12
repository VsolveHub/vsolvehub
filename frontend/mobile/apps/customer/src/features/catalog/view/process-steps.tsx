// Ported from frontend/apps/customer/features/catalog/components/process-steps.tsx
import { useEffect, useRef, useState } from "react";
import { Text } from "@vsolve/mobile-ui";
import { Animated, Pressable, View } from "react-native";
import { Image, type ImageProps } from "expo-image";
import { formatGuaranteePolicy } from "@/lib/guarantee-presentation";
import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { useIsDesktop } from "@/lib/responsive";

import type { ServiceDetail } from "@/features/catalog/client-queries";

export type MobileProcessStepItem = ServiceDetail["policies"][number] & {
  image_url?: string | null;
};

const DEFAULT_PROCESS_STEP_IMAGES: readonly ImageProps["source"][] = [
  require("../../../../assets/process-steps/step-1-inspection.webp"),
  require("../../../../assets/process-steps/step-2-approval.webp"),
  require("../../../../assets/process-steps/step-3-setup.webp"),
  require("../../../../assets/process-steps/step-4-execution.webp"),
  require("../../../../assets/process-steps/step-5-handover.webp"),
];

/**
 * How the visit actually runs, in order.
 *
 * - Mobile: vertical sequence with number badges, connector lines, and single 16:9 image slots.
 * - Desktop: interactive Spotlight Hero + Thumbnail Filmstrip with smooth fade/slide animations.
 */
export function ProcessSteps({ steps }: { steps: MobileProcessStepItem[] }) {
  const isDesktop = useIsDesktop();
  const ordered = [...steps].sort((left, right) => left.display_order - right.display_order);
  const [activeIndex, setActiveIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const safeIndex = ordered.length > 0 ? Math.min(activeIndex, ordered.length - 1) : 0;

  useEffect(() => {
    if (!isDesktop || ordered.length === 0) return;
    fadeAnim.setValue(0.35);
    slideAnim.setValue(8);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [safeIndex, isDesktop, ordered.length, fadeAnim, slideAnim]);

  if (ordered.length === 0) return null;

  if (isDesktop) {
    const activeStep = ordered[safeIndex]!;
    const activeTitle = formatGuaranteePolicy(activeStep.title) ?? activeStep.title;
    const activeText = formatGuaranteePolicy(activeStep.text) ?? activeStep.text;
    const activeCustomUrl = resolveImageUrl(activeStep.image_url);
    const activeImageSource: ImageProps["source"] = activeCustomUrl
      ? { uri: activeCustomUrl }
      : DEFAULT_PROCESS_STEP_IMAGES[safeIndex % DEFAULT_PROCESS_STEP_IMAGES.length];

    return (
      <View className="mt-5">
        {/* Main Spotlight Stage */}
        <View className="relative h-[320px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-sm">
          <Animated.View
            style={{
              width: "100%",
              height: "100%",
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <Image
              source={activeImageSource}
              contentFit="cover"
              contentPosition={{ top: "25%", left: "50%" }}
              accessibilityLabel={activeTitle || `Step ${safeIndex + 1} visual guide`}
              style={{ width: "100%", height: "100%" }}
            />
          </Animated.View>

          {/* Dark bottom overlay for legible caption */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 150,
              backgroundColor: "rgba(0, 10, 26, 0.72)",
            }}
          />

          {/* Top-right Prev / Next Step Controls */}
          {ordered.length > 1 ? (
            <View className="absolute top-4 right-4 z-10 flex-row items-center gap-1.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous step"
                onPress={() => setActiveIndex((safeIndex - 1 + ordered.length) % ordered.length)}
                className="size-8 items-center justify-center rounded-full bg-black/50"
              >
                <Text className="text-sm font-bold text-white">←</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next step"
                onPress={() => setActiveIndex((safeIndex + 1) % ordered.length)}
                className="size-8 items-center justify-center rounded-full bg-black/50"
              >
                <Text className="text-sm font-bold text-white">→</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Animated Caption */}
          <Animated.View
            style={{
              position: "absolute",
              left: 24,
              right: 24,
              bottom: 20,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <View className="self-start rounded-full bg-[#EA580C] px-2.5 py-0.5">
              <Text className="text-[11px] font-extrabold text-white">
                Step {safeIndex + 1} of {ordered.length}
              </Text>
            </View>
            {activeTitle ? (
              <Text className="mt-2 text-xl font-extrabold text-white tracking-tight">
                {activeTitle}
              </Text>
            ) : null}
            {activeText ? (
              <Text numberOfLines={2} className="mt-1 text-sm text-white/90 leading-relaxed">
                {activeText}
              </Text>
            ) : null}
          </Animated.View>
        </View>

        {/* 5-Thumbnail Filmstrip */}
        <View className="mt-3.5 flex-row gap-3">
          {ordered.map((step, index) => {
            const isActive = index === safeIndex;
            const stepTitle = formatGuaranteePolicy(step.title) ?? step.title;
            const resolvedCustomUrl = resolveImageUrl(step.image_url);
            const imageSource: ImageProps["source"] = resolvedCustomUrl
              ? { uri: resolvedCustomUrl }
              : DEFAULT_PROCESS_STEP_IMAGES[index % DEFAULT_PROCESS_STEP_IMAGES.length];

            return (
              <Pressable
                key={step.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => setActiveIndex(index)}
                className={`flex-1 rounded-xl border p-1.5 ${
                  isActive
                    ? "border-[#EA580C] bg-[#FFF8F3] shadow-sm"
                    : "border-slate-200 bg-white opacity-80"
                }`}
              >
                <View className="w-full overflow-hidden rounded-lg bg-slate-100" style={{ aspectRatio: 16 / 10 }}>
                  <Image
                    source={imageSource}
                    contentFit="cover"
                    contentPosition={{ top: "25%", left: "50%" }}
                    style={{ width: "100%", height: "100%" }}
                  />
                </View>
                <View className="mt-1.5 flex-row items-center gap-1.5 px-0.5">
                  <View
                    className={`size-5 shrink-0 items-center justify-center rounded-full ${
                      isActive ? "bg-[#EA580C]" : "bg-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-extrabold ${
                        isActive ? "text-white" : "text-slate-700"
                      }`}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    className={`flex-1 text-xs font-bold ${
                      isActive ? "text-navy-900" : "text-slate-700"
                    }`}
                  >
                    {stepTitle || `Step ${index + 1}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View className="mt-5">
      {ordered.map((step, index) => {
        const last = index === ordered.length - 1;
        const stepTitle = formatGuaranteePolicy(step.title) ?? step.title;
        const stepText = formatGuaranteePolicy(step.text) ?? step.text;
        const resolvedCustomUrl = resolveImageUrl(step.image_url);
        const imageSource: ImageProps["source"] = resolvedCustomUrl
          ? { uri: resolvedCustomUrl }
          : DEFAULT_PROCESS_STEP_IMAGES[index % DEFAULT_PROCESS_STEP_IMAGES.length];

        return (
          <View key={step.id} className={`relative flex-row gap-4 ${last ? "pb-2" : "pb-7"}`}>
            {!last ? (
              <View
                style={{
                  position: "absolute",
                  left: 15,
                  top: 36,
                  bottom: 0,
                  width: 1.5,
                  backgroundColor: "#E2E8F0",
                }}
              />
            ) : null}

            {/* Circular Step Number Badge */}
            <View className="size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-[#F8FAFC] shadow-2xs">
              <Text className="text-[13px] font-extrabold text-navy-900">{index + 1}</Text>
            </View>

            {/* Step Content */}
            <View className="min-w-0 flex-1 pt-0.5">
              {stepTitle ? (
                <Text className="text-[15px] font-bold text-navy-900 leading-snug">
                  {stepTitle}
                </Text>
              ) : null}

              {stepText ? (
                <Text className="mt-1 text-xs text-text-secondary leading-relaxed">
                  {stepText}
                </Text>
              ) : null}

              {/* Single Image Slot per Step (16:9) */}
              <View className="mt-3 h-[180px] w-full rounded-2xl overflow-hidden border border-slate-200 bg-[#F8FAFC]">
                <Image
                  source={imageSource}
                  contentFit="cover"
                  contentPosition={{ top: "25%", left: "50%" }}
                  accessibilityLabel={stepTitle || `Step ${index + 1} visual guide`}
                  style={{ width: "100%", height: "100%" }}
                />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
