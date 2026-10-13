// Ported from CustomerReviewsMarquee in
// frontend/apps/customer/features/catalog/components/homepage-client-sections.tsx
import { Text } from "@vsolve/mobile-ui";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import Svg, { Path } from "react-native-svg";

const REVIEWS = [
  {
    user: "Sarah K.",
    initials: "SK",
    avatarBg: "bg-[#e0f2fe]",
    avatarInk: "text-[#0369a1]",
    rating: 5,
    date: "Yesterday",
    text: "The technician resolved our switchboard sparking issue in under 30 minutes. High quality and quick response!",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
  {
    user: "David M.",
    initials: "DM",
    avatarBg: "bg-[#fef3c7]",
    avatarInk: "text-[#b45309]",
    rating: 5,
    date: "3 days ago",
    text: "Excellent carpentry work. Placed wood fillers and aligned the drawer slides perfectly.",
    verified: true,
    trade: "Carpenter",
    accent: "border-t-[#D97706]",
  },
  {
    user: "Elena R.",
    initials: "ER",
    avatarBg: "bg-[#d1fae5]",
    avatarInk: "text-[#047857]",
    rating: 5,
    date: "1 week ago",
    text: "Professional plumber fixed our tap leakage instantly and did pressure checks. Highly recommend!",
    verified: true,
    trade: "Plumber",
    accent: "border-t-[#0284C7]",
  },
  {
    user: "Priya N.",
    initials: "PN",
    avatarBg: "bg-[#fce7f3]",
    avatarInk: "text-[#be185d]",
    rating: 5,
    date: "2 days ago",
    text: "Fan installation was neat and tidy. The pro tested every speed setting before leaving.",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
  {
    user: "James T.",
    initials: "JT",
    avatarBg: "bg-[#dbeafe]",
    avatarInk: "text-[#1d4ed8]",
    rating: 5,
    date: "4 days ago",
    text: "Kitchen drain unblocked in one visit. Transparent pricing and no mess left behind.",
    verified: true,
    trade: "Plumber",
    accent: "border-t-[#0284C7]",
  },
  {
    user: "Anita S.",
    initials: "AS",
    avatarBg: "bg-[#ffedd5]",
    avatarInk: "text-[#c2410c]",
    rating: 5,
    date: "5 days ago",
    text: "Door hinge alignment was flawless. Opens smoothly now without scraping the frame.",
    verified: true,
    trade: "Carpenter",
    accent: "border-t-[#D97706]",
  },
  {
    user: "Michael B.",
    initials: "MB",
    avatarBg: "bg-[#ede9fe]",
    avatarInk: "text-[#6d28d9]",
    rating: 5,
    date: "1 week ago",
    text: "LED panel install looked factory-finished. Wiring was concealed and the room feels brighter.",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
  {
    user: "Rhea P.",
    initials: "RP",
    avatarBg: "bg-[#ccfbf1]",
    avatarInk: "text-[#0f766e]",
    rating: 5,
    date: "1 week ago",
    text: "Shower mixer repair stopped the constant drip. Polite, punctual, and very thorough.",
    verified: true,
    trade: "Plumber",
    accent: "border-t-[#0284C7]",
  },
  {
    user: "Karan V.",
    initials: "KV",
    avatarBg: "bg-[#fef9c3]",
    avatarInk: "text-[#a16207]",
    rating: 5,
    date: "2 weeks ago",
    text: "Wall shelf installation was perfectly level. Drilled cleanly with zero wall damage.",
    verified: true,
    trade: "Carpenter",
    accent: "border-t-[#D97706]",
  },
  {
    user: "Lisa W.",
    initials: "LW",
    avatarBg: "bg-[#e0e7ff]",
    avatarInk: "text-[#4338ca]",
    rating: 5,
    date: "2 weeks ago",
    text: "DB board repair fixed recurring tripping. Explained the fault clearly before starting work.",
    verified: true,
    trade: "Electrician",
    accent: "border-t-[#EA580C]",
  },
] as const;

const CARD_WIDTH = 300;
const CARD_GAP = 20; // mr-5 = 1.25rem = 20px
const CARD_SLOT_WIDTH = CARD_WIDTH + CARD_GAP; // 320px
const SINGLE_SET_WIDTH = REVIEWS.length * CARD_SLOT_WIDTH; // 3200px
const TOTAL_TRACK_WIDTH = SINGLE_SET_WIDTH * 2; // 6400px
const MARQUEE_DURATION_MS = 55000; // 55 seconds (matching web portal 55s)

function Star() {
  return (
    <Svg viewBox="0 0 20 20" width={16} height={16}>
      <Path
        fill="#fbbf24"
        d="M10.868 2.784c-.226-.83-1.41-.83-1.636 0L7.87 6.425a1 1 0 01-.95.69h-3.83c-.88 0-1.245 1.137-.534 1.657l3.1 2.253a1 1 0 01.363 1.118l-1.18 3.65c-.263.815.674 1.497 1.39 1.012l3.1-2.203a1 1 0 011.173 0l3.1 2.203c.717.485 1.653-.197 1.39-1.012l-1.18-3.65a1 1 0 01.363-1.118l3.1-2.253c.71-.52.346-1.657-.534-1.657h-3.83a1 1 0 01-.95-.69l-1.36-3.64z"
      />
    </Svg>
  );
}

function ReviewCard({ review }: { review: (typeof REVIEWS)[number] }) {
  return (
    <View
      style={{ width: CARD_WIDTH, flexShrink: 0 }}
      className={`relative mr-5 w-[300px] shrink-0 justify-between gap-5 rounded-2xl border border-[#e7e2da] border-t-4 bg-white p-6 shadow-sm ${review.accent}`}
    >
      <Text
        aria-hidden
        style={{ color: "rgba(231,226,218,0.25)" }}
        className="pointer-events-none absolute right-4 top-1 select-none font-serif text-6xl"
      >
        ”
      </Text>

      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className={`h-9 w-9 shrink-0 items-center justify-center rounded-full ${review.avatarBg}`}>
            <Text className={`text-xs font-black ${review.avatarInk}`}>{review.initials}</Text>
          </View>
          <View className="flex-col">
            <Text className="text-sm font-extrabold leading-tight text-navy-900">{review.user}</Text>
            <Text className="mt-0.5 text-[10px] leading-none text-text-secondary">{review.date}</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-0.5">
          {Array.from({ length: review.rating }).map((_, index) => (
            <Star key={index} />
          ))}
        </View>

        <Text className="text-xs font-medium italic leading-relaxed text-text-secondary">
          {`“${review.text}”`}
        </Text>
      </View>

      <View className="flex-row items-center gap-2">
        {review.verified ? (
          <View className="flex-row items-center gap-1.5 rounded-full border border-[#137333]/10 bg-[#E6F4EA] px-2.5 py-1">
            <View className="h-1.5 w-1.5 rounded-full bg-[#137333]" />
            <Text className="text-[9px] font-black tracking-wide text-[#137333]">Verified Job</Text>
          </View>
        ) : null}
        <View className="rounded-md border border-[#e7e2da] bg-[#FAF9F7] px-2 py-1">
          <Text className="text-[9px] font-bold text-text-secondary">{review.trade}</Text>
        </View>
      </View>
    </View>
  );
}

export function ReviewsMarquee() {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let isCancelled = false;

    const runMarquee = () => {
      shift.setValue(0);
      Animated.timing(shift, {
        toValue: -SINGLE_SET_WIDTH,
        duration: MARQUEE_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
      }).start(({ finished }) => {
        if (finished && !isCancelled) {
          runMarquee();
        }
      });
    };

    runMarquee();

    return () => {
      isCancelled = true;
      shift.stopAnimation();
    };
  }, [shift]);

  const cards = [...REVIEWS, ...REVIEWS];

  return (
    <View className="relative w-full overflow-hidden pt-8 pb-10">
      <View className="items-center gap-3 px-4 text-center">
        <View className="rounded-full border border-[#e7e2da] bg-white px-3 py-1">
          <Text className="text-[10px] font-black uppercase tracking-[0.2em] text-action">
            Trusted by homeowners
          </Text>
        </View>
        <Text className="text-center text-2xl font-extrabold tracking-tight text-navy-900 md:text-4xl">
          What Customers Say
        </Text>
        <Text className="max-w-xl text-center text-sm text-text-secondary md:text-base">
          Real feedback from verified domestic jobs across electrician, plumbing, and carpentry work.
        </Text>
      </View>

      <View className="relative mt-8 w-full overflow-hidden">
        <Animated.View
          style={{
            flexDirection: "row",
            width: TOTAL_TRACK_WIDTH,
            paddingLeft: 16,
            transform: [{ translateX: shift }],
          }}
        >
          {cards.map((review, index) => (
            <ReviewCard key={`${review.user}-${review.date}-${index}`} review={review} />
          ))}
        </Animated.View>

        <LinearGradient
          pointerEvents="none"
          colors={["#FAF9F7", "rgba(250,249,247,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: 48, zIndex: 10 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={["rgba(250,249,247,0)", "#FAF9F7"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 48, zIndex: 10 }}
        />
      </View>
    </View>
  );
}
