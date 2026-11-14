// Ported from frontend/apps/customer/app/(shop)/catalog/[category]/[service]/page.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { Badge, Button, ErrorState, Sheet, Skeleton, Text, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { useAddCartItem, useCart, useRemoveCartItem, useUpdateCartItem } from "@/features/checkout/queries";
import {
  useCategories,
  useCategoryServices,
  usePromoBanners,
  useServiceDetail,
  type ServiceCard,
  type ServiceDetail,
} from "@/features/catalog/client-queries";
import { PromoBanners } from "@/features/catalog/view/promo-banners";
import { resolveImageUrl } from "@/features/catalog/category-artwork";
import { recordViewed } from "@/features/catalog/recently-viewed";
import { serviceHref } from "@/features/catalog/service-href";
import { AddToCartButton } from "@/features/catalog/view/add-to-cart-button";
import { FitOutServicePicker } from "@/features/catalog/view/fit-out-picker";
import { ProcessSteps } from "@/features/catalog/view/process-steps";
import {
  ServiceAssurance,
  ServiceFaqSection,
  ServiceOfferBanner,
  ServiceOptionDifferences,
  ServiceProfessionals,
} from "@/features/catalog/view/service-detail-sections";
import { categoryHeadline } from "@/features/catalog/tile-desktop-rating";
import { buildServiceFaqs } from "@/features/catalog/service-faqs";
import { addsToServiceCopy, durationLabel } from "@/features/catalog/service-facts";
import { useIsDesktop } from "@/lib/responsive";
import { bookCrewHref } from "@/lib/routes";

const A3_TIME_BLOCK = "A3_TIME_BLOCK";
const FIT_OUT_PICKER_SERVICE = "interior-fit-out-project";

const ACTION = "#f87000";
const NAVY = "#00112e";
const MUTED = "#453f37";
const SUCCESS = "#0e7c3a";
const DANGER = "#b3261e";

function oneParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

function StrokeIcon({
  d,
  size = 18,
  color = ACTION,
  strokeWidth = 2,
  viewBox = "0 0 24 24",
}: {
  d: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  viewBox?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox={viewBox} fill="none">
      <Path d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CatalogMissing() {
  const router = useRouter();
  return (
    <View className="mx-auto w-full max-w-lg items-center px-4 py-20">
      <Text className="text-center text-2xl font-bold text-text">We could not find that service</Text>
      <Text className="mt-2 text-center text-text-secondary">
        It may have been renamed or is no longer offered. Everything we currently do is on the services page.
      </Text>
      <Button size="lg" className="mt-6" onPress={() => router.push("/catalog" as never)}>
        Browse all services
      </Button>
    </View>
  );
}

function CatalogDown({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="mx-auto w-full max-w-2xl px-4 py-16">
      <ErrorState
        title="We could not load our services"
        message="This is a problem on our side, not yours. Nothing has been booked or charged."
        actionLabel="Try again"
        onAction={onRetry}
      />
    </View>
  );
}

function ServiceSkeleton() {
  return (
    <View className="mx-auto w-full max-w-[1216px] gap-4 px-4 pt-4 sm:px-6 lg:px-8">
      <Skeleton className="h-10 w-40 rounded-full" />
      <Skeleton className="h-4 w-2/3" />
      <View className="mt-4 flex-col gap-8 md:flex-row">
        <Skeleton className="aspect-[4/3] flex-1 rounded-[1.25rem]" />
        <View className="flex-1 gap-4">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-48 w-full rounded-[1rem]" />
        </View>
      </View>
    </View>
  );
}

function PrimaryLink({ label, href, arrow = false }: { label: string; href: string; arrow?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href as never)}
      className="h-[3.25rem] w-full flex-row items-center justify-center rounded-md bg-action px-6 shadow-sm active:scale-[0.98]"
    >
      <Text className="text-[0.95rem] font-bold text-white">{label}</Text>
      {arrow ? <Text className="ml-2 text-[0.95rem] font-bold text-white">→</Text> : null}
    </Pressable>
  );
}

