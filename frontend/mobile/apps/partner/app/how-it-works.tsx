import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  HelpCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react-native";
import { useState } from "react";
import {
  LayoutAnimation,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, StatusBar } from "react-native";
import { MarketingHeader } from "../src/components/marketing-header";
import { MarketingFooter } from "../src/components/marketing-footer";

const DETAILED_STEPS = [
  {
    step: "01",
    title: "Quick Registration & Profile Creation",
    duration: "Takes ~5 Mins",
    badgeBg: "bg-orange-50 border-orange-200 text-orange-700",
    color: "#f87000",
    icon: Smartphone,
    desc: "Enter your 10-digit mobile number, verify with an instant OTP, and tell us your name, primary craft, and years of field experience.",
    highlights: [
      "No registration or onboarding fees",
      "Choose from 10+ core trade specialties",
      "Set your primary base location and service radius",
    ],
  },
  {
    step: "02",
    title: "Document Verification & KYC Approval",
    duration: "Within 24 Hours",
    badgeBg: "bg-amber-50 border-amber-200 text-amber-800",
    color: "#d97706",
    icon: ShieldCheck,
    desc: "Upload a government-issued photo ID (Aadhaar Card, Voter ID, Driving Licence, or Passport) and bank details for automated weekly settlements.",
    highlights: [
      "Fast 24-hour verification desk",
      "Bank-grade encrypted document storage",
      "Instant SMS confirmation upon approval",
    ],
  },
  {
    step: "03",
    title: "Set Working Hours & Service Zones",
    duration: "Flexible Any Time",
    badgeBg: "bg-sky-50 border-sky-200 text-sky-800",
    color: "#0284c7",
    icon: CalendarClock,
    desc: "Choose exactly which days and shift hours you want to work. Select your preferred local neighborhoods across Telangana and toggle duty online.",
    highlights: [
      "Zero mandatory minimum working hours",
      "Accept jobs near your home or neighborhood",
      "Turn duty ON / OFF whenever you need a break",
    ],
  },
  {
    step: "04",
    title: "Accept Jobs & Receive Guaranteed Weekly Payouts",
    duration: "Every Monday",
    badgeBg: "bg-emerald-50 border-emerald-200 text-emerald-800",
    color: "#059669",
    icon: Banknote,
    desc: "Receive real-time job offers with upfront pricing, turn-by-turn navigation, and customer details. Get full earnings directly into your bank or UPI.",
    highlights: [
      "Upfront pricing with 0% hidden deductions",
      "Automated Monday settlements directly to bank",
      "100% tips and customer bonuses go directly to you",
    ],
  },
];

const REQUIREMENTS = [
  {
    title: "Government Photo ID",
    desc: "Aadhaar card, Voter ID, Passport, or PAN card for identity verification.",
    icon: FileText,
  },
  {
    title: "Active Bank Account or UPI",
    desc: "Savings account or UPI ID in your name for automated weekly direct deposits.",
    icon: Banknote,
  },
  {
    title: "Smartphone with Internet",
    desc: "Android or iOS smartphone to receive job requests, customer addresses, and navigation.",
    icon: Smartphone,
  },
  {
    title: "Professional Trade Experience",
    desc: "Basic hands-on skill and appropriate tools for your selected craft specialty.",
    icon: CheckCircle2,
  },
];

const FAQS = [
  {
    q: "How long does it take for my partner application to be approved?",
    a: "Most partner applications are reviewed and approved within 24 hours of document submission. You will receive an SMS and WhatsApp notification once your account is live.",
  },
  {
    q: "Is there any upfront security deposit or joining fee?",
    a: "No. Joining V Solve Hub is 100% free with zero registration fees and zero deposit. You keep the lion's share of every job you complete.",
  },
  {
    q: "Can I do jobs part-time or on weekends only?",
    a: "Yes! You have complete freedom to choose your shift hours. Work full-time, part-time, or only on weekends depending on your availability.",
  },
  {
    q: "When and how are payouts transferred?",
    a: "Payouts are transferred directly into your bank account or UPI ID every Monday. You can track your daily earnings and completed jobs in real-time.",
  },
];

