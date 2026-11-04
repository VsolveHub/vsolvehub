import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  LineChart,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react-native";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, StatusBar } from "react-native";
import { MarketingHeader } from "../src/components/marketing-header";
import { MarketingFooter } from "../src/components/marketing-footer";

const BENEFITS_LIST = [
  {
    icon: Wallet,
    title: "100% Guaranteed Weekly Payouts",
    desc: "Every single rupee you earn is automatically calculated and transferred directly to your bank account or UPI every Monday. Zero payout delays, zero withholding.",
    badge: "Direct to Bank / UPI",
    color: "#059669",
    points: [
      "Automated Monday settlements",
      "Real-time wallet balance and transaction ledger",
      "Zero withdrawal fees or hidden payment cuts",
    ],
  },
  {
    icon: Clock,
    title: "Complete Schedule & Location Freedom",
    desc: "You are your own boss. Pick your working hours, select your local service zones across Hyderabad, and toggle duty online/offline whenever you want.",
    badge: "Zero Minimum Hours",
    color: "#d97706",
    points: [
      "Choose morning, afternoon, or evening shifts",
      "Set your travel radius around your home location",
      "Take time off whenever you need without penalties",
    ],
  },
  {
    icon: LineChart,
    title: "Transparent Pricing & Fares",
    desc: "Know exactly what you will earn before you accept any job offer. Transparent labor rates, spare part allowances, and customer tips go 100% to you.",
    badge: "0% Hidden Fees",
    color: "#0284c7",
    points: [
      "Upfront job pricing shown before accepting",
      "Surge bonus during peak seasonal demand",
      "Customer tips are paid out 100% directly to you",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Partner Safety & Insurance Coverage",
    desc: "Work with peace of mind. Every active job is backed by comprehensive accidental insurance, emergency SOS support, and verified customer profiles.",
    badge: "Safety Protected",
    color: "#7c3aed",
    points: [
      "On-job accidental and medical cover",
      "One-tap emergency SOS hotline assistance",
      "Verified customer identities and addresses",
    ],
  },
];

const EARNINGS_BREAKDOWN = [
  { trade: "Electrician", fullTime: "₹45,000 – ₹65,000", partTime: "₹22,000 – ₹32,000", topEarners: "₹80,000+" },
  { trade: "Plumber", fullTime: "₹40,000 – ₹60,000", partTime: "₹20,000 – ₹30,000", topEarners: "₹75,000+" },
  { trade: "AC Technician", fullTime: "₹55,000 – ₹85,000", partTime: "₹28,000 – ₹42,000", topEarners: "₹1,10,000+" },
  { trade: "Carpenter", fullTime: "₹42,000 – ₹58,000", partTime: "₹20,000 – ₹28,000", topEarners: "₹70,000+" },
  { trade: "Home Cleaning", fullTime: "₹35,000 – ₹52,000", partTime: "₹18,000 – ₹25,000", topEarners: "₹65,000+" },
  { trade: "Beauty & Wellness", fullTime: "₹48,000 – ₹75,000", partTime: "₹24,000 – ₹38,000", topEarners: "₹95,000+" },
];

export default function BenefitsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : (StatusBar.currentHeight ?? 16));
  const heroPaddingTop = isDesktop ? 128 : topInset + 80;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-0">
      <MarketingHeader activeTab="benefits" />

      {/* Hero Header */}
      <View className="px-5 pb-8 sm:pb-14" style={{ paddingTop: heroPaddingTop }}>
        <View className="mx-auto w-full max-w-4xl items-center text-center">
          <View className="flex-row items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 border border-emerald-200 shadow-xs">
            <Award size={14} color="#059669" />
            <Text className="text-xs font-extrabold text-emerald-800">
              Platform Advantages
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
            }}
            className="text-center"
          >
            Built for Your Independence & Maximum Earnings
          </Text>

          <Text
            style={{
              fontSize: isDesktop ? 18 : 15,
              lineHeight: isDesktop ? 28 : 24,
              marginTop: 12,
              color: "#64748b",
              maxWidth: 620,
            }}
            className="text-center"
          >
            Partner with V Solve Hub for steady local jobs, direct bank payouts, and complete schedule freedom in Hyderabad.
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
              <Text className="text-sm font-extrabold text-white">Join as a Partner</Text>
              <ArrowRight size={16} color="#ffffff" />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/how-it-works")}
              className={`items-center justify-center rounded-full border border-slate-300 bg-white active:bg-slate-50 shadow-xs ${
                isDesktop ? "px-7 py-3.5" : "h-12 w-full"
              }`}
            >
              <Text className="text-sm font-bold text-navy-900">How Onboarding Works</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* 4 Pillars Bento Grid */}
      <View className="px-5 py-8 sm:py-12">
        <View
          className={`mx-auto w-full max-w-6xl ${
            isDesktop ? "flex-row flex-wrap gap-6" : "gap-5"
          }`}
        >
          {BENEFITS_LIST.map((b) => {
            const Icon = b.icon;
            return (
              <View
                key={b.title}
                style={isDesktop ? { width: "calc(50% - 12px)" as any } : undefined}
                className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-9 shadow-xs flex-col justify-between"
              >
                <View>
                  <View className="flex-row items-center justify-between">
                    <View
                      style={{ backgroundColor: b.color }}
                      className="h-14 w-14 items-center justify-center rounded-2xl shadow-md"
                    >
                      <Icon size={26} color="#ffffff" />
                    </View>
                    <View className="rounded-full bg-slate-100 px-3 py-1 border border-slate-200">
                      <Text className="text-xs font-extrabold text-navy-900">{b.badge}</Text>
                    </View>
                  </View>

                  <Text className="mt-6 text-xl font-bold text-navy-900">{b.title}</Text>
                  <Text className="mt-2.5 text-sm text-slate-600 leading-relaxed">{b.desc}</Text>

                  <View className="mt-6 space-y-2.5 border-t border-slate-100 pt-5 gap-2.5">
                    {b.points.map((pt) => (
                      <View key={pt} className="flex-row items-center gap-2">
                        <CheckCircle2 size={16} color="#059669" />
                        <Text className="text-xs sm:text-sm font-semibold text-navy-900">{pt}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Monthly Earnings Table */}
      <View className="px-5 py-16 sm:py-20 bg-slate-50/70 border-t border-slate-200">
        <View className="mx-auto w-full max-w-5xl">
          <View className="items-center text-center max-w-xl mx-auto">
            <View className="flex-row items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 border border-orange-200">
              <TrendingUp size={14} color="#ea580c" />
              <Text className="text-xs font-extrabold text-[#ea580c]">Market Estimates</Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 34 : 26,
                fontWeight: "900",
                lineHeight: isDesktop ? 40 : 32,
                letterSpacing: -0.5,
                marginTop: 12,
                color: "#00112e",
              }}
              className="text-center"
            >
              Estimated Monthly Rates by Trade
            </Text>
            <Text className="mt-2 text-sm text-slate-600 text-center">
              Estimates of typical Hyderabad rates; your earnings depend on the jobs you accept.
            </Text>
          </View>

          {/* Table Container */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-8">
            <View className="min-w-[620px] w-full rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              {/* Table Header */}
              <View className="flex-row border-b border-slate-200 bg-slate-50 px-6 py-4">
                <Text className="w-44 text-xs font-black uppercase tracking-wider text-slate-500">
                  Trade Specialty
                </Text>
                <Text className="w-48 text-xs font-black uppercase tracking-wider text-slate-500">
                  Full-Time (8h / day)
                </Text>
                <Text className="w-48 text-xs font-black uppercase tracking-wider text-slate-500">
                  Part-Time (4h / day)
                </Text>
                <Text className="flex-1 text-xs font-black uppercase tracking-wider text-slate-500">
                  Top Performers
                </Text>
              </View>

              {/* Table Rows */}
              {EARNINGS_BREAKDOWN.map((row, idx) => (
                <View
                  key={row.trade}
                  className={`flex-row items-center px-6 py-4 ${
                    idx < EARNINGS_BREAKDOWN.length - 1 ? "border-b border-slate-100" : ""
                  }`}
                >
                  <Text className="w-44 text-sm font-bold text-navy-900">{row.trade}</Text>
                  <Text className="w-48 text-sm font-extrabold text-[#ea580c]">{row.fullTime}</Text>
                  <Text className="w-48 text-sm font-medium text-slate-600">{row.partTime}</Text>
                  <Text className="flex-1 text-sm font-extrabold text-emerald-700">{row.topEarners}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>

      {/* Bottom CTA Banner */}
      <View className="px-5 py-20 sm:px-8">
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
            }}
            className="text-center"
          >
            Start Earning What You Deserve
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 24,
              marginTop: 10,
              color: "#cbd5e1",
              maxWidth: 540,
            }}
            className="text-center"
          >
            Apply today in under 5 minutes. No upfront costs, guaranteed weekly bank payouts.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className="mt-8 flex-row items-center justify-center gap-2 rounded-full bg-[#f87000] active:bg-[#ea580c] px-8 py-3.5 shadow-xl shadow-orange-600/30"
          >
            <Text className="text-sm font-extrabold text-white">Become a Partner Now</Text>
            <ArrowRight size={16} color="#ffffff" />
          </Pressable>
        </LinearGradient>
      </View>

      <MarketingFooter />
    </ScrollView>
  );
}