function SecondaryLink({ label, href }: { label: string; href: string }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(href as never)}
      className="h-[3.25rem] w-full flex-row items-center justify-center rounded-md border-2 border-line bg-transparent px-6 active:scale-[0.98]"
    >
      <Text className="text-[0.95rem] font-bold text-navy-900">{label}</Text>
    </Pressable>
  );
}

function Breadcrumbs({ trail }: { trail: { label: string; href: string }[] }) {
  const router = useRouter();
  return (
    <View accessibilityLabel="Breadcrumb" className="mt-4 flex-row flex-wrap items-center gap-1.5">
      {trail.map((crumb, index) => {
        const isCurrent = index === trail.length - 1;
        return (
          <View key={crumb.href} className="flex-row items-center gap-1.5">
            {index > 0 ? <Text className="text-xs text-[#94a3b8]">/</Text> : null}
            {isCurrent ? (
              <Text className="text-xs font-medium text-navy-900">{crumb.label}</Text>
            ) : (
              <Pressable accessibilityRole="link" onPress={() => router.push(crumb.href as never)}>
                <Text className="text-xs text-text-secondary hover:underline">{crumb.label}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const POLICY_GROUPS = [
  { kind: "INCLUDED", heading: "What's included", color: SUCCESS },
  { kind: "EXCLUDED", heading: "Not included", color: DANGER },
  { kind: "GOOD_TO_KNOW", heading: "Good to know", color: MUTED },
] as const;

function PolicyMark({ kind }: { kind: (typeof POLICY_GROUPS)[number]["kind"] }) {
  const color = POLICY_GROUPS.find((group) => group.kind === kind)?.color ?? MUTED;
  if (kind === "INCLUDED") {
    return (
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path fill={color} d="M13.3 4.3a1 1 0 010 1.4l-6 6a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4L6.6 9.6l5.3-5.3a1 1 0 011.4 0z" />
      </Svg>
    );
  }
  if (kind === "EXCLUDED") {
    return (
      <Svg width={16} height={16} viewBox="0 0 16 16">
        <Path fill={color} d="M4.3 4.3a1 1 0 011.4 0L8 6.6l2.3-2.3a1 1 0 111.4 1.4L9.4 8l2.3 2.3a1 1 0 01-1.4 1.4L8 9.4l-2.3 2.3a1 1 0 01-1.4-1.4L6.6 8 4.3 5.7a1 1 0 010-1.4z" />
      </Svg>
    );
  }
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path
        fill={color}
        fillRule="evenodd"
        d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.9.9 0 110 1.8A.9.9 0 018 4zm0 3.2a.75.75 0 01.75.75v3.3a.75.75 0 01-1.5 0v-3.3A.75.75 0 018 7.2z"
        clipRule="evenodd"
      />
    </Svg>
  );
}

function PolicyList({ policies }: { policies: ServiceDetail["policies"] }) {
  const isDesktop = useIsDesktop();
  const groups = POLICY_GROUPS.map((group) => ({
    ...group,
    items: policies.filter(
      (policy) => policy.kind === group.kind && !/(?:warranty|guarantee|workmanship)/i.test(policy.text),
    ),
  })).filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;

  const standardGroups = groups.filter((g) => g.kind !== "GOOD_TO_KNOW");
  const goodToKnow = groups.find((g) => g.kind === "GOOD_TO_KNOW");

  return (
    <View className="gap-6">
      <View className={isDesktop ? "flex-row gap-8" : "gap-6"}>
        {standardGroups.map((group) => (
          <View key={group.kind} className={isDesktop ? "flex-1" : "w-full"}>
            <Text className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">
              {group.heading}
            </Text>
            <View className="mt-3 gap-2">
              {group.items.map((policy) => (
                <View key={policy.id} className="flex-row items-start gap-2.5">
                  <View className="mt-0.5">
                    <PolicyMark kind={group.kind} />
                  </View>
                  <Text className="flex-1 text-sm text-text leading-relaxed">
                    {policy.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {goodToKnow ? (
        <View className="border-t border-line/40 pt-4">
          <Text className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">
            {goodToKnow.heading}
          </Text>
          <View className="mt-3 gap-2">
            {goodToKnow.items.map((policy) => (
              <View key={policy.id} className="flex-row items-start gap-2.5">
                <View className="mt-0.5">
                  <PolicyMark kind="GOOD_TO_KNOW" />
                </View>
                <Text className="flex-1 text-sm text-text leading-relaxed">
                  {policy.text}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function VariantList({
  variants,
  serviceCoverUrl,
  serviceCopy = [],
}: {
  variants: ServiceDetail["variants"];
  serviceCoverUrl?: string | null;
  serviceCopy?: string[];
}) {
  const isChoice = variants.length > 1;

  return (
    <View className="mt-4 gap-4">
      {variants.map((variant) => {
        const rawVariantImg =
          variant.image_url && variant.image_url.trim() !== ""
            ? variant.image_url
            : (serviceCoverUrl ?? "");
        const variantImg = resolveImageUrl(rawVariantImg);

        return (
          <View
            key={variant.id}
            className="flex-col justify-between gap-4 rounded-[0.75rem] bg-[#F4F2EE] p-4 sm:flex-row sm:items-center sm:p-5"
          >
            <View className="flex-1 flex-row items-start gap-3.5 sm:gap-4">
              <View className="size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line/50 bg-white shadow-2xs sm:size-20">
                {variantImg ? (
                  <Image
                    source={{ uri: variantImg }}
                    contentFit={
                      variantImg.includes("/Service%20Cover/") || variantImg.includes("/Service Cover/")
                        ? "contain"
                        : "cover"
                    }
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : null}
              </View>

              <View className="min-w-0 flex-1">
                <Text className="text-[1.05rem] font-medium text-navy-900">{variant.name}</Text>
                {addsToServiceCopy(variant.description, ...serviceCopy) ? (
                  <Text className="mt-2 text-[0.9rem] leading-relaxed text-text-secondary">
                    {variant.description}
                  </Text>
                ) : null}
                <VariantMeta variant={variant} />
              </View>
            </View>

            <View className="flex-row items-center justify-between gap-3 border-t border-line/40 pt-3 sm:flex-col sm:items-end sm:justify-start sm:border-l sm:border-t-0 sm:border-line/40 sm:pl-6 sm:pt-0">
              <View className="min-w-0 sm:items-end">
                <Text className="text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">
                  Starts at
                </Text>
                <Text className="mt-0.5 text-[1.1rem] font-bold tabular-nums text-navy-900">
                  {formatMoney(variant.starting_price.amount_paise)}
                </Text>
                {variant.minimum_service_subtotal.amount_paise >
                variant.starting_price.amount_paise ? (
                  <Badge tone="neutral" className="mt-1">
                    {`Min ${formatMoney(variant.minimum_service_subtotal.amount_paise)}`}
                  </Badge>
                ) : null}
              </View>

              {isChoice ? (
                <View className="shrink-0 sm:mt-2">
                  <AddToCartButton variantId={variant.id} size="compact" />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function VariantMeta({ variant }: { variant: ServiceDetail["variants"][number] }) {
  const duration = durationLabel(variant);
  const choices = variant.task_lines.length;
  if (!duration && choices < 2) return null;
  return (
    <View className="mt-3 flex-row flex-wrap items-center gap-x-3 gap-y-1">
      {duration ? (
        <View className="flex-row items-center gap-1.5">
          <Svg viewBox="0 0 20 20" width={16} height={16} fill="none">
            <Circle cx="10" cy="10" r="7.25" stroke="#71717a" strokeWidth={1.6} />
            <Path d="M10 6v4l2.5 1.5" stroke="#71717a" strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
          <Text className="text-[0.85rem] text-text-muted">{duration}</Text>
        </View>
      ) : null}
      {choices >= 2 ? (
        <Text className="text-[0.85rem] text-text-muted">{`${choices} tasks to choose from`}</Text>
      ) : null}
    </View>
  );
}

function PlusIcon() {
  return (
    <Svg viewBox="0 0 20 20" width={16} height={16} fill="none">
      <Path d="M10 4v12m-6-6h12" stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function RelatedServiceCard({
  service,
  categorySlug,
  index = 1,
}: {
  service: ServiceCard;
  categorySlug: string;
  index?: number;
}) {
  const router = useRouter();
  const isPopular = index === 1;
  const cartQuery = useCart();
  const addItem = useAddCartItem();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const cart = cartQuery.data;
  const cartItem = cart?.items.find((item) => item.variant_id === service.bookable_variant_id);
  const cartUnavailable = cartQuery.isLoading || cart === undefined;
  const open = () => router.push(serviceHref(service, categorySlug) as never);

  const changeQuantity = (delta: number) => {
    if (!cart || !cartItem) return;
    if (delta < 0 && cartItem.quantity <= 1) {
      if (removeItem.isPending || updateItem.isPending) return;
      removeItem.mutate({
        expectedCartVersion: cart.version,
        expectedItemVersion: cartItem.version,
        itemId: cartItem.id,
      });
      return;
    }
    if (updateItem.isPending) return;
    updateItem.mutate({
      expectedCartVersion: cart.version,
      expectedItemVersion: cartItem.version,
      itemId: cartItem.id,
      quantity: cartItem.quantity + delta,
    });
  };

  const action = cartItem ? (
    <View className="h-8 flex-row items-center overflow-hidden rounded-full border border-action bg-white shadow-xs">
      <Pressable
        accessibilityRole="button"
        onPress={() => changeQuantity(-1)}
        disabled={updateItem.isPending || removeItem.isPending}
        className="h-full items-center justify-center px-3.5 disabled:opacity-50"
      >
        <Text className="text-base font-extrabold text-action">-</Text>
      </Pressable>
      <Text className="min-w-[20px] px-2 text-center text-xs font-black text-navy-900">{cartItem.quantity}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => changeQuantity(1)}
        disabled={updateItem.isPending}
        className="h-full items-center justify-center px-3.5 disabled:opacity-50"
      >
        <Text className="text-base font-extrabold text-action">+</Text>
      </Pressable>
    </View>
  ) : service.bookable_variant_id ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (addItem.isPending || cartUnavailable || !cart || !service.bookable_variant_id) return;
        addItem.mutate({
          expectedCartVersion: cart.version,
          variantId: service.bookable_variant_id,
          quantity: 1,
        });
      }}
      disabled={addItem.isPending || cartUnavailable}
      className="h-8 flex-row items-center justify-center rounded-full bg-action px-5 shadow-sm active:scale-95 disabled:opacity-50"
    >
      <Text className="text-xs font-bold text-white">{addItem.isPending ? "Adding..." : "Add"}</Text>
      {!addItem.isPending && (
        <View className="ml-1.5">
          <PlusIcon />
        </View>
      )}
    </Pressable>
  ) : (
    <View className="h-8 flex-row items-center justify-center rounded-full bg-action px-5 shadow-sm">
      <Text className="text-xs font-bold text-white">Add</Text>
      <View className="ml-1.5">
        <PlusIcon />
      </View>
    </View>
  );

  const imageUrl = resolveImageUrl(service.cover?.url);
  const description =
    service.short_description ||
    "Complete service carried out at your address by a verified professional.";

  return (
    <View
      className="flex-1 overflow-hidden rounded-card border border-transparent bg-white shadow-card"
      style={{ elevation: 2 }}
    >
      <Pressable accessibilityRole="link" onPress={open} className="flex-1">
        <View className="aspect-[16/10] w-full overflow-hidden bg-[#F4F1EC]">
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              contentFit="cover"
              style={{ width: "100%", height: "100%" }}
            />
          ) : (
            <View className="size-full items-center justify-center bg-surface-sunken" />
          )}
        </View>

        <View className="p-5 pb-0">
          <View className="mb-2 flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-[1.15rem] font-bold leading-snug text-navy-900" numberOfLines={1}>
              {service.name}
            </Text>
            {isPopular ? (
              <View className="rounded-full bg-[#FFF0E5] px-2.5 py-0.5">
                <Text className="text-[0.65rem] font-bold tracking-wide text-action">Popular</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={3} className="text-[0.925rem] leading-relaxed text-text-secondary">
            {description}
          </Text>
        </View>
      </Pressable>

      <View className="p-5 pt-4">
        <View className="flex-row items-end justify-between gap-3 border-t border-line/50 pt-4">
          {service.starting_price !== null ? (
            <View className="min-w-0">
              <Text className="text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">Starts at</Text>
              <Text className="mt-1 text-lg font-extrabold tabular-nums text-navy-900">
                {formatMoney(service.starting_price.amount_paise)}
              </Text>
            </View>
          ) : null}
          {action}
        </View>
      </View>
    </View>
  );
}

function ServiceVariantModal({ service }: { service: ServiceDetail }) {
  const [open, setOpen] = useState(false);
  const cartQuery = useCart();
  const cart = cartQuery.data;
  const router = useRouter();

  const variantIds = new Set(service.variants.map((v) => v.id));
  const cartItemsInService = cart?.items.filter((item) => variantIds.has(item.variant_id)) ?? [];
  const totalQuantity = cartItemsInService.reduce((sum, item) => sum + item.quantity, 0);
  const hasItemsInCart = totalQuantity > 0;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="h-11 w-full flex-row items-center justify-center rounded-xl bg-navy-900 px-6 shadow-xs active:scale-[0.98]"
      >
        <Text className="text-sm font-bold text-white">
          {hasItemsInCart ? `${totalQuantity} in cart • Change` : "Add to Cart"}
        </Text>
      </Pressable>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="What you can book"
        description={service.name}
        footer={
          <View className="w-full flex-row items-center justify-between gap-3">
            {hasItemsInCart ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  setOpen(false);
                  router.push("/cart" as never);
                }}
              >
                <Text className="text-xs font-bold text-action">View Cart ({totalQuantity}) →</Text>
              </Pressable>
            ) : (
              <Text className="text-xs text-text-secondary">Prices confirmed before payment</Text>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              className="rounded-xl bg-navy-900 px-5 py-2.5 active:scale-[0.98]"
            >
              <Text className="text-xs font-bold text-white">Done</Text>
            </Pressable>
          </View>
        }
      >
        <ScrollView className="max-h-[60vh]" showsVerticalScrollIndicator={false}>
          <VariantList
            variants={service.variants}
            serviceCoverUrl={service.cover?.url}
            serviceCopy={[service.short_description, service.description ?? ""]}
          />
        </ScrollView>
      </Sheet>
    </>
  );
}

function BookingActions({ service }: { service: ServiceDetail }) {
  if (service.slug === FIT_OUT_PICKER_SERVICE) {
    return <FitOutServicePicker serviceSlug={service.slug} />;
  }
  return (
    <View className="gap-3">
      {service.request_archetypes.includes(A3_TIME_BLOCK) ? (
        <>
          <PrimaryLink label="Book a crew" href={bookCrewHref(service.slug)} arrow />
          <SecondaryLink label="Get quotes instead" href={`/requests/new/${service.slug}`} />
        </>
      ) : service.request_archetypes.length > 0 && service.bookable_variant_id ? (
        <>
          <PrimaryLink label="Book at the fixed price" href={`/book/${service.slug}`} arrow />
          <SecondaryLink label="Get a free quote after a site visit" href={`/requests/new/${service.slug}`} />
        </>
      ) : service.request_archetypes.length > 0 ? (
        <PrimaryLink label="Tell us what you need" href={`/requests/new/${service.slug}`} arrow />
      ) : service.variants.length > 1 ? (
        <ServiceVariantModal service={service} />
      ) : service.bookable_variant_id ? (
        <AddToCartButton variantId={service.bookable_variant_id} />
      ) : null}
    </View>
  );
}

export function ServiceScreen({ serviceSlug }: { serviceSlug: string }) {
  const isDesktop = useIsDesktop();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const categorySlug = oneParam(params.category);
  const detail = useServiceDetail(serviceSlug);
  const categories = useCategories();
  const services = useCategoryServices(categorySlug.length > 0 ? categorySlug : null);
  const viewed = detail.data;
  const viewedCategory = viewed?.category_slug;
  const promoBannersQuery = usePromoBanners(categorySlug.length > 0 ? categorySlug : (viewedCategory ?? null));

  const scrollViewRef = useRef<any>(null);
  const [faqOffsetY, setFaqOffsetY] = useState<number>(0);

  useEffect(() => {
    if (!viewed || !viewedCategory) return;
    void recordViewed({
      slug: viewed.slug,
      name: viewed.name,
      href: `/catalog/${viewedCategory}/${viewed.slug}`,
    });
  }, [viewed, viewedCategory]);

  const [refreshing, setRefreshing] = useState(false);

  const retry = () => {
    void detail.refetch();
    void categories.refetch();
    void services.refetch();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([detail.refetch(), categories.refetch(), services.refetch()]);
    setRefreshing(false);
  };

  const servicesPending = categorySlug.length > 0 && services.isPending;
  if (detail.isPending || categories.isPending || servicesPending) return <ServiceSkeleton />;

  const missing =
    (detail.isError && isNotFound(detail.error)) ||
    !detail.data ||
    (services.isError && isNotFound(services.error)) ||
    (categorySlug.length > 0 && detail.data.category_slug !== categorySlug);
  const failed =
    (detail.isError && !isNotFound(detail.error)) ||
    categories.isError ||
    (services.isError && !isNotFound(services.error));

  if (failed) return <CatalogDown onRetry={retry} />;
  if (missing || !detail.data) return <CatalogMissing />;

  const service = detail.data;
  const category = (categories.data ?? []).find((item) => item.slug === service.category_slug);
  if (!category) return <CatalogMissing />;

  const relatedServices = (services.data ?? [])
    .filter((item) => item.slug !== service.slug)
    .sort((left, right) => {
      const leftSame = left.subcategory_slug === service.subcategory_slug;
      const rightSame = right.subcategory_slug === service.subcategory_slug;
      if (leftSame && !rightSame) return -1;
      if (!leftSame && rightSame) return 1;
      return 0;
    })
    .slice(0, 3);

  const processSteps = service.policies.filter((policy) => policy.kind === "PROCESS");
  const otherPolicies = service.policies.filter((policy) => policy.kind !== "PROCESS");
  const showDescription = addsToServiceCopy(service.description ?? "", service.short_description);
  const faqs = buildServiceFaqs(service);
  const durations = service.variants.map(durationLabel).filter((label): label is string => label !== null);
  const highlights = [
    service.variants.length > 1 ? `${service.variants.length} options` : null,
    durations.length === service.variants.length && new Set(durations).size === 1 ? durations[0] : null,
  ].filter((item): item is string => item !== null && item !== undefined);

  const coverUrl = resolveImageUrl(
    service.cover?.url || service.variants.find((variant) => Boolean(variant.image_url))?.image_url || null,
  );

  const scrollToFaqs = () => {
    if (faqOffsetY > 0 && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: faqOffsetY - 20, animated: true });
    }
  };

  return (
    <ScrollView
      ref={scrollViewRef}
      className="flex-1 bg-[#FAF9F7]"
      contentContainerClassName="px-4 pb-16 pt-4 sm:px-6 lg:px-8"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#EA580C"]} tintColor="#EA580C" />
      }
    >
      <View className="mx-auto w-full max-w-[1216px]">
        {/* Back Button */}
        <View className="mb-6">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Back to ${category.name}`}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.push(`/catalog/${categorySlug || category.slug}?tile=${service.subcategory_slug}` as never);
              }
            }}
            className="flex-row items-center gap-2 self-start rounded-full border border-[#e7e2da] bg-white px-4 py-2.5 shadow-2xs active:bg-surface-hover"
          >
            <Svg viewBox="0 0 20 20" width={14} height={14} fill={NAVY} style={{ transform: [{ rotate: "180deg" }] }}>
              <Path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </Svg>
            <Text className="text-xs font-black text-navy-900">Back to {category.name}</Text>
          </Pressable>
        </View>

        {/* Breadcrumbs */}
        <Breadcrumbs
          trail={[
            { label: "Services", href: "/catalog" },
            { label: category.name, href: `/catalog/${category.slug}?tile=${service.subcategory_slug}` },
            { label: service.name, href: `/catalog/${categorySlug || category.slug}/${service.slug}` },
          ]}
        />

        {/* Top Hero Section */}
        <View className={isDesktop ? "mt-8 flex-row items-stretch gap-12 lg:gap-14" : "mt-8 gap-8"}>
          {/* Left: Featured Image */}
          <View className={isDesktop ? "w-7/12" : "w-full"}>
            <View
              className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.25rem] bg-surface-sunken shadow-sm"
              style={{ aspectRatio: 4 / 3 }}
            >
              {coverUrl ? (
                <Image
                  source={{ uri: coverUrl }}
                  contentFit="cover"
                  accessibilityLabel={service.cover?.alt_text || service.name}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : null}
            </View>
          </View>

          {/* Right: Title, Badges & Booking Action Card */}
          <View className={isDesktop ? "w-5/12 justify-between" : "w-full"}>
            <View>
              <Text className="text-[1.85rem] font-bold leading-tight text-navy-900 sm:text-[2.1rem]">
                {service.name}
              </Text>
              <Text className="mt-2.5 text-[0.95rem] leading-relaxed text-text-secondary">
                {service.short_description}
              </Text>

              {/* Highlights Chips */}
              {highlights.length > 0 ? (
                <View className="mt-3.5 flex-row flex-wrap gap-2">
                  {highlights.map((item) => (
                    <View
                      key={item}
                      className="flex-row items-center gap-1.5 rounded-full border border-line/70 bg-white px-3 py-1"
                    >
                      <Svg viewBox="0 0 20 20" width={14} height={14} fill={ACTION}>
                        <Path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </Svg>
                      <Text className="text-[0.8rem] font-semibold text-navy-900">{item}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Price & Action Card */}
            <View
              className="mt-5 rounded-2xl border border-transparent bg-white p-5 sm:p-6 shadow-sm"
              style={{ elevation: 2 }}
            >
              {service.starting_price !== null ? (
                <>
                  <Text className="text-[0.68rem] font-bold uppercase tracking-wider text-text-muted">Starts at</Text>
                  <Text className="mt-1 text-2xl font-bold tabular-nums text-navy-900">
                    {formatMoney(service.starting_price.amount_paise)}
                  </Text>
                  <Text className="mt-2.5 text-[0.85rem] leading-relaxed text-text-secondary">
                    The exact price is confirmed before you pay, once you have told us what the job involves.
                  </Text>
                </>
              ) : (
                <Text className="text-[0.85rem] leading-relaxed text-text-secondary">
                  This work is priced per job. Tell us what you need and verified professionals will send you their own
                  quotes — describing the job costs nothing.
                </Text>
              )}

              <View className="mt-4 sm:mt-5">
                <BookingActions service={service} />
              </View>

              <View className="mt-4 sm:mt-5 flex-row items-center justify-between gap-4 border-t border-line/60 pt-3.5 sm:pt-4">
                <View className="flex-row items-center gap-2.5">
                  <StrokeIcon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={18} />
                  <Text className="text-[0.875rem] font-medium text-text-secondary">Vetted Pros</Text>
                </View>
                <View className="flex-row items-center gap-2.5">
                  <StrokeIcon
                    d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                    size={18}
                  />
                  <Text className="text-[0.875rem] font-medium text-text-secondary">ID Verified</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Promo Banners & Coin Offers */}
        {promoBannersQuery.data && promoBannersQuery.data.length > 0 ? (
          <PromoBanners banners={promoBannersQuery.data} fallbackImageUrl={category.image_url} />
        ) : null}
        <ServiceOfferBanner imageUrl={category.image_url} />

        {/* Know the Difference */}
        <ServiceOptionDifferences service={service} />

        {/* About this service */}
        {showDescription ? (
          <View className="mt-8 rounded-[1rem] bg-white p-5 sm:p-7 md:p-8 shadow-sm">
            <Text className="text-[1.15rem] font-bold text-navy-900">About this service</Text>
            <Text className="mt-3 text-[0.95rem] leading-relaxed text-text-secondary">
              {service.description}
            </Text>
          </View>
        ) : null}

        {/* V Solve Assurance */}
        <ServiceAssurance service={service} onOpenFaq={scrollToFaqs} />

        {/* Verified Professionals */}
        <ServiceProfessionals service={service} />

        {/* What's Included / Not Included / Good to Know */}
        {otherPolicies.length > 0 ? (
          <View className="mt-8 rounded-[1rem] bg-white p-5 sm:p-7 md:p-8 shadow-sm">
            <PolicyList policies={otherPolicies} />
          </View>
        ) : null}

        {/* Related Services */}
        {relatedServices.length > 0 ? (
          <View className="mt-16">
            <View className="mb-6 flex-row items-center gap-3">
              <Text className="text-[1.35rem] font-bold tracking-tight text-navy-900 sm:text-[1.5rem]">
                Related Services
              </Text>
              <View className="h-px flex-1 bg-line/60" />
            </View>
            <View className={isDesktop ? "flex-row gap-4" : "gap-4"}>
              {relatedServices.map((relatedService, index) => (
                <RelatedServiceCard
                  key={relatedService.id}
                  service={relatedService}
                  categorySlug={category.slug}
                  index={index + 1}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Bottom Navigation Button */}
        <View className="mb-4 mt-12 items-center justify-center">
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/catalog/${category.slug}?tile=${service.subcategory_slug}` as never)}
            className="h-12 flex-row items-center justify-center gap-2 rounded-full border border-line/40 bg-white px-7 shadow-sm active:scale-95"
          >
            <Text className="text-[0.95rem] font-medium text-navy-900">←</Text>
            <Text className="text-[0.95rem] font-medium text-navy-900">
              More {categoryHeadline(category.name)} services
            </Text>
          </Pressable>
        </View>

        {/* How It Works */}
        {processSteps.length > 0 ? (
          <View className="mt-8 rounded-[1rem] bg-white p-4 sm:p-6 md:p-8 shadow-sm border border-[#ECE7E1]/80">
            <View className="flex-row items-center justify-between gap-3 pb-2 border-b border-line/40">
              <View className="flex-1">
                <Text className="text-[1.25rem] sm:text-[1.35rem] font-black text-navy-900 tracking-tight">
                  How it works
                </Text>
                <Text className="mt-1 text-sm text-text-secondary">
                  Step-by-step verified execution protocol for {service.name.toLowerCase()}
                </Text>
              </View>
              <View className="shrink-0 rounded-full bg-[#FFF0E5] px-3 py-1">
                <Text className="text-xs font-bold text-action">
                  {processSteps.length} Steps
                </Text>
              </View>
            </View>
            <ProcessSteps steps={processSteps} />
          </View>
        ) : null}

        {/* Frequently Asked Questions */}
        <View
          onLayout={(event) => {
            setFaqOffsetY(event.nativeEvent.layout.y);
          }}
        >
          <ServiceFaqSection faqs={faqs} />
        </View>
      </View>
    </ScrollView>
  );
}
