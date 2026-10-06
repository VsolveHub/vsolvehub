// Ported from frontend/apps/customer/features/catalog/components/homepage-client-sections.tsx
import { useQueryClient } from "@tanstack/react-query";
import { request } from "@vsolve/api-client";
import { getApiClient } from "@vsolve/mobile-core";
import { Dialog, Text, formatMoney } from "@vsolve/mobile-ui";
import { describeError, STATIC_CONTENT, fetchCachedQuery, queryKeys, SESSION_STATE } from "@vsolve/query/native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
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

const CAROUSEL_SLIDES = [
  {
    title: "Electrical Safety",
    subtitle: "Ensure your home wiring is safe. Book modular switchboard repairs and switch safety audits starting at ₹129.",
    buttonText: "Know more",
    link: "/catalog/electrician",
    image: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
    bgClass: "bg-[#FFF9F5]",
    btnBg: "bg-[#EA580C]",
  },
  {
    title: "Plumbing Upgrades",
    subtitle: "Trace hidden pipeline leaks and install premium, drip-free bathroom mixers starting at ₹199.",
    buttonText: "Know more",
    link: "/catalog/plumber",
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop",
    bgClass: "bg-[#F0F7FF]",
    btnBg: "bg-[#0284C7]",
  },
  {
    title: "Carpentry Fitting",
    subtitle: "Fix loose cabinet shutters, align squeaking door hinges, or mount floating wall shelves starting at ₹299.",
    buttonText: "Know more",
    link: "/catalog/technician",
    image: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=1200&auto=format&fit=crop",
    bgClass: "bg-[#FEFDF0]",
    btnBg: "bg-[#D97706]",
  },
];

const GUIDES = [
  { label: "Electrician Guide", key: "electrician", icon: "⚡", iconBg: "bg-[#FFF0E5]" },
  { label: "Plumbing Guide", key: "plumbing", icon: "💧", iconBg: "bg-[#E0F2FE]" },
  { label: "Carpenter Guide", key: "carpentry", icon: "🪚", iconBg: "bg-[#F3F4F6]" },
] as const;

export function HomepageClientSections() {
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
  const [slideIndex, setSlideIndex] = useState(0);

  const cartMerge = cartQuery.isError ? cartMergeConflict(cartQuery.error) : null;
  const activeGuide = activeGuideKey ? SERVICE_GUIDES[activeGuideKey] : null;
  const slide = CAROUSEL_SLIDES[slideIndex] ?? CAROUSEL_SLIDES[0];

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

      <ServiceRail title="Best Sellers" subtitle="Most booked services in your city" items={BEST_SELLERS} renderAction={renderItemAction} />
      <HeroSplitCarousel
        slide={slide}
        index={slideIndex}
        onPrev={() => setSlideIndex((prev) => (prev - 1 + CAROUSEL_SLIDES.length) % CAROUSEL_SLIDES.length)}
        onNext={() => setSlideIndex((prev) => (prev + 1) % CAROUSEL_SLIDES.length)}
        onSelect={setSlideIndex}
      />
      <ServiceRail
        title="Electrician Services"
        subtitle="Certified electrical installations and diagnostics"
        seeAll="/catalog/electrician"
        items={ELECTRICIAN_SERVICES}
        renderAction={renderItemAction}
      />
      <View className="gap-5">
        <Text className="text-2xl font-extrabold tracking-tight text-navy-900">Service & Booking Guides</Text>
        <Text className="text-sm text-text-secondary">Read what is included & how to prepare</Text>
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
      <ServiceRail
        title="Plumbing Services"
        subtitle="Taps, leakages, and sanitary fixes"
        seeAll="/catalog/plumber"
        items={PLUMBING_SERVICES}
        renderAction={renderItemAction}
      />
      <ServiceRail
        title="Carpenter Services"
        subtitle="Furniture repair, mounts, and fittings"
        seeAll="/catalog/technician"
        items={CARPENTRY_SERVICES}
        renderAction={renderItemAction}
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
}: {
  title: string;
  subtitle: string;
  seeAll?: string;
  items: HomepageServiceItem[];
  renderAction: (slug: string) => ReactNode;
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-5 pb-4">
        {items.map((item) => (
          <ServiceCard key={item.slug} item={item} action={renderAction(item.slug)} />
        ))}
      </ScrollView>
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
  slide,
  index,
  onPrev,
  onNext,
  onSelect,
}: {
  slide: (typeof CAROUSEL_SLIDES)[number];
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
}) {
  const router = useRouter();
  return (
    <View className={`overflow-hidden rounded-3xl border border-[#e7e2da]/40 ${slide.bgClass}`}>
      <View className="gap-2 p-8">
        <Text className="text-[9px] font-black uppercase tracking-widest text-text-secondary/70">Featured Service</Text>
        <Text className="text-3xl font-extrabold leading-tight text-navy-900">{slide.title}</Text>
        <Text className="mt-1 text-xs font-medium leading-relaxed text-text-secondary">{slide.subtitle}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push(slide.link as never)} className={`mt-6 self-start rounded-xl px-6 py-2 ${slide.btnBg}`}>
          <Text className="text-xs font-bold text-white">{slide.buttonText}</Text>
        </Pressable>
      </View>
      <Image source={{ uri: slide.image }} contentFit="cover" style={{ height: 180, width: "100%" }} />
      <View className="absolute left-4 top-1/2">
        <Pressable accessibilityRole="button" accessibilityLabel="Previous slide" onPress={onPrev} className="size-9 items-center justify-center rounded-full border border-[#e7e2da]/40 bg-white">
          <Chevron flip />
        </Pressable>
      </View>
      <View className="absolute right-4 top-1/2">
        <Pressable accessibilityRole="button" accessibilityLabel="Next slide" onPress={onNext} className="size-9 items-center justify-center rounded-full border border-[#e7e2da]/40 bg-white">
          <Chevron />
        </Pressable>
      </View>
      <View className="absolute bottom-4 left-8 flex-row gap-1.5">
        {CAROUSEL_SLIDES.map((entry, dot) => (
          <Pressable key={entry.title} accessibilityRole="button" accessibilityLabel={`Go to slide ${dot + 1}`} onPress={() => onSelect(dot)} className={dot === index ? "h-1.5 w-5 rounded-full bg-navy-900" : "size-1.5 rounded-full bg-navy-900/30"} />
        ))}
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
