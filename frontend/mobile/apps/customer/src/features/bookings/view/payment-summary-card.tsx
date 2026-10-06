// Ported from frontend/apps/customer/features/bookings/view/payment-summary-card.tsx
import { Dialog, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Money } from "@/features/payment/view/money";

import type { BookingGroup } from "../queries";
import { GroupStatusBadge } from "./group-status";

function formatWhen(instant: string): string {
  return new Date(instant).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function totals(group: BookingGroup) {
  const currency = group.units[0]?.total?.currency ?? "INR";
  const totalPaise = group.units.reduce((acc, unit) => acc + (unit.total?.amount_paise ?? 0), 0);
  const itemChargesPaise = group.units.reduce(
    (acc, unit) => acc + unit.lines.reduce((lineAcc, line) => lineAcc + (line.amount?.amount_paise ?? 0), 0),
    0,
  );
  const feeOrTaxPaise = Math.max(0, totalPaise - itemChargesPaise);
  return {
    totalMoney: { amount_paise: totalPaise, currency },
    feeOrTaxMoney: { amount_paise: feeOrTaxPaise, currency },
    feeOrTaxPaise,
  };
}

export function PaymentSummarySideCard({ group }: { group: BookingGroup }) {
  const { totalMoney, feeOrTaxMoney, feeOrTaxPaise } = totals(group);
  return (
    <View className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <View className="flex-row items-start justify-between gap-3 border-b border-line pb-4">
        <View>
          <Text className="text-xl font-bold text-text">
            {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
          </Text>
          <Text className="mt-0.5 text-xs text-text-secondary">Booked {formatWhen(group.created_at)}</Text>
        </View>
        <GroupStatusBadge group={group} />
      </View>
      <Text className="mt-4 rounded-xl bg-surface-sunken p-3 text-xs leading-relaxed text-text">
        Every visit has a professional. Payment is the last step.
      </Text>
      <View className="mt-4 gap-3 border-b border-line pb-4">
        <Text className="text-xs font-bold uppercase tracking-wider text-text-secondary">Booked Services</Text>
        {group.units.map((unit, index) => (
          <View key={unit.id} className="gap-1.5 rounded-xl border border-line/60 bg-surface-sunken/60 p-3">
            {group.units.length > 1 ? (
              <View className="flex-row items-center justify-between border-b border-line/40 pb-1.5">
                <Text className="text-xs font-semibold text-action">Visit {index + 1}</Text>
                <Text className="text-[11px] text-text-secondary">{unit.arrival_window_minutes} min window</Text>
              </View>
            ) : null}
            {unit.lines.map((line) => (
              <View key={line.id} className="flex-row items-start justify-between gap-2">
                <Text className="text-xs font-medium text-text">
                  {line.label}
                  {line.quantity > 1 ? <Text className="font-normal text-text-secondary"> × {line.quantity}</Text> : null}
                </Text>
                <Money value={line.amount} className="shrink-0 text-xs font-semibold tabular-nums text-text" />
              </View>
            ))}
          </View>
        ))}
        {feeOrTaxPaise > 0 ? (
          <View className="flex-row items-center justify-between px-1">
            <Text className="text-xs text-text-secondary">Taxes & platform fee</Text>
            <Money value={feeOrTaxMoney} className="text-xs font-medium tabular-nums text-text" />
          </View>
        ) : null}
      </View>
      <View className="mt-4 flex-row items-baseline justify-between px-1">
        <Text className="text-sm font-bold text-text">Total Payable</Text>
        <Money value={totalMoney} className="text-2xl font-extrabold text-navy-900" />
      </View>
      <Link href={`/bookings/${group.id}/pay`} asChild>
        <Pressable className={buttonStyles({ className: "mt-5 h-12 w-full justify-center bg-orange-600 shadow-lg" })}>
          <Text className="text-base font-bold text-action-text">Pay Now →</Text>
        </Pressable>
      </Link>
      <View className="mt-5 gap-2 border-t border-line/60 pt-4">
        <Text className="text-[11px] text-text-secondary">🔒 256-bit Razorpay secured payment</Text>
        <Text className="text-[11px] text-text-secondary">🛡️ 100% money back guarantee on cancellation</Text>
        <Text className="text-[11px] text-text-secondary">✓ Real partner details unlocked immediately</Text>
      </View>
    </View>
  );
}

export function MobilePaymentBottomBar({ group }: { group: BookingGroup }) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { totalMoney, feeOrTaxMoney, feeOrTaxPaise } = totals(group);

  return (
    <>
      <View
        className="border-t border-line bg-white px-4 pt-3.5 shadow-lg"
        style={{ paddingBottom: Math.max(12, insets.bottom) }}
      >
        <View className="flex-row items-center justify-between gap-4">
          <Pressable accessibilityRole="button" onPress={() => setIsDetailsOpen(true)} className="min-w-0">
            <View className="flex-row items-baseline gap-1.5">
              <Money value={totalMoney} className="text-xl font-black text-navy-900" />
              <Text className="text-xs font-semibold text-action">View details ℹ️</Text>
            </View>
            <Text className="text-[11px] text-text-secondary" numberOfLines={1}>
              {group.units.length} {group.units.length === 1 ? "visit" : "visits"} · Ready to pay
            </Text>
          </Pressable>
          <Link href={`/bookings/${group.id}/pay`} asChild>
            <Pressable className={buttonStyles({ className: "shrink-0 bg-orange-600 px-6 shadow-lg" })}>
              <Text className="text-sm font-bold text-action-text">Pay Now →</Text>
            </Pressable>
          </Link>
        </View>
      </View>
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen} title="Payment Breakdown">
        <View className="gap-4">
          <View className="gap-2 border-b border-line pb-3">
            {group.units.map((unit, index) => (
              <View key={unit.id} className="gap-1">
                {group.units.length > 1 ? (
                  <Text className="text-xs font-semibold text-action">Visit {index + 1}</Text>
                ) : null}
                {unit.lines.map((line) => (
                  <View key={line.id} className="flex-row items-center justify-between">
                    <Text className="text-xs text-text">
                      {line.label}
                      {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    </Text>
                    <Money value={line.amount} className="text-xs font-semibold tabular-nums text-text" />
                  </View>
                ))}
              </View>
            ))}
            {feeOrTaxPaise > 0 ? (
              <View className="flex-row items-center justify-between border-t border-line/40 pt-1">
                <Text className="text-xs text-text-secondary">Taxes & platform fees</Text>
                <Money value={feeOrTaxMoney} className="text-xs font-semibold text-text" />
              </View>
            ) : null}
          </View>
          <View className="flex-row items-baseline justify-between">
            <Text className="text-sm font-bold text-text">Total Payable</Text>
            <Money value={totalMoney} className="text-xl font-extrabold text-navy-900" />
          </View>
          <Link href={`/bookings/${group.id}/pay`} asChild>
            <Pressable className={buttonStyles({ className: "w-full justify-center bg-orange-600" })}>
              <Text className="text-base font-bold text-action-text">Proceed to Pay →</Text>
            </Pressable>
          </Link>
        </View>
      </Dialog>
    </>
  );
}
