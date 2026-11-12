import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Logo, Text } from "@vsolve/mobile-ui";
import type { ImageProps } from "expo-image";
import { Image } from "expo-image";
import type { LinearGradientProps } from "expo-linear-gradient";
import { LinearGradient } from "expo-linear-gradient";

// Type adapters for React 19 / TypeScript 6 JSX compatibility
const ExpoImage = Image as unknown as (props: ImageProps) => React.JSX.Element;
const ExpoLinearGradient = LinearGradient as unknown as (props: LinearGradientProps) => React.JSX.Element;
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  Snowflake,
  Sparkles,
  Wrench,
} from "lucide-react-native";

import { getActiveHeroSlides, type HeroSlide } from "../hero-slides";
import { DiwaliSceneSvg } from "./diwali-scene-svg";

/**
 * Safely resolves an image source for ExpoImage.
 * Supports bundled asset requires, object sources, and URI strings.
 * Prevents `s?.uri?.startsWith is not a function` error when source is an asset object or number.
 */
function resolveHeroImageSource(src: unknown): ImageProps["source"] {
  if (!src) return undefined;
  if (typeof src === "number") {
    return src;
  }
  if (typeof src === "object" && src !== null) {
    if ("uri" in src && typeof (src as { uri: unknown }).uri === "string") {
      return src as ImageProps["source"];
    }
    if (
      "uri" in src &&
      typeof (src as { uri: unknown }).uri === "object" &&
      (src as any).uri !== null &&
      "uri" in (src as any).uri
    ) {
      return (src as any).uri;
    }
    return src as ImageProps["source"];
  }
  if (typeof src === "string") {
    const trimmed = src.trim();
    if (!trimmed) return undefined;
    return { uri: trimmed };
  }
  return src as ImageProps["source"];
}

interface DotItemProps {
  isActive: boolean;
  onPress: () => void;
  index: number;
}

