// Ported from frontend/apps/customer/features/catalog/components/homepage-client-sections.tsx
import { useQueryClient } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { Dialog, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError, STATIC_CONTENT, fetchCachedQuery, queryKeys, SESSION_STATE } from "@vsolve/query/native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { AccessibilityInfo, Animated, AppState, FlatList, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";

import { cartMergeConflict, duplicateCartItemConflict } from "@/features/checkout/conflicts";
import {
  useAddCartItem,
  useCart,
  useRemoveCartItem,
  useUpdateCartItem,
  type Cart,
} from "@/features/checkout/queries";
import { ReviewsMarquee } from "@/features/catalog/view/reviews-marquee";
import { useIsDesktop } from "@/lib/responsive";

type HomepageServiceItem = {
  name: string;
  price: number;
  slug: string;
  categorySlug: string;
  desc: string;
};

type CartItem = Cart["items"][number];

const SERVICE_GUIDES = {
  electrician: {
    title: "Electrical Works & Safety Guide",
    category: "Electrician Services",
    included: [
      "Wiring insulation inspection",
      "Short-circuit diagnostics and fix",
      "Switchboard / socket replacement",
      "Heavy appliance load calculation",
    ],
    duration: "30 - 90 minutes",
    pricing: "Starts from a base inspection fee, credited towards any repairs you authorize.",
    expectations: "Main power breaker (MDB) must be switched off during the installation phase.",
  },
  plumbing: {
    title: "Plumbing Installation & Repair Guide",
    category: "Plumber Services",
    included: [
      "Leakage trace using specialized pressure meters",
      "Gasket and mixer tap replacement",
      "Drain block removal and pipe alignment",
      "Sanitary fixture fitting",
    ],
    duration: "30 - 120 minutes",
    pricing: "Task-based rates with detailed invoices; spare pipes or taps billed separately.",
    expectations: "Please specify where the main inlet valve is located to cut off water flow.",
  },
  carpentry: {
    title: "Furniture Repair & Assembly Guide",
    category: "Carpenter Services",
    included: [
      "Door lock and latch alignment",
      "Hinge replacement and drawer slide adjustment",
      "Custom wall shelves and fittings mounting",
      "Flatpack furniture assembly",
    ],
    duration: "45 - 180 minutes",
    pricing: "Based on task complexity and fittings supplied; custom wood repairs quoted on-site.",
    expectations: "Clear a flat working space if we are assembling complex cabinet sets.",
  },
} as const;

const BEST_SELLERS: HomepageServiceItem[] = [
  { name: "Fan Installation", price: 249, slug: "fan-installation", categorySlug: "electrician", desc: "Assembly, mounting and wiring of a new ceiling or wall fan." },
  { name: "Cupboard Hinge Repair", price: 299, slug: "cupboard-hinge-repair", categorySlug: "technician", desc: "Meticulous cabinet hinge replacement and slide channel alignment." },
  { name: "Plug Point Fixing", price: 99, slug: "electrician-plug-point-fixing", categorySlug: "electrician", desc: "Secure loose sockets and restore safe power to your plug points." },
  { name: "Tap Replacement", price: 199, slug: "plumber-tap-replacement", categorySlug: "plumber", desc: "Swap worn taps with a new fixture and leak-free connections." },
];

const ELECTRICIAN_SERVICES: HomepageServiceItem[] = [
  BEST_SELLERS[0],
  { name: "Exhaust Fan Installation", price: 149, slug: "electrician-exhaust-fan-installation", categorySlug: "electrician", desc: "Kitchen and bathroom exhaust fan mounting with proper ducting." },
  { name: "Door Bell Installation", price: 99, slug: "electrician-door-bell-installation", categorySlug: "electrician", desc: "Wireless or wired doorbell setup with chime alignment and testing." },
  { name: "DB Board Repair", price: 299, slug: "electrician-db-board-repair", categorySlug: "electrician", desc: "Distribution board fault tracing, breaker checks, and safe repairs." },
];