export default function HowItWorksScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : (StatusBar.currentHeight ?? 16));
  const heroPaddingTop = isDesktop ? 128 : topInset + 80;
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (idx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenFaq((prev) => (prev === idx ? null : idx));
  };

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-0">
      <MarketingHeader activeTab="how-it-works" />

      {/* Hero Header */}
      <View className="px-5 pb-8 sm:pb-14" style={{ paddingTop: heroPaddingTop }}>
        <View className="mx-auto w-full max-w-4xl items-center text-center">
          <View className="flex-row items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 border border-orange-200 shadow-xs">
            <Sparkles size={14} color="#ea580c" />
            <Text className="text-xs font-extrabold text-[#ea580c]">
              Simple 4-Step Journey
            </Text>
          </View>

          <Text
            style={{
              fontSize: isDesktop ? 48 : 32,
              fontWeight: "900",
              lineHeight: isDesktop ? 56 : 38,
              letterSpacing: -1,
              marginTop: 16,
              color: "#00112e",
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            }}
            className="text-center"
          >
            How Becoming a Partner Works
          </Text>

          <Text
            style={{
              fontSize: isDesktop ? 18 : 15,
              lineHeight: isDesktop ? 28 : 24,
              marginTop: 12,
              color: "#64748b",
              maxWidth: 620,
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            }}
            className="text-center"
          >
            From registration to your first direct bank payout in four straightforward steps. Zero joining fee and zero complicated paperwork.
          </Text>

          {/* Action Buttons */}
          <View
            className={
              isDesktop
                ? "mt-8 flex-row items-center justify-center gap-4"
                : "mt-8 w-full max-w-sm gap-3"
            }
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/apply")}
              className={`flex-row items-center justify-center gap-2 rounded-full bg-[#f87000] active:bg-[#ea580c] shadow-lg shadow-orange-500/25 ${
                isDesktop ? "px-8 py-3.5" : "h-12 w-full"
              }`}
            >
              <Text className="text-sm font-extrabold text-white">Start Partner Application</Text>
              <ArrowRight size={16} color="#ffffff" />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/benefits")}
              className={`items-center justify-center rounded-full border border-slate-300 bg-white active:bg-slate-50 shadow-xs ${
                isDesktop ? "px-7 py-3.5" : "h-12 w-full"
              }`}
            >
              <Text className="text-sm font-bold text-navy-900">View Payout Rates</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* 4 Detailed Step Cards */}
      <View className="px-5 py-8 sm:py-12">
        <View className="mx-auto w-full max-w-5xl gap-6">
          {DETAILED_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <View
                key={step.step}
                className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-9 shadow-xs"
              >
                <View className={isDesktop ? "flex-row items-start gap-6" : "flex-col gap-4"}>
                  <View
                    style={{ backgroundColor: step.color }}
                    className="h-14 w-14 items-center justify-center rounded-2xl shadow-md shrink-0"
                  >
                    <Icon size={28} color="#ffffff" />
                  </View>

                  <View className="flex-1">
                    <View className="flex-row flex-wrap items-center gap-3">
                      <Text className="text-xs font-black uppercase tracking-widest text-slate-400">
                        STEP {step.step}
                      </Text>
                      <View className={`rounded-full px-3 py-0.5 border ${step.badgeBg}`}>
                        <Text className="text-[11px] font-extrabold">{step.duration}</Text>
                      </View>
                    </View>

                    <Text className="mt-2 text-xl sm:text-2xl font-bold text-navy-900">
                      {step.title}
                    </Text>
                    <Text className="mt-2.5 text-sm sm:text-base leading-relaxed text-slate-600 max-w-2xl">
                      {step.desc}
                    </Text>

                    {/* Highlights list */}
                    <View className="mt-5 gap-2.5">
                      {step.highlights.map((h) => (
                        <View key={h} className="flex-row items-center gap-2.5">
                          <CheckCircle2 size={16} color="#059669" />
                          <Text className="text-xs sm:text-sm font-semibold text-navy-900">
                            {h}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* What You Need to Join */}
      <View className="px-5 py-16 sm:py-20 bg-slate-50/70 border-t border-slate-200">
        <View className="mx-auto w-full max-w-5xl">
          <View className="items-center text-center max-w-xl mx-auto">
            <View className="rounded-full bg-slate-200/70 px-3.5 py-1 border border-slate-300">
              <Text className="text-xs font-extrabold text-navy-900">Requirements</Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 34 : 26,
                fontWeight: "900",
                lineHeight: isDesktop ? 40 : 32,
                letterSpacing: -0.5,
                marginTop: 12,
                color: "#00112e",
                fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
              }}
              className="text-center"
            >
              What You Need to Join
            </Text>
            <Text className="mt-2 text-sm text-slate-600 text-center">
              Keep these simple requirements handy to complete your registration in minutes.
            </Text>
          </View>

          <View className={isDesktop ? "mt-12 flex-row gap-5" : "mt-8 gap-4"}>
            {REQUIREMENTS.map((r) => {
              const Icon = r.icon;
              return (
                <View
                  key={r.title}
                  className={`rounded-2xl bg-white border border-slate-200 p-5 shadow-xs ${
                    isDesktop ? "flex-1" : "w-full"
                  }`}
                >
                  <View className="h-10 w-10 items-center justify-center rounded-xl bg-slate-100 border border-slate-200">
                    <Icon size={20} color="#00112e" />
                  </View>
                  <Text className="mt-4 text-base font-bold text-navy-900">{r.title}</Text>
                  <Text className="mt-1.5 text-xs text-slate-600 leading-relaxed">{r.desc}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Questions About the Process? Accordion */}
      <View className="px-5 py-16 sm:py-24 bg-white border-t border-slate-200">
        <View className="mx-auto w-full max-w-3xl items-center">
          <View className="items-center text-center">
            <View className="flex-row items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1 border border-slate-200">
              <HelpCircle size={14} color="#00112e" />
              <Text className="text-xs font-extrabold text-navy-900">
                Frequently Asked Questions
              </Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 34 : 26,
                fontWeight: "900",
                lineHeight: isDesktop ? 40 : 32,
                letterSpacing: -0.5,
                marginTop: 12,
                color: "#00112e",
                fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
              }}
              className="text-center"
            >
              Questions About the Process?
            </Text>
          </View>

          <View className="mt-10 gap-3 w-full">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <View
                  key={faq.q}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs"
                >
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => toggleFaq(idx)}
                    className="flex-row items-center justify-between p-5 active:bg-slate-50"
                  >
                    <Text className="text-sm font-bold text-navy-900 flex-1 pr-3">{faq.q}</Text>
                    {isOpen ? (
                      <ChevronUp size={18} color="#64748b" />
                    ) : (
                      <ChevronDown size={18} color="#64748b" />
                    )}
                  </Pressable>
                  {isOpen ? (
                    <View className="px-5 pb-5 pt-1 border-t border-slate-100">
                      <Text className="text-xs sm:text-sm leading-relaxed text-slate-600">{faq.a}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* Bottom CTA Banner */}
      <View className="px-5 pb-20 sm:px-8">
        <LinearGradient
          colors={["#00112e", "#001f54", "#00112e"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 32,
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.12)",
            paddingVertical: isDesktop ? 56 : 40,
            paddingHorizontal: isDesktop ? 48 : 24,
            alignItems: "center",
            shadowColor: "rgba(0, 0, 0, 0.3)",
            shadowOffset: { width: 0, height: 25 },
            shadowOpacity: 1,
            shadowRadius: 50,
            elevation: 12,
            overflow: "hidden",
          }}
          className="mx-auto w-full max-w-5xl items-center text-center"
        >
          <Text
            style={{
              fontSize: isDesktop ? 36 : 24,
              fontWeight: "900",
              lineHeight: isDesktop ? 44 : 32,
              letterSpacing: -0.5,
              color: "#ffffff",
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            }}
            className="text-center"
          >
            Ready to Take Control of Your Earnings?
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 24,
              marginTop: 10,
              color: "#cbd5e1",
              maxWidth: 540,
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            }}
            className="text-center"
          >
            Apply today to become a verified service partner in Hyderabad with weekly direct bank payouts.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className="mt-8 flex-row items-center justify-center gap-2 rounded-full bg-[#f87000] active:bg-[#ea580c] px-8 py-3.5 shadow-xl shadow-orange-600/30"
          >
            <Text className="text-sm font-extrabold text-white">Apply as a Partner Now</Text>
            <ArrowRight size={16} color="#ffffff" />
          </Pressable>
        </LinearGradient>
      </View>

      <MarketingFooter />
    </ScrollView>
  );
}

