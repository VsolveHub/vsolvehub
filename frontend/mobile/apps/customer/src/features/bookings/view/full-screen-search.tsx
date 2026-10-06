// Ported from frontend/apps/customer/features/bookings/view/full-screen-search.tsx
import { Logo, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link } from "expo-router";
import LottieView from "lottie-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { Money } from "@/features/payment/view/money";

import type { BookingGroup } from "../queries";
import { heldUnitCount } from "./group-status";
import searchAnimationData from "./search-lottie.json";

const SEARCH_STEPS = [
  {
    title: "Finding your V Solve Hub partner…",
    desc: "Broadcasting service request to certified technicians nearby",
    step: 1,
  },
  {
    title: "Searching nearby professionals…",
    desc: "Scanning top-rated partners within 5 km of your address",
    step: 2,
  },
  {
    title: "Checking schedule & availability…",
    desc: "Confirming arrival window and verified equipment",
    step: 3,
  },
  {
    title: "Matching the best professional for you…",
    desc: "Selecting the highest-rated professional with 100% guarantee",
    step: 4,
  },
];

const VERIFICATION_CHECKS = [
  { label: "Background & Police Verification", status: "Verified" },
  { label: "Skill & Quality Certifications", status: "Checked" },
  { label: "Minimum 4.8★ Rating Filter", status: "Applied" },
  { label: "Tools & Equipment Readiness", status: "Confirmed" },
];

