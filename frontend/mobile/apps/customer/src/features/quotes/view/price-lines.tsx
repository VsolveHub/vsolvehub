// Ported from frontend/apps/customer/features/quotes/view/price-lines.tsx
import { cn, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

export interface PriceLineView {
  title: string;
  note: string | null;
  amountLabel: string;
  amountPaise: number | null;
}

const TRIVIAL_PAISE = 10_000;
const BARRED = 3;

export function PriceLines({
  lines,
  totalPaise,
}: {
  lines: readonly PriceLineView[];
  totalPaise: number;
}) {
  const [showTrivial, setShowTrivial] = useState(false);

  const sorted = [...lines].sort((a, b) => (b.amountPaise ?? -1) - (a.amountPaise ?? -1));
  const trivial = sorted.filter((line) => line.amountPaise !== null && line.amountPaise < TRIVIAL_PAISE);
  const significant = sorted.filter((line) => line.amountPaise === null || line.amountPaise >= TRIVIAL_PAISE);

  return (
    <View>
      <View>
        {significant.map((line, index) => (
          <Row key={`${line.title}-${index}`} line={line} totalPaise={totalPaise} withBar={index < BARRED} />
        ))}
      </View>

      {trivial.length > 0 ? (
        <View className="mt-2 border-t border-line pt-2">
          <Pressable
            accessibilityRole="button"
            onPress={() => setShowTrivial((current) => !current)}
            className="flex-row items-center gap-2 py-1.5"
          >
            <Text className={cn("text-sm text-text-secondary", showTrivial ? "rotate-90" : "")}>▸</Text>
            <Text className="text-sm font-semibold text-text-secondary">
              {trivial.length === 1
                ? `1 line under ₹100 (${trivial[0]!.amountLabel})`
                : `${trivial.length} lines under ₹100`}
            </Text>
          </Pressable>
          {showTrivial
            ? trivial.map((line, index) => (
                <Row key={`t-${line.title}-${index}`} line={line} totalPaise={totalPaise} withBar={false} />
              ))
            : null}
        </View>
      ) : null}

      <Text className="mt-3 text-xs text-text-muted">Every line is already inside the total above.</Text>
    </View>
  );
}

function Row({
  line,
  totalPaise,
  withBar,
}: {
  line: PriceLineView;
  totalPaise: number;
  withBar: boolean;
}) {
  const share =
    withBar && line.amountPaise !== null && totalPaise > 0
      ? Math.round((line.amountPaise / totalPaise) * 100)
      : null;

  return (
    <View className="border-b border-line py-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="font-semibold text-text">{line.title}</Text>
          {line.note !== null ? <Text className="text-sm text-text-secondary">{line.note}</Text> : null}
        </View>
        <Text className={cn("shrink-0 text-text", withBar ? "text-[17px] font-extrabold" : "font-semibold")}>
          {line.amountLabel}
        </Text>
      </View>
      {share !== null ? (
        <View className="mt-1.5 flex-row items-center gap-2">
          <View
            accessibilityLabel={`${share}% of the total`}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken"
          >
            <View className="h-full rounded-full bg-signal-500" style={{ width: `${share}%` }} />
          </View>
          <Text className="w-9 shrink-0 text-right text-xs font-bold text-text-muted">{share}%</Text>
        </View>
      ) : null}
    </View>
  );
}
