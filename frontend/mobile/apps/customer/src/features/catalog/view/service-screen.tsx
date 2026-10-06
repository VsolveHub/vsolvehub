// Ported from frontend/apps/customer/app/(shop)/catalog/[category]/[service]/page.tsx
import { ApiRequestError } from "@vsolve/api-client";
import { Badge, Button, ErrorState, Skeleton, Text, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { useAddCartItem, useCart, useRemoveCartItem, useUpdateCartItem } from "@/features/checkout/queries";
import { useCategories, useCategoryServices, useServiceDetail, type ServiceCard, type ServiceDetail } from "@/features/catalog/client-queries";
import { recordViewed } from "@/features/catalog/recently-viewed";
import { serviceHref } from "@/features/catalog/service-href";
import { AddToCartButton } from "@/features/catalog/view/add-to-cart-button";
import { FitOutServicePicker } from "@/features/catalog/view/fit-out-picker";
import { ProcessSteps } from "@/features/catalog/view/process-steps";
import { bookCrewHref } from "@/lib/routes";

const A3_TIME_BLOCK = "A3_TIME_BLOCK";
const FIT_OUT_PICKER_SERVICE = "interior-fit-out-project";
const COVER_FALLBACK =
  "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=2070&auto=format&fit=crop";

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
    <View className="gap-4 px-4 pt-4">
      <Skeleton className="h-10 w-40 rounded-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="aspect-[4/3] w-full rounded-[1.25rem]" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-40 w-full rounded-[1rem]" />
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
    <View accessibilityLabel="Breadcrumb" className="flex-row flex-wrap items-center gap-1">
      {trail.map((crumb, index) => {
        const isCurrent = index === trail.length - 1;
        return (
          <View key={crumb.href} className="flex-row items-center gap-1">
            {index > 0 ? <Text className="text-sm text-text-muted">/</Text> : null}
            {isCurrent ? (
              <Text className="text-sm font-medium text-text">{crumb.label}</Text>
            ) : (
              <Pressable accessibilityRole="link" onPress={() => router.push(crumb.href as never)}>
                <Text className="text-sm text-text-secondary">{crumb.label}</Text>
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
  const groups = POLICY_GROUPS.map((group) => ({
    ...group,
    items: policies.filter((policy) => policy.kind === group.kind),
  })).filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <View className="gap-6">
      {groups.map((group) => (
        <View key={group.kind}>
          <Text className="text-sm font-bold uppercase tracking-[0.08em] text-text-secondary">{group.heading}</Text>
          <View className="mt-3 gap-2">
            {group.items.map((policy) => (
              <View key={policy.id} className="flex-row gap-2">
                <View className="mt-0.5">
                  <PolicyMark kind={group.kind} />
                </View>
                <Text className="flex-1 text-sm text-text">{policy.text}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function VariantList({ variants }: { variants: ServiceDetail["variants"] }) {
  const isChoice = variants.length > 1;
  return (
    <View className="mt-4 gap-4">
      {variants.map((variant) => (
        <View key={variant.id} className="flex-col justify-between gap-4 rounded-[0.75rem] bg-[#F4F2EE] p-5">
          <View className="min-w-0 flex-1">
            <Text className="text-[1.05rem] font-medium text-navy-900">{variant.name}</Text>
            {variant.description ? (
              <Text className="mt-2.5 text-[0.9rem] leading-relaxed text-text-secondary">{variant.description}</Text>
            ) : null}
            <Text className="mt-3.5 text-[0.85rem] italic text-text-muted/90">
              {variant.task_lines.length > 0
                ? `${variant.task_lines.length} task${variant.task_lines.length === 1 ? "" : "s"} you can choose from`
                : "Priced on booking"}
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0">
              <Text className="text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">Starts at</Text>
              <Text className="mt-0.5 text-[1.1rem] font-bold tabular-nums text-navy-900">
                {formatMoney(variant.starting_price.amount_paise)}
              </Text>
              {variant.minimum_service_subtotal.amount_paise > variant.starting_price.amount_paise ? (
                <Badge tone="neutral" className="mt-1">
                  {`Min ${formatMoney(variant.minimum_service_subtotal.amount_paise)}`}
                </Badge>
              ) : null}
            </View>
            {isChoice ? <AddToCartButton variantId={variant.id} size="compact" /> : null}
          </View>
        </View>
      ))}
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
  const isLarge = index === 0;
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

  const buttonHeight = isLarge ? "h-9" : "h-8";
  const textClass = isLarge ? "text-sm" : "text-xs";

  const action = cartItem ? (
    <View className={`${buttonHeight} flex-row items-center overflow-hidden rounded-full border border-action bg-white shadow-xs`}>
      <Pressable
        accessibilityRole="button"
        onPress={() => changeQuantity(-1)}
        disabled={updateItem.isPending || removeItem.isPending}
        className="h-full items-center justify-center px-3.5 disabled:opacity-50"
      >
        <Text className="text-base font-extrabold text-action">-</Text>
      </Pressable>
      <Text className={`${textClass} min-w-[20px] px-2 text-center font-black text-navy-900`}>{cartItem.quantity}</Text>
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
      className={`${buttonHeight} flex-row items-center justify-center rounded-full bg-action px-5 shadow-sm disabled:opacity-50`}
    >
      <Text className={`${textClass} font-bold text-white`}>{addItem.isPending ? "Adding..." : "Add"}</Text>
      {addItem.isPending ? null : <View className="ml-1.5"><PlusIcon /></View>}
    </Pressable>
  ) : (
    <View className={`${buttonHeight} flex-row items-center justify-center rounded-full bg-action px-5 shadow-sm`}>
      <Text className={`${textClass} font-bold text-white`}>Add</Text>
      <View className="ml-1.5">
        <PlusIcon />
      </View>
    </View>
  );

  const description =
    service.short_description ||
    (isLarge
      ? `Expert repair and installation for ${service.name}. Restores smooth functionality and ensures quality.`
      : "Complete service carried out at your address by a verified professional.");

  return (
    <View
      className={
        isLarge
          ? "min-h-[14rem] flex-col overflow-hidden rounded-card border border-transparent bg-white p-6 shadow-xl"
          : "min-h-[14rem] flex-col rounded-card border border-transparent bg-white p-5 shadow-sm"
      }
      style={{ elevation: isLarge ? 8 : 2 }}
    >
      <Pressable accessibilityRole="link" onPress={open} className="flex-1">
        <View className="mb-2 flex-row items-start justify-between gap-3">
          <Text className={isLarge ? "flex-1 text-[1.35rem] font-bold leading-snug text-navy-900" : "flex-1 text-[1.15rem] font-bold leading-snug text-navy-900"}>
            {service.name}
          </Text>
          {isLarge ? (
            <View className="size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
              <StrokeIcon d="M4 10h11m-4-4 4 4-4 4" size={16} color={MUTED} viewBox="0 0 20 20" />
            </View>
          ) : isPopular ? (
            <View className="rounded-full bg-[#FFF0E5] px-2.5 py-0.5">
              <Text className="text-[0.65rem] font-bold tracking-wide text-action">Popular</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={3} className={isLarge ? "mt-2 flex-1 text-sm leading-relaxed text-text-secondary" : "mt-2 flex-1 text-[0.925rem] leading-relaxed text-text-secondary"}>
          {description}
        </Text>
      </Pressable>
      <View className="mt-6 flex-row items-end justify-between gap-3 border-t border-line/50 pt-5">
        {service.starting_price !== null ? (
          <View className="min-w-0">
            <Text className="text-[0.65rem] font-bold uppercase tracking-wider text-text-muted">Starts at</Text>
            <Text className={isLarge ? "mt-1 text-[1.35rem] font-extrabold tabular-nums text-navy-900" : "mt-1 text-lg font-extrabold tabular-nums text-navy-900"}>
              {formatMoney(service.starting_price.amount_paise)}
            </Text>
          </View>
        ) : null}
        {action}
      </View>
    </View>
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
      ) : service.bookable_variant_id ? (
        <AddToCartButton variantId={service.bookable_variant_id} />
      ) : null}
    </View>
  );
}

export function ServiceScreen({ serviceSlug }: { serviceSlug: string }) {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string | string[] }>();
  const categorySlug = oneParam(params.category);
  const detail = useServiceDetail(serviceSlug);
  const categories = useCategories();
  const services = useCategoryServices(categorySlug.length > 0 ? categorySlug : null);
  const viewed = detail.data;
  const viewedCategory = viewed?.category_slug;
  useEffect(() => {
    if (!viewed || !viewedCategory) return;
    void recordViewed({
      slug: viewed.slug,
      name: viewed.name,
      href: `/catalog/${viewedCategory}/${viewed.slug}`,
    });
  }, [viewed, viewedCategory]);

  const retry = () => {
    void detail.refetch();
    void categories.refetch();
    void services.refetch();
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
  const coverUrl = service.cover?.url || COVER_FALLBACK;

  return (
    <ScrollView className="flex-1 bg-[#FAF9F7]" contentContainerClassName="px-4 pb-16 pt-4">
      <View className="mx-auto w-full max-w-[1216px]">
        <View className="mb-6">
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/catalog/${categorySlug || category.slug}?tile=${service.subcategory_slug}` as never)}
            className="flex-row items-center gap-2 self-start rounded-full border border-[#e7e2da] bg-white px-4 py-2.5 shadow-2xs"
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

        <Breadcrumbs
          trail={[
            { label: "Services", href: "/catalog" },
            { label: category.name, href: `/catalog/${category.slug}?tile=${service.subcategory_slug}` },
            { label: service.name, href: `/catalog/${categorySlug || category.slug}/${service.slug}` },
          ]}
        />

        <View className="mt-8 gap-8">
          <View className="w-full">
            <View className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.25rem] bg-surface-sunken shadow-sm" style={{ aspectRatio: 4 / 3 }}>
              <Image source={{ uri: coverUrl }} contentFit="cover" accessibilityLabel={service.cover?.alt_text ?? ""} style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }} />
            </View>
          </View>

          <View className="w-full pt-2">
            <Text className="text-[1.85rem] font-bold leading-tight text-navy-900">{service.name}</Text>
            <Text className="mt-4 text-[1rem] leading-relaxed text-text-secondary">{service.short_description}</Text>

            <View className="mt-8 rounded-[1rem] border border-transparent bg-white p-7 shadow-sm" style={{ elevation: 2 }}>
              {service.starting_price !== null ? (
                <>
                  <Text className="text-[0.7rem] font-bold uppercase tracking-wider text-text-muted">Starts at</Text>
                  <Text className="mt-1.5 text-2xl font-bold tabular-nums text-navy-900">
                    {formatMoney(service.starting_price.amount_paise)}
                  </Text>
                  <Text className="mt-4 text-[0.9rem] leading-relaxed text-text-secondary">
                    The exact price is confirmed before you pay, once you have told us what the job involves.
                  </Text>
                </>
              ) : (
                <Text className="text-[0.9rem] leading-relaxed text-text-secondary">
                  This work is priced per job. Tell us what you need and verified professionals will send you their own quotes — describing the job costs nothing.
                </Text>
              )}

              <View className="mt-7">
                <BookingActions service={service} />
              </View>

              <View className="mt-7 flex-row items-center justify-between gap-4 border-t border-line/60 pt-5">
                <View className="flex-row items-center gap-2.5">
                  <StrokeIcon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={18} />
                  <Text className="text-[0.875rem] font-medium text-text-secondary">Vetted Pros</Text>
                </View>
                <View className="flex-row items-center gap-2.5">
                  <StrokeIcon d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" size={18} />
                  <Text className="text-[0.875rem] font-medium text-text-secondary">Background Checked</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View className="mt-8 gap-8">
          <View className="w-full">
            {service.variants.length > 0 ? (
              <View className="rounded-[1rem] bg-white p-7 shadow-sm" style={{ elevation: 1 }}>
                <View className="mb-2 flex-row items-center gap-2.5">
                  <StrokeIcon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" size={18} />
                  <Text className="text-[1.05rem] font-medium text-navy-900">What you can book</Text>
                </View>
                <VariantList variants={service.variants} />
              </View>
            ) : service.description ? (
              <View className="rounded-[1rem] bg-white p-7 shadow-sm" style={{ elevation: 1 }}>
                <Text className="mb-4 text-[1.05rem] font-medium text-navy-900">About this service</Text>
                <Text className="text-[0.95rem] leading-relaxed text-text-secondary">{service.description}</Text>
              </View>
            ) : null}
          </View>

          <View className="w-full rounded-[1rem] bg-white p-7 shadow-sm" style={{ elevation: 1 }}>
            <View className="mb-6 flex-row items-center gap-2.5">
              <StrokeIcon d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" size={18} />
              <Text className="text-[1.05rem] font-medium text-navy-900">Why V Solve</Text>
            </View>
            <View className="gap-6">
              <View className="flex-row gap-4">
                <View className="size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                  <StrokeIcon d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" size={20} color={NAVY} strokeWidth={1.5} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-medium text-navy-900">Upfront Pricing</Text>
                  <Text className="mt-1 text-[0.875rem] leading-relaxed text-text-secondary">No hidden fees. Know the cost before work begins.</Text>
                </View>
              </View>
              <View className="flex-row gap-4">
                <View className="size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                  <StrokeIcon d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" size={20} color={NAVY} strokeWidth={1.5} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-medium text-navy-900">Verified Pros</Text>
                  <Text className="mt-1 text-[0.875rem] leading-relaxed text-text-secondary">Every technician undergoes strict background checks.</Text>
                </View>
              </View>
              <View className="flex-row gap-4">
                <View className="size-10 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                  <StrokeIcon d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" size={20} color={NAVY} strokeWidth={1.5} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="font-medium text-navy-900">Satisfaction Guaranteed</Text>
                  <Text className="mt-1 text-[0.875rem] leading-relaxed text-text-secondary">We stand by our work. Your satisfaction is our priority.</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {processSteps.length > 0 ? (
          <View className="mt-8 rounded-[1rem] bg-white p-8 shadow-sm" style={{ elevation: 1 }}>
            <View className="mb-2 items-center">
              <View className="flex-row items-center gap-2.5">
                <StrokeIcon d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" size={18} />
                <Text className="text-[1.05rem] font-medium text-navy-900">The V Solve Process</Text>
              </View>
            </View>
            <ProcessSteps steps={processSteps} />
          </View>
        ) : null}

        {otherPolicies.length > 0 ? (
          <View className="mt-8 rounded-[1rem] bg-white p-7 shadow-sm" style={{ elevation: 1 }}>
            <PolicyList policies={otherPolicies} />
          </View>
        ) : null}

        {relatedServices.length > 0 ? (
          <View className="mt-16">
            <View className="mb-8 flex-row items-center gap-3">
              <Text className="text-[1.5rem] font-bold tracking-tight text-navy-900">Related Services</Text>
              <View className="h-px flex-1 bg-line/60" />
            </View>
            <View className="gap-4">
              {relatedServices.map((relatedService, index) => (
                <RelatedServiceCard key={relatedService.id} service={relatedService} categorySlug={category.slug} index={index + 1} />
              ))}
            </View>
          </View>
        ) : null}

        <View className="mb-4 mt-12 items-center">
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/catalog/${category.slug}?tile=${service.subcategory_slug}` as never)}
            className="h-12 flex-row items-center justify-center gap-2 rounded-full border border-line/40 bg-white px-7 shadow-sm"
          >
            <Text className="text-[0.95rem] font-medium text-navy-900">←</Text>
            <Text className="text-[0.95rem] font-medium text-navy-900">More {category.name.toLowerCase()} services</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