const DotItem = memo(function DotItem({ isActive, onPress, index }: DotItemProps) {
  const [widthAnim] = useState(() => new Animated.Value(isActive ? 20 : 6));

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: isActive ? 20 : 6,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isActive, widthAnim]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Go to slide ${index + 1}`}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      <Animated.View
        style={{
          width: widthAnim,
          height: 6,
          borderRadius: 999,
          backgroundColor: isActive ? "#f87000" : "#D0C9BE",
        }}
      />
    </Pressable>
  );
});

/**
 * Mobile Hero Banner Carousel (Swipe with peek, auto-play, animated dots).
 */
export function HeroBannerCarousel() {
  const router = useRouter();
  const slides = getActiveHeroSlides();
  const { width: windowWidth } = useWindowDimensions();

  // Container has px-4 (16px on each side). Content area width:
  const containerWidth = windowWidth - 32;
  // Card width matches calc(100% - 34px) in the approved preview:
  const cardWidth = Math.max(260, containerWidth - 34);
  const gap = 10;
  const snapInterval = cardWidth + gap;

  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<HeroSlide>>(null);
  const isDraggingRef = useRef(false);
  const isReduceMotionRef = useRef(false);
  const totalSlides = slides.length;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      isReduceMotionRef.current = enabled;
    });
  }, []);

  // Autoplay 5000ms
  useEffect(() => {
    if (totalSlides <= 1) return;

    const timer = setInterval(() => {
      if (isDraggingRef.current || isReduceMotionRef.current) return;
      if (AppState.currentState !== "active") return;

      setActiveIndex((prev) => {
        const next = prev >= totalSlides - 1 ? 0 : prev + 1;
        flatListRef.current?.scrollToOffset({
          offset: next * snapInterval,
          animated: !isReduceMotionRef.current,
        });
        return next;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [snapInterval, totalSlides]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const index = Math.max(
        0,
        Math.min(totalSlides - 1, Math.round(offsetX / snapInterval))
      );
      if (index !== activeIndex) {
        setActiveIndex(index);
      }
    },
    [activeIndex, snapInterval, totalSlides]
  );

  const goToSlide = useCallback(
    (index: number) => {
      flatListRef.current?.scrollToOffset({
        offset: index * snapInterval,
        animated: !isReduceMotionRef.current,
      });
      setActiveIndex(index);
    },
    [snapInterval]
  );

  if (totalSlides === 0) return null;

  return (
    <View className="w-full">
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onScrollBeginDrag={() => {
          isDraggingRef.current = true;
        }}
        onScrollEndDrag={() => {
          isDraggingRef.current = false;
        }}
        contentContainerStyle={{ paddingRight: 24 }}
        getItemLayout={(_, index) => ({
          length: snapInterval,
          offset: snapInterval * index,
          index,
        })}
        renderItem={({ item, index }) => {
          const isDiwali = item.id === "festive-diwali" && !item.mobileImage;
          return (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${item.mobilePill}: ${item.mobileHeadline}`}
              onPress={() => router.push(item.href as never)}
              style={{
                width: cardWidth,
                height: 190,
                marginRight: index === totalSlides - 1 ? 0 : gap,
                borderRadius: 20,
                overflow: "hidden",
                backgroundColor: "#0A1A3A",
              }}
            >
              {/* Image / Scene */}
              {isDiwali ? (
                <DiwaliSceneSvg style={StyleSheet.absoluteFill} />
              ) : (
                <ExpoImage
                  source={resolveHeroImageSource(item.mobileImage)}
                  contentFit="cover"
                  style={StyleSheet.absoluteFill}
                />
              )}

              {/* 3-stop overlay gradient */}
              <ExpoLinearGradient
                colors={["rgba(0,17,46,0.9)", "rgba(0,17,46,0.5)", "rgba(0,17,46,0.1)"]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />

              {/* Top-left Orange Pill */}
              <View className="self-start rounded-full bg-[#f87000] px-3 py-1 mt-4 ml-4">
                <Text className="text-[10px] font-extrabold uppercase tracking-wider text-white">
                  {item.mobilePill}
                </Text>
              </View>

              {/* Bottom-left Headline */}
              <Text className="absolute bottom-4 left-4 max-w-[68%] text-[1.3rem] font-extrabold leading-tight text-white">
                {item.mobileHeadline}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Dots Indicator */}
      <View className="flex-row items-center justify-center gap-1.5 mt-3.5 mb-2">
        {slides.map((slide, idx) => (
          <DotItem
            key={slide.id}
            index={idx}
            isActive={idx === activeIndex}
            onPress={() => goToSlide(idx)}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Desktop Hero Carousel for Tablet / Web in Expo.
 */
export function DesktopHeroCarousel() {
  const router = useRouter();
  const slides = getActiveHeroSlides();
  const totalSlides = slides.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const elapsedRef = useRef(0);
  const isHoveredRef = useRef(false);

  const currentSlide = slides[currentIndex] ?? slides[0];

  const goToSlide = useCallback(
    (index: number) => {
      if (totalSlides === 0) return;
      const nextIndex = (index + totalSlides) % totalSlides;
      elapsedRef.current = 0;
      setProgressPercent(0);
      setCurrentIndex(nextIndex);
    },
    [totalSlides]
  );

  useEffect(() => {
    if (totalSlides <= 1) return;

    const interval = setInterval(() => {
      if (AppState.currentState !== "active" || isHoveredRef.current) return;

      elapsedRef.current += 50;
      const percent = Math.min(100, (elapsedRef.current / 5500) * 100);
      setProgressPercent(percent);

      if (elapsedRef.current >= 5500) {
        goToSlide(currentIndex + 1);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [currentIndex, goToSlide, totalSlides]);

  if (totalSlides === 0) return null;

  return (
    <View className="relative w-full min-h-[550px] mt-2 mb-16">
      {/* Floating Vetted Badge */}
      <View className="absolute -top-3.5 right-[10%] z-20 flex-row items-center gap-2 rounded-full border border-[#e7e2da] bg-white px-4 py-2 shadow-sm">
        <View className="size-5 items-center justify-center rounded-full bg-[#fdf3ec]">
          <Check size={14} color="#EA580C" strokeWidth={2.8} />
        </View>
        <Text className="text-sm font-bold text-navy-900">{currentSlide.badge}</Text>
      </View>

      {/* Right Photo Stack (75% width pushed right) */}
      <View
        className="ml-auto w-3/4 rounded-[1rem] overflow-hidden bg-[#0A1A3A] shadow-inner relative"
        style={{ height: 550 }}
      >
        {slides.map((slide, idx) => {
          const isActive = idx === currentIndex;
          const isDiwali = slide.id === "festive-diwali" && !slide.desktopImage;

          return (
            <View
              key={slide.id}
              style={[
                StyleSheet.absoluteFill,
                { opacity: isActive ? 1 : 0, zIndex: isActive ? 1 : 0 },
              ]}
            >
              {isDiwali ? (
                <DiwaliSceneSvg style={StyleSheet.absoluteFill} />
              ) : (
                <ExpoImage
                  source={resolveHeroImageSource(slide.desktopImage)}
                  contentFit="cover"
                  style={StyleSheet.absoluteFill}
                />
              )}
            </View>
          );
        })}

        {/* Bottom subtle shade */}
        <ExpoLinearGradient
          colors={["transparent", "rgba(0,0,0,0.35)"]}
          start={{ x: 0, y: 0.6 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* 5. Brand Mark: Logo Plus Name */}
        <View
          style={{
            position: "absolute",
            left: 210,
            bottom: 24,
            zIndex: 30,
            flexDirection: "row",
            alignItems: "center",
          }}
          pointerEvents="none"
        >
          <Logo dark />
        </View>

        {/* Controls: Arrows + Thumbnails */}
        <View className="absolute right-6 bottom-6 z-30 flex-row items-center gap-2">
          {/* Previous Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous slide"
            onPress={() => goToSlide(currentIndex - 1)}
            className="size-8 rounded-full border border-[#E5E0D8] bg-white items-center justify-center shadow-sm"
          >
            <ChevronLeft size={16} color="#00112E" strokeWidth={2.4} />
          </Pressable>

          {/* Thumbnail Tiles */}
          {slides.map((slide, idx) => {
            const isActive = idx === currentIndex;
            return (
              <Pressable
                key={slide.id}
                accessibilityRole="button"
                accessibilityLabel={slide.badge}
                onPress={() => goToSlide(idx)}
                style={{
                  width: 58,
                  height: 44,
                  borderRadius: 10,
                  backgroundColor: "#ffffff",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? "#EA580C" : "#E5E0D8",
                }}
              >
                {slide.thumbIcon === "gift" && (
                  <Gift size={20} color={isActive ? "#EA580C" : "#667085"} strokeWidth={2} />
                )}
                {slide.thumbIcon === "sparkles" && (
                  <Sparkles size={20} color={isActive ? "#EA580C" : "#667085"} strokeWidth={2} />
                )}
                {slide.thumbIcon === "snowflake" && (
                  <Snowflake size={20} color={isActive ? "#EA580C" : "#667085"} strokeWidth={2} />
                )}
                {slide.thumbIcon === "wrench" && (
                  <Wrench size={20} color={isActive ? "#EA580C" : "#667085"} strokeWidth={2} />
                )}
              </Pressable>
            );
          })}

          {/* Next Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next slide"
            onPress={() => goToSlide(currentIndex + 1)}
            className="size-8 rounded-full border border-[#E5E0D8] bg-white items-center justify-center shadow-sm"
          >
            <ChevronRight size={16} color="#00112E" strokeWidth={2.4} />
          </Pressable>
        </View>

        {/* 3px Progress Bar */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 3,
            backgroundColor: "rgba(0,17,46,0.3)",
            zIndex: 20,
          }}
        >
          <View
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              backgroundColor: "#EA580C",
            }}
          />
        </View>
      </View>

      {/* Left Dark Overlapping Card - Positioned exactly to red rectangle bounds */}
      <View
        className="absolute left-0 z-10 w-[480px] rounded-2xl bg-navy-900 p-8 md:p-9 shadow-2xl justify-start"
        style={{ top: 125, bottom: 30 }}
      >
        <Text className="text-[2.75rem] font-extrabold leading-[1.1] text-white tracking-tight">
          Your Home ,{"\n"}
          <Text className="text-[#F97316] font-extrabold">{currentSlide.word}</Text>
          {"\n"}Handled.
        </Text>
        <Text className="mt-5 text-[1.05rem] leading-relaxed text-white/90 font-normal">
          {currentSlide.description}
        </Text>
        <View className="mt-6">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(currentSlide.href as never)}
            className="self-start flex-row items-center gap-2 rounded-full bg-[#F97316] px-8 py-3.5 shadow-sm active:scale-95"
          >
            <Text className="text-[0.95rem] font-bold text-white">Explore Services</Text>
            <ArrowRight size={16} color="#ffffff" strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
