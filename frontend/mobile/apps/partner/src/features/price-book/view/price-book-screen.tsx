// Ported from frontend/apps/partner/features/price-book/view/price-book-screen.tsx
import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query/native";
import { Button, Card, Input, Text, formatMoney } from "@vsolve/mobile-ui";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";

import { AsyncSection, asyncStateFrom } from "@/components/async-section";

import { usePriceBook, useSetPriceBookRate } from "../queries";

type PriceBookItem = Schemas["PriceBookEntry"];
const LABOUR_GROUP = "Labour";
const UNGROUPED = "Other";

export function PriceBookScreen() {
  const priceBook = usePriceBook();
  const state = asyncStateFrom(priceBook, (data) => data.items);
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="px-4 py-6">
      <Text className="text-2xl font-bold text-text">Your rate card</Text>
      <Text className="mt-1 text-sm text-text-secondary">Set once. Every estimate fills in from here.</Text>
      <View className="mt-5">
        <AsyncSection
          state={state}
          label="Loading your rate card"
          onRetry={() => void priceBook.refetch()}
          isEmpty={(items) => items.length === 0}
          empty={
            <Card className="items-center gap-2 py-10">
              <Text className="text-base font-semibold text-text">No items to price yet</Text>
              <Text className="text-center text-sm text-text-secondary">
                We have not published a work-item catalog for your trade in your area yet. Nothing you quote is affected.
              </Text>
            </Card>
          }
        >
          {(items) => <PriceBookList items={items} />}
        </AsyncSection>
      </View>
    </ScrollView>
  );
}

export function groupByTrade(items: readonly PriceBookItem[]): { code: string; name: string; items: PriceBookItem[] }[] {
  const byTrade = new Map<string, { code: string; name: string; items: PriceBookItem[] }>();
  for (const item of items) {
    const code = item.trade_code || "other";
    const bucket = byTrade.get(code) ?? { code, name: item.trade_name || "Other", items: [] };
    bucket.items.push(item);
    byTrade.set(code, bucket);
  }
  return [...byTrade.values()];
}

export function groupByComposerTab(items: readonly PriceBookItem[]): { name: string; items: PriceBookItem[] }[] {
  const byGroup = new Map<string, PriceBookItem[]>();
  for (const item of items) {
    const name = item.work_item.group?.trim() || (item.work_item.unit === "day" ? LABOUR_GROUP : UNGROUPED);
    const bucket = byGroup.get(name) ?? [];
    bucket.push(item);
    byGroup.set(name, bucket);
  }
  const groups = [...byGroup.entries()].map(([name, groupItems]) => ({ name, items: groupItems }));
  const labour = groups.filter((group) => group.name === LABOUR_GROUP);
  return [...groups.filter((group) => group.name !== LABOUR_GROUP), ...labour];
}

function PriceBookList({ items }: { items: PriceBookItem[] }) {
  const trades = useMemo(() => groupByTrade(items), [items]);
  return (
    <View className="gap-6">
      {trades.map((trade) => (
        <View key={trade.code} className="gap-4">
          {trades.length > 1 ? <Text className="text-base font-extrabold text-text">{trade.name}</Text> : null}
          {groupByComposerTab(trade.items).map((group) => (
            <View key={`${trade.code}-${group.name}`} className="gap-2">
              <Text className="text-xs font-extrabold uppercase text-text-muted">{group.name}</Text>
              {group.items.map((item) => (
                <PriceBookRow key={item.work_item.id} item={item} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function PriceBookRow({ item }: { item: PriceBookItem }) {
  const setRate = useSetPriceBookRate();
  const [rupees, setRupees] = useState(
    item.partner_rate_paise === null
      ? item.reference_rate_paise === null
        ? ""
        : String(item.reference_rate_paise / 100)
      : String(item.partner_rate_paise / 100),
  );
  const parsed = Number.parseFloat(rupees);
  const canSave = rupees.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  return (
    <Card className="gap-2 p-4">
      <Text className="text-sm font-semibold text-text">{item.work_item.name}</Text>
      {item.floor_paise !== null && item.ceiling_paise !== null ? (
        <Text className="text-xs text-text-secondary">
          {formatMoney(item.floor_paise)} – {formatMoney(item.ceiling_paise)}
        </Text>
      ) : null}
      {item.is_default_rate ? <Text className="text-xs text-text-muted">City rate — tap to set yours</Text> : null}
      <Input value={rupees} onChangeText={setRupees} keyboardType="decimal-pad" />
      <Button
        disabled={!canSave || setRate.isPending}
        loading={setRate.isPending}
        loadingLabel="Saving"
        onPress={() => {
          if (!canSave) return;
          setRate.mutate({
            workItemId: item.work_item.id,
            ratePaise: Math.round(parsed * 100),
            isActive: true,
          });
        }}
      >
        Save rate
      </Button>
      {setRate.isError ? (
        <Text className="text-sm text-danger-text">{describeError(setRate.error, "mutation").message}</Text>
      ) : null}
    </Card>
  );
}
