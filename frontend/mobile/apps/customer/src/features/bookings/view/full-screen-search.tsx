// Ported from frontend/apps/customer/features/bookings/view/full-screen-search.tsx
import { Logo, Text, buttonStyles } from "@vsolve/mobile-ui";
import { Link, useRouter } from "expo-router";
import LottieView from "lottie-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronLeft } from "lucide-react-native";
import { Money } from "@/features/payment/view/money";
import { formatBookingWhen } from "./booking-format";
import { GroupStatusBadge } from "./group-status";
import { useIsDesktop } from "@/lib/responsive";

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

export function FullScreenPartnerSearch({ group, onDismiss }: { group: BookingGroup; onDismiss?: () => void }) {
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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
    .flatMap((unit) =>
      unit.lines.map((line) => {
        if (line.quantity > 0 && !line.label.toLowerCase().includes("fee") && !line.label.toLowerCase().includes("top-up")) {
          return `${line.label} x ${line.quantity}`;
        }
        return line.label;
      }),
    )
    .filter(Boolean)
    .join(", ");

  const handleBack = () => {
    if (onDismiss) {
      onDismiss();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/activity" as never);
    }
  };

  if (isDesktop) {
    return (
      <ScrollView className="flex-1 bg-[#FAF9F7]" contentContainerClassName="pb-16" showsVerticalScrollIndicator={true}>
        <View className="mx-auto w-full max-w-5xl px-4 pt-6">
          {/* Back to Bookings Pill Link matching Image 1 */}
          <Link href="/activity" asChild>
            <Pressable className="flex-row items-center gap-1.5 self-start rounded-lg border border-[#E5E7EB] bg-white px-3.5 py-1.5 shadow-2xs active:bg-[#F2EFE9] hover:bg-[#F2EFE9]">
              <ChevronLeft size={16} color="#0B1B3D" />
              <Text className="text-xs font-semibold text-[#0B1B3D]">Back to Bookings</Text>
            </Pressable>
          </Link>

          {/* Booking Summary Header Card matching Image 1 */}
          <View className="mt-4 rounded-2xl border border-[#F1EFEB] bg-white p-5 shadow-xs">
            <View className="flex-row items-start justify-between">
              <View>
                <Text className="text-2xl font-bold text-[#0B1B3D]">
                  {group.units.length} {group.units.length === 1 ? "visit" : "visits"}
                </Text>
                <Text className="mt-1 text-sm text-[#64748B]">
                  Booked {formatBookingWhen(group.created_at)}
                </Text>
              </View>
              <GroupStatusBadge group={group} />
            </View>
          </View>

          {/* Live Matching Card matching Image 1 */}
          <View className="relative mt-6 rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs overflow-hidden">
            {/* Ambient dot matrix pattern */}
            <View
              className="pointer-events-none absolute inset-0 opacity-[0.035]"
              style={
                Platform.OS === "web"
                  ? ({
                      backgroundImage: "radial-gradient(#0f172a 1px, transparent 1px)",
                      backgroundSize: "24px 24px",
                    } as any)
                  : undefined
              }
            />

            {/* Top Brand & Matching Indicator */}
            <View className="relative z-10 flex-row flex-wrap items-center gap-x-2 gap-y-1">
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
            <Text className="relative z-10 mt-1 text-xs text-slate-500">
              {isAwaitingPayment
                ? "All professionals confirmed · Complete payment to begin"
                : "Broadcasting request to nearby verified network"}
            </Text>

            {/* 2-Column Balanced Stage */}
            <View className="relative z-10 mt-8 flex-row items-center justify-between gap-8">
              {/* Left Column: Animation & Status */}
              <View className="flex-1 min-w-0 items-start">
                {isAwaitingPayment ? (
                  <>
                    <View className="mb-5 size-20 items-center justify-center rounded-full border-4 border-white bg-emerald-500 shadow-md">
                      <Text className="text-3xl text-white">✓</Text>
                    </View>
                    <View className="mb-3 rounded-full border border-emerald-200 bg-emerald-100/80 px-3.5 py-1">
                      <Text className="text-xs font-bold text-emerald-800">Professionals Found & Held</Text>
                    </View>
                    <Text className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0B1B3D]">
                      Please make payment to complete the process
                    </Text>
                    <Text className="mt-2 max-w-md text-sm text-[#64748B]">
                      All visits have been matched with top-rated certified professionals. Pay now to lock in your booking and unlock technician details.
                    </Text>
                  </>
                ) : (
                  <>
                    {/* Radar Animation Arena matching Image 1 */}
                    <View className="relative mb-6 size-60 items-center justify-center self-center lg:self-start">
                      <View className="absolute inset-0 rounded-full border border-orange-200/60 bg-orange-100/20" />
                      <View className="absolute inset-4 rounded-full border border-orange-200 bg-orange-50/60" />
                      <View className="relative z-10 size-52 items-center justify-center overflow-hidden rounded-full border-2 border-orange-200/90 bg-white shadow-xl">
                        <LottieView source={searchAnimationData} autoPlay loop style={{ width: 190, height: 190 }} />
                      </View>
                    </View>

                    <View className="mb-3 flex-row items-center gap-2 rounded-full border border-orange-200 bg-orange-100/80 px-3 py-1">
                      <View className="size-2 rounded-full bg-orange-600" />
                      <Text className="text-xs font-semibold text-orange-800">
                        Live partner search in progress
                      </Text>
                    </View>

                    <Text className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0B1B3D]">
                      {currentStep.title}
                    </Text>
                    <Text className="mt-1 max-w-md text-sm text-[#64748B]">
                      {currentStep.desc}
                    </Text>

                    {/* Step progress bars matching Image 1 */}
                    <View className="flex-row items-center gap-2 pt-3">
                      {SEARCH_STEPS.map((step, index) => (
                        <View
                          key={step.step}
                          className={`h-1.5 rounded-full ${
                            index === stepIndex
                              ? "w-8 bg-orange-600"
                              : index < stepIndex
                                ? "w-3 bg-emerald-500"
                                : "w-3 bg-slate-200"
                          }`}
                        />
                      ))}
                    </View>

                    {total > 1 ? (
                      <Text className="pt-2 text-xs text-slate-500">
                        <Text className="font-semibold text-slate-700">{held} / {total}</Text> partner slots reserved
                      </Text>
                    ) : null}
                  </>
                )}
              </View>

              {/* Right Column: Safety & Quality Standards Card OR Payment Summary */}
              <View className="w-[420px] shrink-0">
                {isAwaitingPayment ? (
                  <View className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
                    <View className="flex-row items-center justify-between border-b border-slate-100 pb-3">
                      <View>
                        <Text className="text-sm font-bold text-slate-900">Payment Summary</Text>
                        <Text className="mt-0.5 text-[11px] text-slate-500">
                          {group.units.length} {group.units.length === 1 ? "visit" : "visits"} held & ready
                        </Text>
                      </View>
                      <View className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-amber-700">Awaiting Payment</Text>
                      </View>
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
                      <Pressable className={buttonStyles({ className: "mt-4 h-11 w-full justify-center bg-orange-600 shadow-md" })}>
                        <Text className="text-sm font-bold text-action-text">Pay Now →</Text>
                      </Pressable>
                    </Link>

                    <View className="mt-4 gap-1.5 border-t border-slate-100 pt-3">
                      <Text className="text-[11px] text-slate-500">🔒 256-bit Razorpay secured payment</Text>
                      <Text className="text-[11px] text-slate-500">🛡️ 100% money back guarantee</Text>
                    </View>
                  </View>
                ) : (
                  <View className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs gap-3">
                    <View className="flex-row items-center justify-between border-b border-slate-100 pb-2.5">
                      <Text className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        SAFETY & QUALITY STANDARDS
                      </Text>
                      <View className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5">
                        <Text className="text-[11px] font-bold text-emerald-700">100% Guaranteed</Text>
                      </View>
                    </View>

                    <View className="gap-2.5">
                      {VERIFICATION_CHECKS.map((check) => (
                        <View key={check.label} className="flex-row items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <Text className="flex-1 text-xs font-medium text-slate-700">{check.label}</Text>
                          <View className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5">
                            <Text className="text-[11px] font-bold text-emerald-700">✓ {check.status}</Text>
                          </View>
                        </View>
                      ))}
                    </View>

                    <View className="mt-2 flex-row items-center gap-2 rounded-xl border border-orange-200/60 bg-orange-50/70 p-3">
                      <Text className="text-sm">🔒</Text>
                      <Text className="flex-1 text-[11px] text-orange-900 leading-snug">
                        Partner contact details unlock immediately upon payment.
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Clean Bottom Booking Summary Card matching Image 1 */}
          <View className="mt-6 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
            <View className="flex-row items-center gap-3 flex-1 min-w-0 mr-4">
              <View className="size-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 shrink-0">
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

            <View className="flex-row items-center gap-4 shrink-0">
              <View className="flex-row items-center gap-1.5">
                <Text className="text-xs font-bold text-emerald-600">✓</Text>
                <Text className="text-xs text-slate-500">100% money back guarantee</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Text className="text-xs font-bold text-emerald-600">✓</Text>
                <Text className="text-xs text-slate-500">Background checked</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="absolute inset-0 z-50 bg-white"
      contentContainerStyle={{
        paddingTop: Math.max(insets.top + 12, 32),
        paddingBottom: Math.max(insets.bottom + 24, 40),
        paddingHorizontal: 16,
      }}
      contentContainerClassName="gap-5"
    >
      {/* Top Back Action Button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to Bookings"
        onPress={handleBack}
        className="flex-row items-center gap-1.5 self-start rounded-full border border-slate-200 bg-slate-50/90 px-3.5 py-1.5 active:bg-slate-100"
      >
        <ChevronLeft size={16} color="#0B1B3D" />
        <Text className="text-xs font-bold text-[#0B1B3D]">Back to Bookings</Text>
      </Pressable>

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
