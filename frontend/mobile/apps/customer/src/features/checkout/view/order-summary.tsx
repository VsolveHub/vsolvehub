// Ported from frontend/apps/customer/features/checkout/view/order-summary.tsx
import { Badge, Text, formatMoney } from "@vsolve/mobile-ui";
import { Image } from "expo-image";
import { View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { useServiceDetail } from "@/features/catalog/client-queries";
import type { Cart, GroupQuote, SchedulingGroup } from "../queries";

export interface OrderSummaryProps {
  cart: Cart;
  groups: readonly SchedulingGroup[];
  quote: GroupQuote | null;
}

export function OrderSummary({ cart, groups, quote }: OrderSummaryProps) {
  return (
    <View className="gap-4">
      {quote === null ? (
        <UnpricedSummary cart={cart} groups={groups} />
      ) : (
        <PricedSummary quote={quote} />
      )}
    </View>
  );
}

function PricingInfoIllustration() {
  return (
    <Svg width={40} height={40} viewBox="0 0 48 48" fill="none">
      <Circle cx={24} cy={24} r={22} fill="#EFF6FF" />
      <Circle cx={24} cy={18} r={7} fill="#BFDBFE" />
      <Path
        d="M12 38c2.5-6 7.5-9 12-9s9.5 3 12 9"
        stroke="#2563EB"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Rect x={30} y={28} width={10} height={8} rx={2} fill="#2563EB" fillOpacity={0.15} />
    </Svg>
  );
}

function ServiceItemRow({
  item,
}: {
  item: Cart["items"][number];
}) {
  const detail = useServiceDetail(item.service_slug);
  const imageUrl = detail.data?.cover?.url ?? "";

  return (
    <View className="flex-row items-center gap-3">
      <View className="size-14 items-center justify-center overflow-hidden rounded-xl bg-[#F4F1EC]">
        {imageUrl !== "" ? (
          <Image
            source={{ uri: imageUrl }}
            contentFit={
              imageUrl.includes("/Service Cover/") || imageUrl.includes("/Service%20Cover/")
                ? "contain"
                : "cover"
            }
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <View className="size-full items-center justify-center bg-surface-sunken">
            <Text className="text-xs font-bold text-text-muted">VS</Text>
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-text">{item.service_name}</Text>
        {item.variant_name ? (
          <Text className="mt-0.5 text-xs text-text-secondary">{item.variant_name}</Text>
        ) : null}
      </View>
      {item.quantity > 1 ? (
        <Text className="shrink-0 text-sm font-medium text-text-secondary">
          × {item.quantity}
        </Text>
      ) : null}
    </View>
  );
}

function UnpricedSummary({
  cart,
  groups,
}: {
  cart: Cart;
  groups: readonly SchedulingGroup[];
}) {
  const sections =
    groups.length > 0
      ? groups.map((g) => ({
          key: g.key,
          heading: g.label,
          note: g.estimated_duration_minutes
            ? `Approx. ${g.estimated_duration_minutes} mins`
            : null,
          items: cart.items.filter((item) => g.cart_item_ids.includes(item.id)),
        }))
      : [
          {
            key: "all",
            heading: "Your services",
            note: null,
            items: cart.items,
          },
        ];

  return (
    <View className="gap-4">
      {sections.map((section) => (
        <View
          key={section.key}
          className="rounded-2xl border border-line bg-surface p-5 shadow-xs"
        >
          <Text className="text-base font-bold text-text">{section.heading}</Text>
          {section.note ? (
            <Text className="mt-0.5 text-xs text-text-secondary">{section.note}</Text>
          ) : null}

          <View className="mt-3.5 border-t border-line/80 pt-3.5 gap-3">
            {section.items.map((item) => (
              <ServiceItemRow key={item.id} item={item} />
            ))}
          </View>
        </View>
      ))}

      {/* Pricing Note Card matching Image 1 */}
      <View className="flex-row items-start gap-3 rounded-2xl border border-line/60 bg-[#F4EFEA] p-4">
        <View className="mt-0.5 shrink-0">
          <PricingInfoIllustration />
        </View>
        <Text className="flex-1 text-xs leading-relaxed text-text-secondary">
          We work out the price once every visit has a time — it depends on how many
          professionals your booking needs.
        </Text>
      </View>
    </View>
  );
}

function PricedSummary({ quote }: { quote: GroupQuote }) {
  return (
    <View className="gap-4">
      {quote.units.map((unit, index) => (
        <View key={unit.id} className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="text-base font-bold text-text">
              Visit {index + 1} of {quote.units.length}
            </Text>
            <Text className="text-sm font-semibold tabular-nums text-text">
              {formatMoney(unit.total.amount_paise)}
            </Text>
          </View>

          <Text className="mt-0.5 text-xs text-text-secondary">
            {new Date(unit.starts_at).toLocaleString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
            {" · "}
            {unit.arrival_window_minutes} min arrival window
          </Text>

          <View className="mt-3.5 border-t border-line/80 pt-3.5 gap-2">
            {unit.lines.map((line) => (
              <View key={line.id} className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <Text className="text-sm text-text">
                    {line.label}
                    {line.quantity > 1 ? (
                      <Text className="text-text-secondary"> × {line.quantity}</Text>
                    ) : null}
                  </Text>
                </View>
                <Text className="shrink-0 text-sm tabular-nums text-text">
                  {formatMoney(line.amount.amount_paise)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      {/* Total bill card */}
      <View className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <View className="flex-row items-baseline justify-between gap-3">
          <Text className="text-base font-bold text-text">Total bill</Text>
          <Text className="text-xl font-bold tabular-nums text-text">
            {formatMoney(quote.total.amount_paise)}
          </Text>
        </View>
        <Text className="mt-1 text-xs text-text-secondary">Includes taxes and charges.</Text>

        {quote.units.length > 1 ? (
          <View className="mt-3.5 border-t border-line/80 pt-3.5 gap-2">
            {quote.units.map((unit, index) => (
              <View key={unit.id} className="flex-row justify-between">
                <Text className="text-xs text-text-secondary">Visit {index + 1}</Text>
                <Text className="text-xs font-medium tabular-nums text-text">
                  {formatMoney(unit.total.amount_paise)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