export function FullScreenPartnerSearch({ group }: { group: BookingGroup; onDismiss?: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const held = heldUnitCount(group);
  const total = group.units.length;
  const isAwaitingPayment =
    group.recovery_action === "PAYMENT_REQUIRED" ||
    group.status === "PAYMENT_PENDING" ||
    (group.status === "PARTIALLY_HELD" && held === total && total > 0);

  useEffect(() => {
    if (isAwaitingPayment) return;
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % SEARCH_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isAwaitingPayment]);

  const currency = group.units[0]?.total?.currency ?? "INR";
  const totalPaise = group.units.reduce((acc, unit) => acc + (unit.total?.amount_paise ?? 0), 0);
  const itemChargesPaise = group.units.reduce(
    (acc, unit) => acc + unit.lines.reduce((lineAcc, line) => lineAcc + (line.amount?.amount_paise ?? 0), 0),
    0,
  );
  const feeOrTaxPaise = Math.max(0, totalPaise - itemChargesPaise);
  const totalMoney = { amount_paise: totalPaise, currency };
  const feeOrTaxMoney = { amount_paise: feeOrTaxPaise, currency };
  const currentStep = SEARCH_STEPS[stepIndex] ?? SEARCH_STEPS[0];
  const serviceNames = group.units
    .flatMap((unit) => unit.lines.map((line) => line.label))
    .filter(Boolean)
    .join(", ");

  return (
    <ScrollView className="absolute inset-0 z-50 bg-white" contentContainerClassName="gap-6 p-4 pb-10">
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <Logo />
        <View
          className={`flex-row items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
            isAwaitingPayment ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50"
          }`}
        >
          <View className={`size-2 rounded-full ${isAwaitingPayment ? "bg-emerald-500" : "bg-orange-500"}`} />
          <Text className={`text-xs font-semibold ${isAwaitingPayment ? "text-emerald-700" : "text-orange-700"}`}>
            {isAwaitingPayment ? "Pros Held & Ready" : "Live Matching"}
          </Text>
        </View>
      </View>
      <Text className="text-xs text-slate-500">
        {isAwaitingPayment
          ? "All professionals confirmed · Complete payment to begin"
          : "Broadcasting request to nearby verified network"}
      </Text>

      {isAwaitingPayment ? (
        <View className="items-center">
          <View className="mb-5 size-20 items-center justify-center rounded-full border-4 border-white bg-emerald-500">
            <Text className="text-3xl text-white">✓</Text>
          </View>
          <Text className="mb-3 rounded-full border border-emerald-200 bg-emerald-100/80 px-3.5 py-1 text-xs font-bold text-emerald-800">
            Professionals Found & Held
          </Text>
          <Text className="text-center text-2xl font-extrabold tracking-tight text-slate-900">
            Please make payment to complete the process
          </Text>
          <Text className="mt-2 max-w-md text-center text-sm text-slate-600">
            All visits have been matched with top-rated certified professionals. Pay now to lock in your booking and unlock technician details.
          </Text>
        </View>
      ) : (
        <View className="items-center">
          <View className="mb-6 size-60 items-center justify-center">
            <View className="size-52 items-center justify-center overflow-hidden rounded-full border-2 border-orange-200/90 bg-white">
              <LottieView source={searchAnimationData} autoPlay loop style={{ width: 200, height: 200 }} />
            </View>
          </View>
          <Text className="mb-2 rounded-full border border-orange-200 bg-orange-100/80 px-3 py-1 text-xs font-semibold text-orange-800">
            Live partner search in progress
          </Text>
          <Text className="text-center text-2xl font-extrabold tracking-tight text-slate-900">{currentStep.title}</Text>
          <Text className="mt-1 max-w-md text-center text-sm text-slate-600">{currentStep.desc}</Text>
          <View className="flex-row items-center gap-2 pt-3">
            {SEARCH_STEPS.map((step, index) => (
              <View
                key={step.step}
                className={`h-1.5 rounded-full ${
                  index === stepIndex ? "w-8 bg-orange-600" : index < stepIndex ? "w-3 bg-emerald-500" : "w-3 bg-slate-200"
                }`}
              />
            ))}
          </View>
          {total > 1 ? (
            <Text className="pt-2 text-xs text-slate-500">
              <Text className="font-semibold text-slate-700">{held} / {total}</Text> partner slots reserved
            </Text>
          ) : null}
        </View>
      )}

      {isAwaitingPayment ? (
        <View className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-lg">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-3">
            <View>
              <Text className="text-sm font-bold text-slate-900">Payment Summary</Text>
              <Text className="mt-0.5 text-[11px] text-slate-500">
                {group.units.length} {group.units.length === 1 ? "visit" : "visits"} held & ready
              </Text>
            </View>
            <Text className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              Awaiting Payment
            </Text>
          </View>
          <View className="mt-3 gap-2 border-b border-slate-100 pb-3">
            <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Booked Services</Text>
            {group.units.flatMap((unit) => unit.lines).map((line) => (
              <View key={line.id} className="flex-row items-center justify-between">
                <Text className="text-xs text-slate-700">
                  {line.label}
                  {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                </Text>
                <Money value={line.amount} className="text-xs font-semibold tabular-nums text-slate-900" />
              </View>
            ))}
            {feeOrTaxPaise > 0 ? (
              <View className="flex-row items-center justify-between pt-1">
                <Text className="text-xs text-slate-500">Taxes & platform fee</Text>
                <Money value={feeOrTaxMoney} className="text-xs font-semibold tabular-nums text-slate-900" />
              </View>
            ) : null}
          </View>
          <View className="mt-3 flex-row items-baseline justify-between">
            <Text className="text-xs font-bold text-slate-700">Total Payable</Text>
            <Money value={totalMoney} className="text-xl font-extrabold text-slate-900" />
          </View>
          <Link href={`/bookings/${group.id}/pay`} asChild>
            <Pressable className={buttonStyles({ className: "mt-4 h-11 w-full justify-center bg-orange-600 shadow-lg" })}>
              <Text className="text-sm font-bold text-action-text">Pay Now →</Text>
            </Pressable>
          </Link>
          <View className="mt-4 gap-1.5 border-t border-slate-100 pt-3">
            <Text className="text-[11px] text-slate-500">🔒 256-bit Razorpay secured payment</Text>
            <Text className="text-[11px] text-slate-500">🛡️ 100% money back guarantee</Text>
          </View>
        </View>
      ) : (
        <View className="gap-3 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <View className="flex-row items-center justify-between border-b border-slate-100 pb-2.5">
            <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">Safety & Quality Standards</Text>
            <Text className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              100% Guaranteed
            </Text>
          </View>
          {VERIFICATION_CHECKS.map((check) => (
            <View key={check.label} className="flex-row items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <Text className="flex-1 text-xs font-medium text-slate-700">{check.label}</Text>
              <Text className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                ✓ {check.status}
              </Text>
            </View>
          ))}
          <Text className="mt-2 rounded-xl border border-orange-200/60 bg-orange-50/70 p-3 text-[11px] text-orange-900">
            🔒 Partner contact details unlock immediately upon payment.
          </Text>
        </View>
      )}

      <View className="gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <View className="flex-row items-center gap-3">
          <View className="size-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100">
            <Text className="text-lg">📍</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-slate-900" numberOfLines={1}>
              {serviceNames || "Service booking"}
            </Text>
            <Text className="text-xs text-slate-500" numberOfLines={1}>
              {group.units.length} {group.units.length === 1 ? "visit" : "visits"} · Verified partner matching
            </Text>
          </View>
        </View>
        <Text className="text-xs text-slate-500">✓ 100% money back guarantee</Text>
        <Text className="text-xs text-slate-500">✓ Background checked</Text>
      </View>
    </ScrollView>
  );
}
