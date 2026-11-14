import { Text, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useAuthStore } from "@vsolve/mobile-core";

import { useCustomerCoins } from "@/features/account/queries";
import { resolveImageUrl } from "@/features/catalog/category-artwork";
import type { ServiceDetail } from "@/features/catalog/client-queries";
import { addsToServiceCopy } from "@/features/catalog/service-facts";
import type { ServiceFaq } from "@/features/catalog/service-faqs";
import { useIsDesktop } from "@/lib/responsive";

type Variant = ServiceDetail["variants"][number];

/**
 * "Know the difference" — each option with what makes it different.
 */
export function ServiceOptionDifferences({ service }: { service: ServiceDetail }) {
  const explained = service.variants.filter((variant) =>
    addsToServiceCopy(variant.description, service.short_description, service.description ?? ""),
  );
  if (explained.length < 2) return null;

  return (
    <View className="mt-8 rounded-[1rem] bg-white p-5 sm:p-7 md:p-8 shadow-sm">
      <Text className="text-[1.15rem] font-bold text-navy-900">
        Know the difference
      </Text>
      <View className="mt-5 gap-5 sm:flex-row sm:flex-wrap">
        {explained.map((variant) => (
          <OptionDifference key={variant.id} variant={variant} />
        ))}
      </View>
    </View>
  );
}

function OptionDifference({ variant }: { variant: Variant }) {
  const imageUrl = resolveImageUrl(variant.image_url);
  return (
    <View className="flex-row items-start gap-4 sm:w-[48%]">
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: 80, height: 80, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : (
        <View className="mt-1 size-9 shrink-0 items-center justify-center rounded-full bg-[#FFF0E5]">
          <Svg viewBox="0 0 20 20" width={16} height={16} fill="#f87000">
            <Path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </Svg>
        </View>
      )}
      <View className="min-w-0 flex-1">
        <Text className="text-[0.98rem] font-semibold text-navy-900">{variant.name}</Text>
        <Text className="mt-1 text-[0.9rem] leading-relaxed text-text-secondary">{variant.description}</Text>
      </View>
    </View>
  );
}

/**
 * Service assurance section.
 */
