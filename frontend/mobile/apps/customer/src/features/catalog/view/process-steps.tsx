// Ported from frontend/apps/customer/features/catalog/components/process-steps.tsx
import { Text } from "@vsolve/mobile-ui";
import { Image, type ImageProps } from "expo-image";
import type { LinearGradientProps } from "expo-linear-gradient";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

// Type adapter for React 19 / JSX compatibility
const ExpoLinearGradient = LinearGradient as unknown as (props: LinearGradientProps) => React.JSX.Element;

import { resolveImageUrl } from "@/features/catalog/category-artwork";
import type { ServiceDetail } from "@/features/catalog/client-queries";
import { useIsDesktop } from "@/lib/responsive";

function cleanStep(title: string, text: string) {
  const cleanTitle = title.replace(/Service guarantee activation/i, "Service completion sign-off");
  const cleanText = text.replace(
    /The workmanship is covered for 30 days from the day the visit is completed\./i,
    "Testing and review before the professional marks the visit completed.",
  );
  return { title: cleanTitle, text: cleanText };
}

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
 * - Mobile (< md / !isDesktop): vertical timeline with numbered badges, connector stem, and 16:9 image per step.
 * - Desktop (isDesktop): Image-Hero 2+3 Bento Mosaic (top 2 large cards + bottom 3 medium cards).
 */
export function ProcessSteps({ steps }: { steps: MobileProcessStepItem[] }) {
  const isDesktop = useIsDesktop();
  const ordered = [...steps].sort((left, right) => left.display_order - right.display_order);

  if (ordered.length === 0) return null;

  if (isDesktop) {
    const topSteps = ordered.slice(0, 2);
    const bottomSteps = ordered.slice(2);

    return (
      <View className="mt-6 gap-4">
        {/* Top Row: 2 Large Cards */}
        {topSteps.length > 0 && (
          <View className="flex-row gap-4">
            {topSteps.map((step, index) => {
              const { title: stepTitle, text: stepText } = cleanStep(step.title, step.text);
              const resolvedCustomUrl = resolveImageUrl(step.image_url);
              const imageSource: ImageProps["source"] = resolvedCustomUrl
                ? { uri: resolvedCustomUrl }
                : DEFAULT_PROCESS_STEP_IMAGES[index % DEFAULT_PROCESS_STEP_IMAGES.length];

              return (
                <View
                  key={step.id}
                  className="relative h-[220px] lg:h-[240px] flex-1 overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-900 shadow-2xs"
                >
                  <Image
                    source={imageSource}
                    contentFit="cover"
                    contentPosition={{ top: "25%", left: "50%" }}
                    accessibilityLabel={stepTitle || `Step ${index + 1} visual guide`}
                    style={{ width: "100%", height: "100%" }}
                  />

                  {/* Bottom Gradient Scrim matching web from-black/85 via-black/30 to-transparent */}
                  <ExpoLinearGradient
                    pointerEvents="none"
                    colors={["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.3)", "rgba(0, 0, 0, 0.85)"]}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Step Number Badge */}
                  <View className="absolute top-3.5 left-3.5 size-7 items-center justify-center rounded-full bg-white shadow-md border-2 border-white/50">
                    <Text className="text-xs font-black text-[#00112e]">{index + 1}</Text>
                  </View>

                  {/* Bottom Text Overlay */}
                  <View className="absolute inset-x-5 bottom-4 z-10">
                    <Text className="text-base lg:text-[17px] font-extrabold tracking-tight text-white leading-tight">
                      {stepTitle}
                    </Text>
                    {stepText ? (
                      <Text numberOfLines={2} className="mt-1 text-xs lg:text-[13px] text-white/90 leading-snug max-w-xl">
                        {stepText}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Bottom Row: 3 Medium Cards */}
        {bottomSteps.length > 0 && (
          <View className="flex-row gap-4">
            {bottomSteps.map((step, idx) => {
              const actualIndex = idx + 2;
              const { title: stepTitle, text: stepText } = cleanStep(step.title, step.text);
              const resolvedCustomUrl = resolveImageUrl(step.image_url);
              const imageSource: ImageProps["source"] = resolvedCustomUrl
                ? { uri: resolvedCustomUrl }
                : DEFAULT_PROCESS_STEP_IMAGES[actualIndex % DEFAULT_PROCESS_STEP_IMAGES.length];

              return (
                <View
                  key={step.id}
                  className="relative h-[190px] lg:h-[205px] flex-1 overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-900 shadow-2xs"
                >
                  <Image
                    source={imageSource}
                    contentFit="cover"
                    contentPosition={{ top: "25%", left: "50%" }}
                    accessibilityLabel={stepTitle || `Step ${actualIndex + 1} visual guide`}
                    style={{ width: "100%", height: "100%" }}
                  />

                  {/* Bottom Gradient Scrim matching web from-black/85 via-black/30 to-transparent */}
                  <ExpoLinearGradient
                    pointerEvents="none"
                    colors={["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0.3)", "rgba(0, 0, 0, 0.85)"]}
                    locations={[0, 0.5, 1]}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />

                  {/* Step Number Badge */}
                  <View className="absolute top-3 left-3 size-7 items-center justify-center rounded-full bg-white shadow-md border-2 border-white/50">
                    <Text className="text-xs font-black text-[#00112e]">{actualIndex + 1}</Text>
                  </View>

                  {/* Bottom Text Overlay */}
                  <View className="absolute inset-x-4 bottom-3.5 z-10">
                    <Text numberOfLines={1} className="text-sm lg:text-[15px] font-extrabold tracking-tight text-white leading-tight">
                      {stepTitle}
                    </Text>
                    {stepText ? (
                      <Text numberOfLines={1} className="mt-1 text-xs text-white/90 leading-snug">
                        {stepText}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  // Mobile (< md / !isDesktop) layout - untouched
  return (
    <View className="mt-5">
      {ordered.map((step, index) => {
        const last = index === ordered.length - 1;
        const { title: stepTitle, text: stepText } = cleanStep(step.title, step.text);
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