const PLUMBING_SERVICES: HomepageServiceItem[] = [
  BEST_SELLERS[3],
  { name: "Shower Repair", price: 149, slug: "plumber-shower-repair", categorySlug: "plumber", desc: "Fix dripping showers, weak flow, and mixer cartridge issues." },
  { name: "Pipe Leakage Fix", price: 149, slug: "plumber-pipe-leakage-fix", categorySlug: "plumber", desc: "Trace and seal leaking pipe joints under sinks, walls, or ceilings." },
  { name: "Pipe Joint Repair", price: 149, slug: "plumber-pipe-joint-repair", categorySlug: "plumber", desc: "Reseal leaking joints under sinks, washbasins, and exposed piping." },
];

const CARPENTRY_SERVICES: HomepageServiceItem[] = [
  BEST_SELLERS[1],
  { name: "Door Repair", price: 199, slug: "carpenter-door-repair", categorySlug: "technician", desc: "Fix sticking doors, misaligned frames, and damaged hinges or latches." },
  { name: "Lock Fitting", price: 149, slug: "carpenter-lock-fitting", categorySlug: "technician", desc: "Install or replace door locks, latches, and security hardware." },
  { name: "Shelf Installation", price: 199, slug: "carpenter-shelf-installation", categorySlug: "technician", desc: "Wall-mounted shelf fitting with level alignment and secure anchoring." },
];

const ELECTRICIAN_IMG = require("../../../../assets/catalog/featured/electrician.jpg");
const PLUMBER_IMG = require("../../../../assets/catalog/featured/plumber.jpg");
const CARPENTER_IMG = require("../../../../assets/catalog/featured/carpenter.jpg");

const FEATURED_SERVICES = [
  {
    id: "electrician",
    chipLabel: "⚡ Electrical",
    categoryTag: "Electrician",
    title: "Electrical Safety & Repairs",
    subtitle: "Modular switchboard fixing, wiring short-circuit fault diagnosis, and safety load checks.",
    highlights: [
      "Modular switchboard diagnostic & spark repair",
      "Complete home wiring audit & load calculation",
    ],
    price: "₹129",
    rating: "4.8",
    bookings: "12k bookings",
    buttonText: "Book Electrician",
    link: "/catalog/electrician",
    image: ELECTRICIAN_IMG,
  },
  {
    id: "plumber",
    chipLabel: "💧 Plumbing",
    categoryTag: "Plumber",
    title: "Plumbing Upgrades & Leaks",
    subtitle: "Drip-free tap installations, drain unclogging, and pipe pressure tests.",
    highlights: [
      "Precision leak tracing with pressure meters",
      "Premium bathroom mixer & tap replacements",
    ],
    price: "₹199",
    rating: "4.9",
    bookings: "18k bookings",
    buttonText: "Book Plumber",
    link: "/catalog/plumber",
    image: PLUMBER_IMG,
  },
  {
    id: "carpenter",
    chipLabel: "🪚 Carpentry",
    categoryTag: "Carpenter",
    title: "Carpentry & Door Fittings",
    subtitle: "Cabinet hinge alignment, lock repairs, and custom wall shelf mounting.",
    highlights: [
      "Squeak-free hinge & drawer slide alignment",
      "Laser-level shelf and decor wall mounting",
    ],
    price: "₹299",
    rating: "4.7",
    bookings: "9k bookings",
    buttonText: "Book Carpenter",
    link: "/catalog/technician",
    image: CARPENTER_IMG,
  },
];

const GUIDES = [
  { label: "Electrician Guide", key: "electrician", icon: "⚡", iconBg: "bg-[#FFF0E5]" },
  { label: "Plumbing Guide", key: "plumbing", icon: "💧", iconBg: "bg-[#E0F2FE]" },
  { label: "Carpenter Guide", key: "carpentry", icon: "🪚", iconBg: "bg-[#F3F4F6]" },
] as const;

