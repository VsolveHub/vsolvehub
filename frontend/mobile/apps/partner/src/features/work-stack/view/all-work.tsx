import { ChoiceChips, ErrorState, Spinner, Text } from "@vsolve/mobile-ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";

import { Pictogram } from "./pictogram";
import type { WorkItem, WorkUrgency } from "../model/work-item";
import { useWorkStack } from "../queries";
import { WorkCard } from "./work-home";

const SECTIONS: readonly { readonly title: string; readonly urgencies: readonly WorkUrgency[] }[] = [
  { title: "Needs you", urgencies: ["live", "needs_price"] },
  { title: "In hand", urgencies: ["doing"] },
  { title: "Waiting on the customer", urgencies: ["answered"] },
  { title: "Done", urgencies: ["settled", "not_chosen", "closed"] },
];

const FILTERS: readonly {
  readonly value: string;
  readonly label: string;
  readonly urgencies: readonly WorkUrgency[] | null;
}[] = [
  { value: "all", label: "All", urgencies: null },
  { value: "offers", label: "Offers", urgencies: ["live"] },
  { value: "enquiries", label: "Enquiries", urgencies: ["needs_price"] },
  { value: "in_progress", label: "In progress", urgencies: ["doing"] },
  { value: "waiting", label: "Waiting", urgencies: ["answered"] },
  { value: "done", label: "Done", urgencies: ["settled", "closed", "not_chosen"] },
];

const FILTER_STORAGE_KEY = "vsolve.partner.work-all.filter";

export function AllWork() {
  const stack = useWorkStack();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    void AsyncStorage.getItem(FILTER_STORAGE_KEY).then((stored) => {
      if (stored && FILTERS.some((option) => option.value === stored)) setFilter(stored);
    });
  }, []);

  const activeFilter = FILTERS.find((option) => option.value === filter) ?? FILTERS[0]!;

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-row items-center gap-3 border-b border-line bg-surface px-4 py-3.5">
        <Text className="flex-1 text-[1.0625rem] font-bold text-text">All your work</Text>
        {stack.isPending || stack.error ? null : (
          <Text className="text-[0.8125rem] font-bold text-text-muted">{stack.items.length}</Text>
        )}
      </View>
      <View className="border-b border-line bg-surface px-4 py-3">
        <FilterRow
          stack={stack}
          value={filter}
          onChange={(next) => {
            setFilter(next);
            void AsyncStorage.setItem(FILTER_STORAGE_KEY, next);
          }}
        />
      </View>
      <ScrollView contentContainerClassName="gap-5 px-4 pb-8 pt-4">
        <Body stack={stack} filter={activeFilter} />
      </ScrollView>
    </View>
  );
}

function FilterRow({
  stack,
  value,
  onChange,
}: {
  stack: ReturnType<typeof useWorkStack>;
  value: string;
  onChange: (value: string) => void;
}) {
  const known = stack.isPending || stack.error ? null : stack.items;
  return (
    <ChoiceChips
      label="Filter your work"
      name="work-filter"
      layout="wrap"
      value={value}
      onChange={onChange}
      options={FILTERS.map((option) => ({
        value: option.value,
        label: known === null ? option.label : `${option.label} · ${countFor(known, option.urgencies)}`,
      }))}
    />
  );
}

function countFor(items: readonly WorkItem[], urgencies: readonly WorkUrgency[] | null): number {
  if (urgencies === null) return items.length;
  return items.filter((item) => urgencies.includes(item.urgency)).length;
}

function Body({
  stack,
  filter,
}: {
  stack: ReturnType<typeof useWorkStack>;
  filter: (typeof FILTERS)[number];
}) {
  if (stack.isPending) {
    return (
      <View className="flex-row items-center justify-center gap-2 py-16">
        <Spinner size="sm" />
        <Text className="text-text-secondary">Loading your work…</Text>
      </View>
    );
  }
  if (stack.error) {
    return (
      <ErrorState
        title="We could not load your work"
        message="Nothing has changed. Check your connection and try again."
        actionLabel="Try again"
        onAction={() => stack.refetch()}
      />
    );
  }
  const filterUrgencies = filter.urgencies;
  const items =
    filterUrgencies === null
      ? stack.items
      : stack.items.filter((item) => filterUrgencies.includes(item.urgency));
  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 py-16">
        <View className="size-32 items-center justify-center rounded-full bg-surface-sunken">
          <Pictogram name="papers" size="lg" className="text-warm-400" />
        </View>
        <Text className="text-center text-base font-semibold text-text-secondary">
          {filter.value === "all" ? "Nothing here yet" : `Nothing here — ${filter.label}`}
        </Text>
      </View>
    );
  }
  return (
    <View className="gap-5">
      {SECTIONS.map((section) => {
        const sectionItems = items.filter((item) => section.urgencies.includes(item.urgency));
        if (sectionItems.length === 0) return null;
        return (
          <View key={section.title} className="gap-2.5">
            <View className="flex-row items-baseline justify-between">
              <Text className="text-[0.6875rem] font-bold uppercase tracking-wide text-text-muted">
                {section.title}
              </Text>
              <Text className="text-[0.6875rem] font-bold text-text-muted">{sectionItems.length}</Text>
            </View>
            {sectionItems.map((item) => (
              <WorkCard key={item.key} item={item} />
            ))}
          </View>
        );
      })}
    </View>
  );
}