export function ServiceAssurance({
  service: _service,
  onOpenFaq,
}: {
  service: ServiceDetail;
  onOpenFaq?: () => void;
}) {
  const isDesktop = useIsDesktop();
  const tiles = [
    { title: "Prices known before you pay", icon: <PriceArt /> },
    { title: "Extra work only on your approval", icon: <ApprovalArt /> },
  ];

  return (
    <View className="mt-8 rounded-[1rem] bg-white p-5 sm:p-7 md:p-8 shadow-sm">
      <View className="flex-row items-center gap-2">
        <AssuranceMark />
        <Text className="text-[1.4rem] font-extrabold tracking-tight text-[#0E7C86] sm:text-[1.6rem]">
          vsolve assurance
        </Text>
      </View>

      <View className={isDesktop ? "mt-6 flex-row gap-3" : "mt-6 gap-3"}>
        {tiles.map((tile) => (
          <View
            key={tile.title}
            className={`min-h-[7rem] rounded-xl bg-[#F5F5F5] p-4 sm:min-h-[9.5rem] sm:p-5 ${
              isDesktop ? "flex-1 flex-col items-start justify-between" : "flex-row items-center gap-4"
            }`}
          >
            <View className="shrink-0">{tile.icon}</View>
            <Text className="min-w-0 text-[0.95rem] font-medium leading-[1.35] text-[#0F0F0F] sm:text-[1.05rem]">
              {tile.title}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenFaq}
        className="mt-4 min-h-14 flex-row items-center justify-between rounded-xl bg-[#F5F5F5] px-4 sm:px-5 active:bg-[#EBEBEB]"
      >
        <Text className="text-[0.95rem] font-medium text-[#0F0F0F] sm:text-[1rem]">
          How we protect your booking
        </Text>
        <Svg viewBox="0 0 20 20" width={20} height={20} fill="#0F0F0F">
          <Path
            fillRule="evenodd"
            d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
            clipRule="evenodd"
          />
        </Svg>
      </Pressable>
    </View>
  );
}

function AssuranceMark() {
  return (
    <Svg viewBox="0 0 32 32" width={30} height={30} fill="#0E7C86">
      <Path d="M4 15.5 7.6 12l5.2 5.1L24.4 5.6 28 9.1 12.8 24.2 4 15.5Z" />
      <Rect x="4" y="26" width="24" height="3.5" rx="1" />
    </Svg>
  );
}

function GuaranteeArt() {
  return (
    <Svg viewBox="0 0 48 48" width={38} height={38} fill="none">
      <Path
        stroke="#0F0F0F"
        strokeWidth={2.2}
        strokeLinejoin="round"
        d="M24 5 9 10.5v12.2c0 9.6 6.3 16.6 15 20.3 8.7-3.7 15-10.7 15-20.3V10.5L24 5Z"
      />
      <Path stroke="#0F0F0F" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" d="m17 24.5 5 5 9.5-10" />
    </Svg>
  );
}

function PriceArt() {
  return (
    <Svg viewBox="0 0 48 48" width={38} height={38} fill="none">
      <Rect x="4" y="12" width="40" height="24" rx="2" stroke="#0F0F0F" strokeWidth={2.2} />
      <Circle cx="24" cy="24" r="5.5" stroke="#0F0F0F" strokeWidth={2.2} />
      <Path
        stroke="#0F0F0F"
        strokeWidth={2.2}
        strokeLinecap="round"
        d="M4 18.5A6.5 6.5 0 0 0 10.5 12M37.5 12A6.5 6.5 0 0 0 44 18.5M44 29.5A6.5 6.5 0 0 0 37.5 36M10.5 36A6.5 6.5 0 0 0 4 29.5"
      />
    </Svg>
  );
}

function ApprovalArt() {
  return (
    <Svg viewBox="0 0 48 48" width={38} height={38} fill="none">
      <Path
        stroke="#0F0F0F"
        strokeWidth={2.2}
        strokeLinejoin="round"
        d="M11 5h26v36l-3.25-2.5L30.5 41l-3.25-2.5L24 41l-3.25-2.5L17.5 41l-3.25-2.5L11 41V5Z"
      />
      <Path stroke="#0F0F0F" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" d="m17 21 5 5 9-9.5" />
    </Svg>
  );
}

/**
 * Who turns up. ID verified, approved, rated.
 */
export function ServiceProfessionals({ service }: { service: ServiceDetail }) {
  const isDesktop = useIsDesktop();
  const facts = [
    "ID-verified before their first job",
    "Approved for this kind of work",
    "Rated by customers after their visits",
  ];

  const coverUrl = resolveImageUrl(
    service.cover?.url ||
    service.variants.find((v) => Boolean(v.image_url))?.image_url,
  );

  return (
    <View className="mt-8 flex-row overflow-hidden rounded-[1rem] bg-white shadow-sm">
      <View className="min-w-0 flex-1 p-5 sm:p-7 md:p-8">
        <Text className="text-[1.15rem] font-bold text-navy-900">
          Verified professionals
        </Text>
        <View className="mt-5 gap-4">
          {facts.map((fact) => (
            <View key={fact} className="flex-row items-center gap-3">
              <ShieldIcon />
              <Text className="text-[0.95rem] text-navy-900">{fact}</Text>
            </View>
          ))}
        </View>
      </View>
      {isDesktop && coverUrl ? (
        <View className="w-2/5 shrink-0 overflow-hidden">
          <Image
            source={{ uri: coverUrl }}
            contentFit="cover"
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      ) : null}
    </View>
  );
}

function ShieldIcon() {
  return (
    <Svg viewBox="0 0 24 24" width={22} height={22} fill="none">
      <Path
        stroke="#f87000"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"
      />
      <Path stroke="#f87000" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
    </Svg>
  );
}

/**
 * Frequently asked questions accordion.
 */
export function ServiceFaqSection({ faqs }: { faqs: ServiceFaq[] }) {
  const [openIndexes, setOpenIndexes] = useState<Record<number, boolean>>({ 0: true });

  if (faqs.length === 0) return null;

  const toggle = (index: number) => {
    setOpenIndexes((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <View className="mt-8 rounded-[1rem] bg-white p-5 sm:p-7 md:p-8 shadow-sm">
      <Text className="text-[1.15rem] font-bold text-navy-900">
        Frequently asked questions
      </Text>
      <View className="mt-4 divide-y divide-line/60 border-y border-line/60">
        {faqs.map((faq, index) => {
          const isOpen = Boolean(openIndexes[index]);
          return (
            <View key={faq.question} className="py-1">
              <Pressable
                accessibilityRole="button"
                onPress={() => toggle(index)}
                className="flex-row items-center justify-between py-3.5"
              >
                <Text className="flex-1 pr-4 text-[0.95rem] font-semibold text-navy-900">
                  {faq.question}
                </Text>
                <Svg
                  viewBox="0 0 20 20"
                  width={16}
                  height={16}
                  fill="#94a3b8"
                  style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
                >
                  <Path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </Svg>
              </Pressable>
              {isOpen ? (
                <Text className="pb-4 pr-8 text-[0.9rem] leading-relaxed text-text-secondary">
                  {faq.answer}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Offer banner with V Coins.
 */
export function ServiceOfferBanner({ imageUrl }: { imageUrl: string }) {
  const status = useAuthStore((state) => state.status);
  const signedIn = status === "signedIn";
  const coinsQuery = useCustomerCoins();
  const summary = signedIn ? coinsQuery.data : undefined;
  const policy = summary?.active_burn_policy;
  const coinValuePaise = policy?.coin_value_paise;
  const maxBurnPercent = policy?.max_burn_percent;

  if (
    !summary ||
    coinValuePaise === undefined ||
    maxBurnPercent === undefined ||
    summary.spendable_coins <= 0
  ) {
    return null;
  }

  const worthPaise = summary.spendable_coins * coinValuePaise;
  const resolvedImg = resolveImageUrl(imageUrl);

  return (
    <View className="mt-6 flex-row items-center justify-between gap-4 overflow-hidden rounded-[1rem] border border-[#CFE8D8] bg-[#F1F9F4] p-5 sm:p-6">
      <View className="min-w-0 flex-1">
        <Text className="text-[0.7rem] font-bold uppercase tracking-wider text-[#137333]">V Coins</Text>
        <Text className="mt-1 text-[1.25rem] font-bold leading-snug text-navy-900 sm:text-[1.4rem]">
          Pay up to {maxBurnPercent}% of this booking with V Coins
        </Text>
        <Text className="mt-2 text-[0.9rem] text-text-secondary">
          You have{" "}
          <Text className="font-semibold text-navy-900">
            {summary.spendable_coins.toLocaleString("en-IN")} coins
          </Text>{" "}
          worth {formatMoney(worthPaise)}. Choose to use them at payment.
        </Text>
      </View>
      {resolvedImg ? (
        <Image
          source={{ uri: resolvedImg }}
          style={{ width: 80, height: 80 }}
          contentFit="contain"
        />
      ) : null}
    </View>
  );
}