export function HomepageClientSections() {
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const router = useRouter();
  const [activeGuideKey, setActiveGuideKey] = useState<keyof typeof SERVICE_GUIDES | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);
  const [addErrorSlug, setAddErrorSlug] = useState<string | null>(null);
  const [variantPicker, setVariantPicker] = useState<{
    serviceName: string;
    variants: { id: string; name: string; pricePaise: number }[];
  } | null>(null);

  const cartMerge = cartQuery.isError ? cartMergeConflict(cartQuery.error) : null;
  const activeGuide = activeGuideKey ? SERVICE_GUIDES[activeGuideKey] : null;

  const loadCart = async (): Promise<Cart> => {
    if (cartQuery.data) return cartQuery.data;
    try {
      return await fetchCachedQuery(queryClient, {
        queryKey: queryKeys.booking.cart(),
        queryFn: () => request(() => getApiClient().GET("/api/v1/cart/")),
        ...SESSION_STATE,
      });
    } catch (error) {
      if (cartMergeConflict(error)) router.push("/cart");
      throw error;
    }
  };

  const runAddToCart = (variantId: string, slug: string, onDone?: () => void) => {
    void (async () => {
      setAddErrorSlug(null);
      try {
        const cart = await loadCart();
        addItem.mutate(
          { expectedCartVersion: cart.version, variantId, quantity: 1 },
          {
            onSuccess: () => {
              setAddErrorSlug(null);
              onDone?.();
            },
            onError: (error) => {
              if (duplicateCartItemConflict(error)) {
                void cartQuery.refetch();
                setAddErrorSlug(null);
                onDone?.();
                return;
              }
              setAddErrorSlug(slug);
            },
            onSettled: () => setAddingSlug(null),
          },
        );
      } catch (error) {
        setAddErrorSlug(slug);
        setAddingSlug(null);
        if (!cartMergeConflict(error)) console.error("Add to cart failed:", error);
      }
    })();
  };

  const handleQuickAdd = (slug: string) => {
    if (addingSlug) return;
    setAddingSlug(slug);
    setAddErrorSlug(null);
    void (async () => {
      try {
        const service = await queryClient.fetchQuery({
          queryKey: queryKeys.catalog.service(slug),
          queryFn: () =>
            request(() =>
              getApiClient().GET("/api/v1/services/{service_slug}/", {
                params: { path: { service_slug: slug } },
              }),
            ),
          ...STATIC_CONTENT,
          staleTime: 300_000,
        });
        const variantId = service.bookable_variant_id ?? (service.variants.length === 1 ? service.variants[0]?.id : null);
        if (!variantId) {
          setVariantPicker({
            serviceName: service.name,
            variants: service.variants.map((variant) => ({
              id: variant.id,
              name: variant.name,
              pricePaise: variant.starting_price.amount_paise,
            })),
          });
          setAddingSlug(null);
          return;
        }
        runAddToCart(variantId, slug);
      } catch (error) {
        console.error("Quick add failed:", error);
        setAddErrorSlug(slug);
        setAddingSlug(null);
      }
    })();
  };

  const renderItemAction = (slug: string) => {
    const cartItem = cartQuery.data?.items.find((item) => item.service_slug === slug);
    if (cartItem) {
      return (
        <QuantityControl
          quantity={cartItem.quantity}
          disabled={updateItem.isPending || removeItem.isPending}
          onDecrement={() => changeQuantity(cartItem, -1)}
          onIncrement={() => changeQuantity(cartItem, 1)}
        />
      );
    }
    return (
      <View className="items-end gap-1">
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          disabled={addingSlug === slug || Boolean(cartMerge)}
          onPress={() => handleQuickAdd(slug)}
          className="h-8 items-center justify-center rounded-full bg-action px-5 disabled:opacity-50"
        >
          <Text className="text-xs font-bold text-white">{addingSlug === slug ? "Adding..." : "Add +"}</Text>
        </Pressable>
        {addErrorSlug === slug ? (
          <Text className="max-w-[180px] text-right text-[10px] font-semibold leading-tight text-[#C2410C]">
            {cartQuery.error
              ? describeError(cartQuery.error, "read").message
              : addItem.error
                ? describeError(addItem.error, "mutation").message
                : "Could not add to cart. Try again."}
          </Text>
        ) : null}
      </View>
    );
  };

  const changeQuantity = (item: CartItem, delta: number) => {
    const cart = cartQuery.data;
    if (!cart || updateItem.isPending || (delta < 0 && removeItem.isPending)) return;
    if (delta < 0 && item.quantity <= 1) {
      removeItem.mutate({ expectedCartVersion: cart.version, expectedItemVersion: item.version, itemId: item.id });
      return;
    }
    updateItem.mutate({
      expectedCartVersion: cart.version,
      expectedItemVersion: item.version,
      itemId: item.id,
      quantity: item.quantity + delta,
    });
  };

  return (
    <View className="gap-12">
      {cartMerge ? (
        <View className="rounded-2xl border border-[#EA580C]/30 bg-[#FFF0E5] px-4 py-3">
          <Text className="text-sm text-navy-900">Your basket needs a quick merge after sign-in before you can add services. </Text>
          <Pressable accessibilityRole="link" onPress={() => router.push("/cart")}>
            <Text className="text-sm font-bold text-action underline">Review cart</Text>
          </Pressable>
        </View>
      ) : null}

      <ServiceRail
        title="Best Sellers"
        subtitle="Popular quick fixes with a fixed starting price"
        items={BEST_SELLERS}
        renderAction={renderItemAction}
        isDesktop={isDesktop}
      />
      <HeroSplitCarousel isDesktop={isDesktop} />
      <ServiceRail
        title="Electrician Services"
        subtitle="Certified electrical installations and diagnostics"
        seeAll="/catalog/electrician"
        items={ELECTRICIAN_SERVICES}
        renderAction={renderItemAction}
        isDesktop={isDesktop}
      />
      <View className="gap-5">
        <Text className="text-2xl font-extrabold tracking-tight text-navy-900">Service & Booking Guides</Text>
        <Text className="text-sm text-text-secondary">Read what is included & how to prepare</Text>
        {isDesktop ? (
          <View className="flex-row gap-6">
            {GUIDES.map((guide) => (
              <Pressable
                key={guide.key}
                accessibilityRole="button"
                onPress={() => setActiveGuideKey(guide.key)}
                className="flex-1 flex-row items-center justify-between rounded-2xl border border-[#e7e2da] bg-white p-5 shadow-2xs hover:border-[#EA580C] hover:shadow-sm"
              >
                <View className="flex-row items-center gap-4">
                  <View className={`size-10 items-center justify-center rounded-full ${guide.iconBg}`}>
                    <Text className="text-lg">{guide.icon}</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-navy-900">{guide.label}</Text>
                    <Text className="mt-0.5 text-[10px] font-semibold text-text-secondary">Check inclusions & prep</Text>
                  </View>
                </View>
                <Chevron color="#EA580C" />
              </Pressable>
            ))}
          </View>
        ) : (
          <View className="gap-3.5">
            {GUIDES.map((guide) => (
              <Pressable
                key={guide.key}
                accessibilityRole="button"
                onPress={() => setActiveGuideKey(guide.key)}
                className="flex-row items-center justify-between rounded-2xl border border-[#e7e2da] bg-white p-5"
              >
                <View className="flex-row items-center gap-4">
                  <View className={`size-10 items-center justify-center rounded-full ${guide.iconBg}`}>
                    <Text className="text-lg">{guide.icon}</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-extrabold text-navy-900">{guide.label}</Text>
                    <Text className="mt-0.5 text-[10px] font-semibold text-text-secondary">Check inclusions & prep</Text>
                  </View>
                </View>
                <Chevron />
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <ServiceRail
        title="Plumbing Services"
        subtitle="Taps, leakages, and sanitary fixes"
        seeAll="/catalog/plumber"
        items={PLUMBING_SERVICES}
        renderAction={renderItemAction}
        isDesktop={isDesktop}
      />
      <ServiceRail
        title="Carpenter Services"
        subtitle="Furniture repair, mounts, and fittings"
        seeAll="/catalog/technician"
        items={CARPENTRY_SERVICES}
        renderAction={renderItemAction}
        isDesktop={isDesktop}
      />
      <ReviewsMarquee />

      <Dialog
        open={activeGuideKey !== null}
        onOpenChange={(open) => {
          if (!open) setActiveGuideKey(null);
        }}
        title={activeGuide?.title ?? "Service Guide"}
        description={activeGuide?.category ?? "Overview & preparation Checklist"}
      >
        {activeGuide ? (
          <View className="gap-5 py-2">
            <View className="gap-2">
              <Text className="text-xs font-bold uppercase tracking-wider text-navy-900">What is included:</Text>
              {activeGuide.included.map((item) => (
                <Text key={item} className="text-xs leading-relaxed text-text-secondary">{`✓  ${item}`}</Text>
              ))}
            </View>
            <View className="flex-row items-center justify-between border-t border-line/60 pt-3">
              <Text className="text-xs font-extrabold text-navy-900">Estimated Duration:</Text>
              <Text className="rounded-md border border-[#e7e2da] bg-[#FAF9F7] px-2.5 py-1 text-xs font-medium text-text-secondary">{activeGuide.duration}</Text>
            </View>
            <View className="gap-1 border-t border-line/60 pt-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-navy-900">Pricing Policy:</Text>
              <Text className="text-xs leading-relaxed text-text-secondary">{activeGuide.pricing}</Text>
            </View>
            <View className="gap-1 border-t border-line/60 pt-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-navy-900">How to Prepare:</Text>
              <Text className="text-xs leading-relaxed text-text-secondary">{activeGuide.expectations}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setActiveGuideKey(null);
                router.push("/catalog/technician");
              }}
              className="mt-3 items-center rounded-xl bg-[#EA580C] py-3"
            >
              <Text className="text-sm font-bold text-white">Explore and Book Services</Text>
            </Pressable>
          </View>
        ) : null}
      </Dialog>

      <Dialog
        open={variantPicker !== null}
        onOpenChange={(open) => {
          if (!open) setVariantPicker(null);
        }}
        title={variantPicker?.serviceName ?? "Choose an option"}
        description="Pick the option that matches your job before adding to cart."
      >
        {variantPicker ? (
          <View className="gap-3 py-2">
            {variantPicker.variants.map((variant) => (
              <View key={variant.id} className="flex-row items-center justify-between gap-4 rounded-xl border border-[#e7e2da] bg-white p-4">
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-bold text-navy-900">{variant.name}</Text>
                  <Text className="mt-1 text-sm font-black text-navy-900">{formatMoney(variant.pricePaise)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  disabled={addItem.isPending || Boolean(cartMerge)}
                  onPress={() => runAddToCart(variant.id, "variant-picker", () => setVariantPicker(null))}
                  className="h-8 items-center justify-center rounded-full bg-action px-5 disabled:opacity-50"
                >
                  <Text className="text-xs font-bold text-white">Add +</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </Dialog>
    </View>
  );
}

function ServiceRail({
  title,
  subtitle,
  seeAll,
  items,
  renderAction,
  isDesktop = false,
}: {
  title: string;
  subtitle: string;
  seeAll?: string;
  items: HomepageServiceItem[];
  renderAction: (slug: string) => ReactNode;
  isDesktop?: boolean;
}) {
  const router = useRouter();
  return (
    <View className="gap-5">
      <View className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="text-2xl font-extrabold tracking-tight text-navy-900">{title}</Text>
          <Text className="mt-1 text-sm font-medium text-text-secondary">{subtitle}</Text>
        </View>
        {seeAll ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(seeAll as never)} className="flex-row items-center gap-1">
            <Text className="text-xs font-bold text-[#EA580C]">See all</Text>
            <Chevron color="#EA580C" />
          </Pressable>
        ) : null}
      </View>
      {isDesktop ? (
        <View className="flex-row gap-6">
          {items.map((item) => (
            <View key={item.slug} className="flex-1 justify-between gap-4 rounded-2xl border border-[#e7e2da] bg-white p-5 shadow-2xs">
              <Pressable accessibilityRole="link" onPress={() => router.push(`/catalog/${item.categorySlug}/${item.slug}` as never)} className="gap-1.5">
                <Text className="text-base font-extrabold text-navy-900">{item.name}</Text>
                <Text numberOfLines={2} className="text-xs leading-relaxed text-text-secondary">{item.desc}</Text>
              </Pressable>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-sm font-black text-navy-900">{`₹${item.price}`}</Text>
                {renderAction(item.slug)}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-5 pb-4">
          {items.map((item) => (
            <ServiceCard key={item.slug} item={item} action={renderAction(item.slug)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function ServiceCard({ item, action }: { item: HomepageServiceItem; action: ReactNode }) {
  const router = useRouter();
  return (
    <View className="w-[280px] justify-between gap-4 rounded-2xl border border-[#e7e2da] bg-white p-4">
      <Pressable accessibilityRole="link" onPress={() => router.push(`/catalog/${item.categorySlug}/${item.slug}` as never)} className="gap-1.5">
        <Text className="text-base font-extrabold text-navy-900">{item.name}</Text>
        <Text numberOfLines={2} className="text-xs leading-relaxed text-text-secondary">{item.desc}</Text>
      </Pressable>
      <View className="mt-1 flex-row items-center justify-between">
        <Text className="text-sm font-black text-navy-900">{`₹${item.price}`}</Text>
        {action}
      </View>
    </View>
  );
}

function HeroSplitCarousel({
  isDesktop = false,
}: {
  isDesktop?: boolean;
}) {
  const router = useRouter();
  const N = FEATURED_SERVICES.length;
  const half = Math.floor(N / 2);

  // Desktop State
  const [activeIdx, setActiveIdx] = useState(0);

  // Mobile State
  const { width: windowWidth } = useWindowDimensions();
  // With px-4 (16px left/right = 32px), container width is windowWidth - 32.
  // Card width is container width - 34px. Peek is 24px, gap is 10px.
  const cardWidth = Math.max(260, windowWidth - 32 - 34);
  const step = cardWidth + 10;
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(0);
  const autoplayTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDragging = useRef(false);
  const isReduceMotion = useRef(false);

  const startAutoplay = useCallback(() => {
    if (autoplayTimer.current) clearInterval(autoplayTimer.current);
    if (isReduceMotion.current) return;
    autoplayTimer.current = setInterval(() => {
      if (isDragging.current) return;
      const nextIndex = (currentIndexRef.current + 1) % N;
      currentIndexRef.current = nextIndex;
      flatListRef.current?.scrollToOffset({
        offset: nextIndex * step,
        animated: true,
      });
    }, 3500);
  }, [N, step]);

  const stopAutoplay = useCallback(() => {
    if (autoplayTimer.current) {
      clearInterval(autoplayTimer.current);
      autoplayTimer.current = null;
    }
  }, []);

  // Respect reduced motion settings
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      isReduceMotion.current = enabled;
      if (!enabled && !isDesktop) startAutoplay();
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      isReduceMotion.current = enabled;
      if (enabled) stopAutoplay();
      else if (!isDesktop) startAutoplay();
    });
    return () => sub?.remove();
  }, [isDesktop, startAutoplay, stopAutoplay]);

  // Pause on app background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (!isDesktop) startAutoplay();
      } else {
        stopAutoplay();
      }
    });
    return () => sub.remove();
  }, [isDesktop, startAutoplay, stopAutoplay]);

  // Desktop Autoplay (every 3.5s)
  useEffect(() => {
    if (!isDesktop || isReduceMotion.current) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % N);
    }, 3500);
    return () => clearInterval(timer);
  }, [isDesktop, N]);

  // Desktop Layout
  if (isDesktop) {
    return (
      <View className="w-full">
        {/* Relative Viewport */}
        <View className="relative h-[460px] w-full overflow-hidden rounded-[32px]">
          {FEATURED_SERVICES.map((service, i) => {
            const p = ((i - activeIdx + N + half) % N) - half;
            const pc = Math.max(-1, Math.min(2, p));
            const isCurrent = pc === 0;
            const isPeeking = pc === 1;

            if (pc < 0 || pc > 1) return null;

            return (
              <Pressable
                key={service.id}
                accessibilityRole="button"
                onPress={() => {
                  if (isPeeking) {
                    setActiveIdx((activeIdx + 1) % N);
                  } else if (isCurrent) {
                    router.push(service.link as never);
                  }
                }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "100%",
                  height: "100%",
                  transform: [
                    { translateX: pc * 56 },
                    { scale: isCurrent ? 1 : 0.965 },
                  ],
                  opacity: isCurrent ? 1 : 0.5,
                  zIndex: isCurrent ? 2 : 1,
                }}
                className="overflow-hidden rounded-3xl border border-[#E7E2DA] bg-white p-6 md:p-8 shadow-sm flex-row items-center gap-8"
              >
                {/* Left Content (55%) */}
                <View className="flex-1 justify-between gap-3.5">
                  <View className="gap-2">
                    <View className="flex-row items-center gap-2">
                      <View className="rounded-full border border-[#EA580C]/20 bg-[#FFF0E5] px-2.5 py-0.5">
                        <Text className="text-[11px] font-black uppercase tracking-wider text-[#EA580C]">Featured Service</Text>
                      </View>
                    </View>

                    <Text className="text-3xl font-black text-navy-900 leading-tight">
                      {service.title}
                    </Text>

                    <Text className="text-sm font-medium leading-relaxed text-text-secondary">
                      {service.subtitle}
                    </Text>
                  </View>

                  {/* 2 Checkmark Highlights */}
                  <View className="gap-2 border-y border-[#F1EFEA] py-2">
                    {service.highlights.map((hl: string, hlIdx: number) => (
                      <View key={hlIdx} className="flex-row items-center gap-2">
                        <View className="size-4.5 items-center justify-center rounded-full bg-[#E6F4EA]">
                          <Text className="text-[10px] font-bold text-[#137333]">✓</Text>
                        </View>
                        <Text className="text-xs font-medium text-navy-900">{hl}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Price & Rating Row */}
                  <View className="flex-row items-center justify-between pt-1">
                    <View>
                      <Text className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">Starting from</Text>
                      <Text className="text-2xl font-black text-navy-900">{service.price}</Text>
                    </View>

                    <View className="flex-row items-center gap-1.5 rounded-xl border border-[#E7E2DA] bg-[#FAF9F7] px-3 py-1.5">
                      <Text className="text-sm font-black text-amber-500">★</Text>
                      <Text className="text-xs font-extrabold text-navy-900">{service.rating}</Text>
                      <Text className="text-[11px] text-text-secondary">· {service.bookings}</Text>
                    </View>
                  </View>

                  {/* Primary CTA Button */}
                  <View className="items-start">
                    <View className="flex-row items-center gap-2 rounded-xl bg-[#EA580C] px-6 py-3">
                      <Text className="text-sm font-bold text-white">{service.buttonText}</Text>
                      <Text className="text-base text-white font-bold leading-none">→</Text>
                    </View>
                  </View>
                </View>

                {/* Right Inset Image (45%) */}
                <View className="w-[45%] h-[310px] rounded-2xl overflow-hidden border border-[#E7E2DA]/60 bg-[#F8FAFC] relative">
                  <Image
                    source={service.image}
                    contentFit="cover"
                    style={{ width: "100%", height: "100%" }}
                  />
                  <View className="absolute top-3 right-3 rounded-full border border-[#E7E2DA] bg-white/95 px-3 py-1 shadow-xs">
                    <Text className="text-[11px] font-bold text-navy-900">{service.categoryTag}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Desktop Dots: 18px below card, active 24px orange pill, inactive 8px circle */}
        <View className="mt-[18px] flex-row items-center justify-center gap-1">
          {FEATURED_SERVICES.map((s, idx) => (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`Show ${s.categoryTag}`}
              onPress={() => setActiveIdx(idx)}
              className="p-1 items-center justify-center"
            >
              <View
                style={{
                  height: 8,
                  borderRadius: 999,
                  width: idx === activeIdx ? 24 : 8,
                  backgroundColor: idx === activeIdx ? "#EA580C" : "#D6D0C8",
                }}
              />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // Mobile Layout: Horizontal FlatList with snap-to-interval, 24px peek of next card, animated dots
  return (
    <View className="w-full">
      <FlatList
        ref={flatListRef}
        data={FEATURED_SERVICES}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        snapToAlignment="start"
        decelerationRate="fast"
        disableIntervalMomentum={true}
        getItemLayout={(_, index) => ({
          length: step,
          offset: step * index,
          index,
        })}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onScrollBeginDrag={() => {
          isDragging.current = true;
          stopAutoplay();
        }}
        onMomentumScrollEnd={(e) => {
          isDragging.current = false;
          const idx = Math.max(
            0,
            Math.min(N - 1, Math.round(e.nativeEvent.contentOffset.x / step))
          );
          currentIndexRef.current = idx;
          startAutoplay();
        }}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        ListFooterComponent={<View style={{ width: 24 }} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(item.link as never)}
            style={{ width: cardWidth }}
            className="overflow-hidden rounded-[24px] border border-[#ECE7E1] bg-white p-3 shadow-xs justify-between"
          >
            {/* Inset Photo (150px height) */}
            <View className="h-[150px] w-full rounded-2xl overflow-hidden bg-[#EDE7DF] relative">
              <Image
                source={item.image}
                contentFit="cover"
                style={{ width: "100%", height: "100%" }}
              />
              <View className="absolute top-2 left-2 rounded-full border border-[#E7E2DA] bg-white px-2.5 py-0.5 shadow-xs">
                <Text className="text-[10px] font-black uppercase tracking-wider text-[#D9480F]">Featured</Text>
              </View>
              <View className="absolute top-2 right-2 flex-row items-center gap-1 rounded-lg bg-black/80 px-2 py-0.5 shadow-xs">
                <Text className="text-[11px] text-amber-400">★</Text>
                <Text className="text-[11px] font-bold text-white">{item.rating}</Text>
              </View>
            </View>

            {/* Content Area */}
            <View className="pt-2">
              <Text className="text-[19px] font-black text-navy-900 leading-tight mt-1 mb-1" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-[12.5px] font-medium text-text-secondary leading-snug mb-2" numberOfLines={2} style={{ minHeight: 34 }}>
                {item.subtitle}
              </Text>
            </View>

            {/* 2 Checkmarks Highlights */}
            <View className="border-y border-[#ECE7E1] py-2 gap-1.5">
              {item.highlights.map((hl: string, hlIdx: number) => (
                <View key={hlIdx} className="flex-row items-center gap-2">
                  <View className="size-4.5 items-center justify-center rounded-full bg-[#E4F4EA]">
                    <Text className="text-[10px] font-bold text-[#137333]">✓</Text>
                  </View>
                  <Text className="text-xs font-medium text-navy-900 flex-1" numberOfLines={1}>
                    {hl}
                  </Text>
                </View>
              ))}
            </View>

            {/* Starts at Price + Book CTA Button */}
            <View className="mt-3 flex-row items-center justify-between gap-2.5">
              <View>
                <Text className="text-[9.5px] font-bold uppercase tracking-wider text-[#3C4658] leading-none">STARTS AT</Text>
                <Text className="text-[20px] font-black text-navy-900 leading-tight mt-0.5">{item.price}</Text>
              </View>

              <View className="h-[34px] px-3.5 rounded-xl bg-[#EA580C] items-center justify-center flex-row gap-1.5 shadow-xs">
                <Text className="text-xs font-bold text-white">{item.buttonText}</Text>
                <Text className="text-sm font-bold text-white leading-none">→</Text>
              </View>
            </View>
          </Pressable>
        )}
      />

      {/* Mobile Animated Dots: 8px below cards, >= 44px tap target, active 24px orange pill */}
      <View style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}>
        {FEATURED_SERVICES.map((s, idx) => {
          const inputRange = [(idx - 1) * step, idx * step, (idx + 1) * step];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [8, 24, 8],
            extrapolate: "clamp",
          });
          const dotColor = scrollX.interpolate({
            inputRange,
            outputRange: ["#D6D0C8", "#EA580C", "#D6D0C8"],
            extrapolate: "clamp",
          });

          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`Service ${idx + 1}`}
              onPress={() => {
                currentIndexRef.current = idx;
                flatListRef.current?.scrollToOffset({ offset: idx * step, animated: true });
              }}
              style={{ minHeight: 44, minWidth: 20, alignItems: "center", justifyContent: "center" }}
            >
              <Animated.View
                style={{
                  height: 8,
                  borderRadius: 999,
                  width: dotWidth,
                  backgroundColor: dotColor,
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function QuantityControl({
  quantity,
  disabled,
  onDecrement,
  onIncrement,
}: {
  quantity: number;
  disabled: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View className="h-8 flex-row items-center overflow-hidden rounded-full border border-action bg-white">
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease quantity" disabled={disabled} onPress={onDecrement} className="h-full items-center justify-center px-3">
        <Text className="text-base font-extrabold text-action">-</Text>
      </Pressable>
      <Text className="min-w-[16px] text-center text-xs font-black text-navy-900">{quantity}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Increase quantity" disabled={disabled} onPress={onIncrement} className="h-full items-center justify-center px-3">
        <Text className="text-base font-extrabold text-action">+</Text>
      </Pressable>
    </View>
  );
}

function Chevron({ flip = false, color = "#00112e" }: { flip?: boolean; color?: string }) {
  return (
    <Svg viewBox="0 0 20 20" width={16} height={16} fill={color} style={flip ? { transform: [{ rotate: "180deg" }] } : undefined}>
      <Path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </Svg>
  );
}
