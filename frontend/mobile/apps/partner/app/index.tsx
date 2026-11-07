// Ported from frontend/apps/partner/app/(marketing)/page.tsx, partner-hero.tsx & layout.tsx
import { useAuthStore } from "@vsolve/mobile-core";
import { Text } from "@vsolve/mobile-ui";
import * as WebBrowser from "expo-web-browser";
import { Redirect, useRouter } from "expo-router";
import {
  ArrowRight,
  Award,
  BatteryFull,
  Bell,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Droplets,
  Flame,
  Hammer,
  Headset,
  Home as HomeIcon,
  LineChart,
  MapPin,
  Navigation,
  Phone,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Star,
  User,
  Wallet,
  Wifi,
  Wind,
  Wrench,
  Zap,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  TextInput,
  UIManager,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MarketingHeader } from "../src/components/marketing-header";
import { MarketingFooter } from "../src/components/marketing-footer";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://partner.vsolvehub.com";

const STATS = [
  { value: "Weekly", label: "Direct Bank Payouts", icon: Wallet, iconColor: "#ea580c", iconBg: "#fff7ed" },
  { value: "Your Hours", label: "Choose Shifts & Area", icon: Clock, iconColor: "#d97706", iconBg: "#fffbeb" },
  { value: "Upfront Rates", label: "Job Price Before Accepting", icon: LineChart, iconColor: "#0284c7", iconBg: "#f0f9ff" },
  { value: "Hyderabad", label: "Now Onboarding Partners", icon: ShieldCheck, iconColor: "#059669", iconBg: "#ecfdf5" },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    icon: Smartphone,
    color: "#f87000",
    badge: "2 Mins",
    badgeBg: "bg-orange-50 text-orange-700 border-orange-200",
    title: "Quick Registration",
    desc: "Enter your 10-digit mobile number, choose your primary trade skills, and upload an ID proof.",
    highlight: "100% Free Signup",
  },
  {
    step: "02",
    icon: ShieldCheck,
    color: "#d97706",
    badge: "24h Review",
    badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
    title: "Fast Verification",
    desc: "Our operations desk approves your profile and documents within 24 hours. Zero registration fee.",
    highlight: "Zero Upfront Cost",
  },
  {
    step: "03",
    icon: CalendarClock,
    color: "#0284c7",
    badge: "Flexible Hours",
    badgeBg: "bg-sky-50 text-sky-800 border-sky-200",
    title: "Set Shifts & Get Jobs",
    desc: "Set your daily working hours, select your local service zones, and receive instant customer bookings.",
    highlight: "Instant Local Offers",
  },
  {
    step: "04",
    icon: Banknote,
    color: "#059669",
    badge: "Weekly Payout",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
    title: "Guaranteed Payouts",
    desc: "Complete jobs, deliver 5-star service, and receive automated settlements directly into your bank account.",
    highlight: "Direct to Bank / UPI",
  },
];

const FEATURES = [
  {
    icon: Wallet,
    tag: "Financial Security",
    title: "Guaranteed Weekly Payouts",
    body: "Receive your full earnings directly into your bank account or UPI every Monday without delays, hidden deductions, or lock-ins.",
    stats: "100% On-Time Settlements",
    iconColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  {
    icon: Clock,
    tag: "Work Freedom",
    title: "Complete Schedule Flexibility",
    body: "Work on your own terms. Set daily shift hours, define custom service zones, and toggle duty online/offline at your choice.",
    stats: "Zero Minimum Hours",
    iconColor: "text-amber-600 bg-amber-50 border-amber-200",
  },
  {
    icon: LineChart,
    tag: "Clear Numbers",
    title: "Transparent Upfront Pricing",
    body: "See exactly how much you earn before accepting any customer job. Real-time in-app breakdown of fares, surge bonuses, and tips.",
    stats: "0% Hidden Deductions",
    iconColor: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    icon: Headset,
    tag: "Safety & Care",
    title: "Dedicated 24/7 Support Desk",
    body: "Access direct partner assistance and safety emergency response for navigation, customer coordination, and dispute resolution.",
    stats: "Average < 30s Response",
    iconColor: "text-purple-600 bg-purple-50 border-purple-200",
  },
];

const HIGH_DEMAND_TRADES = [
  {
    slug: "electrician",
    name: "Electrician",
    icon: Zap,
    iconBg: "bg-amber-50 text-amber-600 border-amber-200",
    earnings: "₹45,000 – ₹65,000 / mo",
    demand: "350+ Daily Jobs",
    hot: true,
    skills: ["House Wiring", "Switchboards", "MCBs", "Inverters"],
  },
  {
    slug: "plumber",
    name: "Plumber",
    icon: Wrench,
    iconBg: "bg-blue-50 text-blue-600 border-blue-200",
    earnings: "₹40,000 – ₹60,000 / mo",
    demand: "280+ Daily Jobs",
    hot: false,
    skills: ["Pipe Fitting", "Tap Repair", "Motor & Pump", "Drainage"],
  },
  {
    slug: "carpenter",
    name: "Carpenter",
    icon: Hammer,
    iconBg: "bg-yellow-50 text-amber-700 border-yellow-200",
    earnings: "₹42,000 – ₹58,000 / mo",
    demand: "190+ Daily Jobs",
    hot: false,
    skills: ["Furniture Assembly", "Door Locks", "Cupboards", "Polishing"],
  },
  {
    slug: "ac-technician",
    name: "AC Technician",
    icon: Wind,
    iconBg: "bg-sky-50 text-sky-600 border-sky-200",
    earnings: "₹55,000 – ₹85,000 / mo",
    demand: "420+ Daily Jobs",
    hot: true,
    skills: ["AC Deep Clean", "Gas Refill", "Installs", "Compressor"],
  },
  {
    slug: "ro-technician",
    name: "RO Technician",
    icon: Droplets,
    iconBg: "bg-teal-50 text-teal-600 border-teal-200",
    earnings: "₹38,000 – ₹55,000 / mo",
    demand: "180+ Daily Jobs",
    hot: false,
    skills: ["Purifier Install", "Filter Swap", "Membrane", "TDS Check"],
  },
  {
    slug: "home-cleaning",
    name: "Home Cleaning",
    icon: Sparkles,
    iconBg: "bg-emerald-50 text-emerald-600 border-emerald-200",
    earnings: "₹35,000 – ₹52,000 / mo",
    demand: "260+ Daily Jobs",
    hot: false,
    skills: ["Full Home Clean", "Bathroom", "Kitchen", "Sofa Wash"],
  },
  {
    slug: "pest-control",
    name: "Pest Control",
    icon: ShieldAlert,
    iconBg: "bg-rose-50 text-rose-600 border-rose-200",
    earnings: "₹45,000 – ₹68,000 / mo",
    demand: "150+ Daily Jobs",
    hot: true,
    skills: ["Cockroach Gel", "Termite Spray", "Bedbugs", "Mosquito"],
  },
  {
    slug: "beauty",
    name: "Beauty & Wellness",
    icon: Scissors,
    iconBg: "bg-pink-50 text-pink-600 border-pink-200",
    earnings: "₹48,000 – ₹75,000 / mo",
    demand: "320+ Daily Jobs",
    hot: true,
    skills: ["Hair Styling", "Facials", "Waxing", "Bridal Spa"],
  },
];

const FAQS = [
  {
    q: "How do I become a V Solve Hub partner?",
    a: "Sign up with your mobile number, choose the service you offer, add your basic details, and upload your ID proof. Most applications are verified and approved within 24 hours.",
  },
  {
    q: "Is there any joining or registration fee?",
    a: "No. Signing up as a partner is 100% free with zero upfront or security deposit. You only pay a transparent, competitive platform commission on jobs you successfully complete.",
  },
  {
    q: "How and when do I get paid?",
    a: "Your earnings are automatically settled directly to your bank account or UPI every single week. You can track your completed jobs and pending payouts in real-time inside your Partner App.",
  },
  {
    q: "How much can I earn as an active partner?",
    a: "Full-time active partners in high-demand trades (e.g. AC repair, electrician, plumbing) typically earn between ₹35,000 to ₹65,000+ per month depending on working hours and locations covered.",
  },
  {
    q: "What documents do I need to register?",
    a: "A valid Government photo ID (Aadhaar, Voter ID, or Passport) and proof of address. Drivers will also provide a valid driving licence and vehicle registration.",
  },
  {
    q: "Can I choose my own working hours and locations?",
    a: "Yes. You are completely your own boss. You can choose exactly which service areas you travel to and set your available days and time slots. You only get offers when you are on duty.",
  },
];

const DEMO_OFFERS = [
  {
    icon: Sparkles,
    title: "AC Deep Cleaning · 2 Units",
    area: "Kukatpally, Hyderabad",
    fare: "₹850",
    travelKm: "7.2 km away",
    etaMin: "16 min ETA",
    durationMin: "~55m",
    drop: "Flat 402, Sunshine Apartments, KPHB",
  },
  {
    icon: Zap,
    title: "Electrical Repair · On-site",
    area: "Gachibowli, Hyderabad",
    fare: "₹1,450",
    travelKm: "4.2 km away",
    etaMin: "11 min ETA",
    durationMin: "~50m",
    drop: "24, Green Valley Estate, Phase 3",
  },
  {
    icon: Navigation,
    title: "Plumbing Leakage Fix",
    area: "Jubilee Hills, Hyderabad",
    fare: "₹640",
    travelKm: "3.1 km away",
    etaMin: "6 min ETA",
    durationMin: "~38m",
    drop: "Plot 88, Road No. 10, Jubilee Hills",
  },
];

import { Banknote, CalendarClock } from "lucide-react-native";

export default function Index() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === "ios" ? 48 : (StatusBar.currentHeight ?? 16),
  );
  const heroPaddingTop = isDesktop
    ? 136
    : topInset + (Platform.OS === "web" ? 76 : 88);
  const status = useAuthStore((state) => state.status);
  const [phone, setPhone] = useState("");
  const [offerIndex, setOfferIndex] = useState(0);
  const [timerLeft, setTimerLeft] = useState(30);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const [floatAnim] = useState(() => new Animated.Value(0));

  // Float bobbing loop matching web .vsh-phone-float (6s cycle)
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -10,
          duration: 3000,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: Platform.OS !== "web",
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [floatAnim]);

  // Offer simulation countdown ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev <= 1) {
          setOfferIndex((i) => (i + 1) % DEMO_OFFERS.length);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (status === "loading") return null;
  if (status === "signedIn") {
    return <Redirect href="/home" />;
  }

  const activeOffer = DEMO_OFFERS[offerIndex];
  const ActiveIcon = activeOffer.icon;

  const handleApply = () => {
    const sanitized = phone.replace(/\D/g, "").slice(0, 10);
    if (sanitized.length >= 10) {
      router.push(`/apply?phone=${encodeURIComponent(sanitized)}`);
    } else {
      router.push("/apply");
    }
  };

  const toggleFaq = (idx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenFaq((prev) => (prev === idx ? null : idx));
  };

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-white"
      contentContainerClassName="pb-0"
      keyboardShouldPersistTaps="handled"
    >
      {/* ========================================================================= */}
      {/* 1 & 2. HERO + FLOATING DYNAMIC-ISLAND NAVIGATION BAR                        */}
      {/* ========================================================================= */}
      <View className="relative overflow-hidden bg-[#00112e] text-white">
        {/* Subtle Ambient Radial Glow matching Web partner-hero aurora */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -80,
            top: -60,
            width: 520,
            height: 520,
            borderRadius: 260,
            backgroundColor: "rgba(248, 112, 0, 0.16)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: -80,
            top: 260,
            width: 380,
            height: 380,
            borderRadius: 190,
            backgroundColor: "rgba(37, 99, 235, 0.1)",
          }}
        />

        {/* Shared Marketing Header */}
        <MarketingHeader activeTab="home" />

        {/* Hero Content Section with Guaranteed Navbar Clearance */}
        <View
          className="px-5 pb-16 sm:pb-24"
          style={{ paddingTop: heroPaddingTop }}
        >
          <View
            className={`mx-auto w-full ${
              isDesktop ? "max-w-6xl flex-row items-center justify-between gap-12" : "max-w-md flex-col gap-8"
            }`}
          >
            {/* Left Column: Headline & Call To Action */}
            <View className={isDesktop ? "w-[54%] max-w-[560px] gap-6" : "w-full gap-5"}>
              {/* Tag Pill */}
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  letterSpacing: 1.05,
                  textTransform: "uppercase",
                  color: "#fb8130",
                }}
              >
                Free to join
              </Text>

              {/* Main Headline */}
              <View className="gap-0">
                <Text
                  style={{
                    fontSize: isDesktop ? 54 : 36,
                    lineHeight: isDesktop ? 60 : 40,
                    letterSpacing: -1,
                    fontWeight: "900",
                    color: "#ffffff",
                  }}
                >
                  Your skill. Their doorstep.
                </Text>
                <Text
                  style={{
                    fontSize: isDesktop ? 54 : 36,
                    lineHeight: isDesktop ? 60 : 40,
                    letterSpacing: -1,
                    fontWeight: "900",
                    color: "#f87000",
                  }}
                >
                  Paid instantly.
                </Text>
              </View>

              {/* Subtitle */}
              <Text
                style={{
                  fontSize: isDesktop ? 18 : 15,
                  lineHeight: isDesktop ? 28 : 24,
                  color: "rgba(255, 255, 255, 0.75)",
                }}
              >
                Now onboarding service professionals in Hyderabad. Get local jobs and weekly bank payouts.
              </Text>

              {/* Phone Apply Input Form */}
              <View className="mt-2 gap-2.5">
                <View className={isDesktop ? "flex-row items-center gap-3 w-full max-w-[480px]" : "gap-2.5 w-full"}>
                  <View className={isDesktop ? "flex-1 relative" : "w-full relative"}>
                    <View
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        left: 14,
                        top: 0,
                        bottom: 0,
                        justifyContent: "center",
                        zIndex: 10,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Phone size={16} color="#9ca3af" />
                      <Text style={{ fontSize: 14, fontWeight: "700", color: "#6b7280" }}>+91</Text>
                    </View>
                    <TextInput
                      keyboardType="phone-pad"
                      placeholder="Enter 10-digit number"
                      placeholderTextColor="#9ca3af"
                      value={phone}
                      onChangeText={(val) => setPhone(val.replace(/\D/g, "").slice(0, 10))}
                      style={{
                        height: 52,
                        width: "100%",
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: "#d3ccc0",
                        backgroundColor: "#ffffff",
                        paddingLeft: 72,
                        paddingRight: 16,
                        fontSize: 16,
                        fontWeight: "600",
                        color: "#00112e",
                      }}
                    />
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleApply}
                    style={{
                      height: 52,
                      borderRadius: 8,
                      backgroundColor: "#f87000",
                      paddingHorizontal: isDesktop ? 28 : 20,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: "rgba(248, 112, 0, 0.4)",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 1,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                    className="active:opacity-90"
                  >
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "800",
                        color: "#ffffff",
                      }}
                    >
                      Apply Now
                    </Text>
                  </Pressable>
                </View>

                {/* Guarantee Note */}
                <View className="flex-row items-center gap-2 mt-1">
                  <View className="h-2 w-2 rounded-full bg-emerald-400" />
                  <Text
                    style={{
                      fontSize: 13,
                      color: "rgba(255, 255, 255, 0.7)",
                    }}
                  >
                    We&apos;ll send an OTP. Signup takes only 5 minutes.
                  </Text>
                </View>

                {/* Already registered sign-in shortcut pill */}
                <View
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: "rgba(255, 255, 255, 0.15)",
                    backgroundColor: "rgba(255, 255, 255, 0.1)",
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    maxWidth: isDesktop ? 440 : undefined,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: "rgba(255, 255, 255, 0.85)",
                    }}
                  >
                    Already registered as a Partner?
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/login")}
                    style={{
                      borderRadius: 9999,
                      backgroundColor: "#ffffff",
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                      justifyContent: "center",
                      alignItems: "center",
                      shadowColor: "rgba(0, 0, 0, 0.1)",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 1,
                      shadowRadius: 3,
                    }}
                    className="active:opacity-90"
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "800",
                        color: "#00112e",
                      }}
                    >
                      Sign In
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Right Column: 3D App Mockup Phone Preview */}
            <View className={isDesktop ? "w-[42%] items-center justify-center" : "w-full items-center mt-6"}>
              <Animated.View
                style={{
                  transform: [{ translateY: floatAnim }],
                }}
              >
                <View
                  style={{
                    width: isDesktop ? 295 : 275,
                    aspectRatio: 300 / 640,
                    borderRadius: 48,
                    borderWidth: 10,
                    borderColor: "#14122e",
                    backgroundColor: "#14122e",
                    transform: [{ rotate: "3deg" }],
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 26 },
                    shadowOpacity: 0.55,
                    shadowRadius: 32,
                    elevation: 16,
                  }}
                  className="overflow-hidden"
                >
                  {/* Dynamic Island Notch */}
                  <View className="absolute left-1/2 top-2.5 z-30 h-[18px] w-20 -translate-x-1/2 rounded-full bg-[#14122e]" />

                  <View className="bg-slate-50 p-2.5 flex-1">
                    {/* Phone Status Bar */}
                    <View className="flex-row items-center justify-between px-3 pt-2 pb-1.5">
                      <Text className="text-[10px] font-bold text-slate-700">9:41</Text>
                      <View className="flex-row items-center gap-1.5">
                        <Signal size={10} color="#334155" />
                        <Wifi size={10} color="#334155" />
                        <BatteryFull size={12} color="#334155" />
                      </View>
                    </View>

                    {/* In-App Header */}
                    <View className="flex-row items-center justify-between rounded-xl bg-white p-2 border border-slate-100 shadow-2xs">
                      <View className="flex-row items-center gap-1.5">
                        <View className="h-6 w-6 items-center justify-center rounded-full bg-navy-900">
                          <Text className="text-[10px] font-bold text-white">S</Text>
                        </View>
                        <View>
                          <Text className="text-[8px] font-semibold text-slate-500">Partner</Text>
                          <Text className="text-[10px] font-extrabold text-navy-900">Suresh V.</Text>
                        </View>
                      </View>
                      <View className="flex-row items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                        <View className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <Text className="text-[8px] font-extrabold text-emerald-700">ON DUTY</Text>
                      </View>
                      <View className="flex-row items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 border border-amber-200">
                        <Star size={9} fill="#f59e0b" color="#f59e0b" />
                        <Text className="text-[9px] font-extrabold text-amber-800">4.9</Text>
                      </View>
                    </View>

                    {/* Today's Earnings Card */}
                    <View className="mt-2 rounded-xl bg-[#00112e] p-2.5 text-white shadow-xs">
                      <View className="flex-row items-center justify-between">
                        <View>
                          <Text className="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                            Today&apos;s Earnings
                          </Text>
                          <Text className="text-base font-black text-white">₹3,450</Text>
                        </View>
                        <View className="items-end">
                          <View className="rounded-full bg-white/10 px-2 py-0.5 border border-white/10">
                            <Text className="text-[8px] font-bold text-emerald-400">4 Jobs Done</Text>
                          </View>
                          <Text className="mt-0.5 text-[7px] text-slate-400">Weekly settlement</Text>
                        </View>
                      </View>
                    </View>

                    {/* Live Job Offer Stack Card */}
                    <View className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
                      <View className="flex-row items-center justify-between pb-1.5 border-b border-slate-100">
                        <View className="flex-row items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5">
                          <View className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          <Text className="text-[8px] font-bold text-emerald-800">LIVE OFFER</Text>
                        </View>
                        <View className="flex-row items-center gap-1">
                          <Clock size={10} color="#ea580c" />
                          <Text className="text-[9px] font-extrabold text-slate-800">{timerLeft}s left</Text>
                        </View>
                      </View>

                      <View className="mt-2 flex-row items-start gap-1.5">
                        <View className="h-7 w-7 items-center justify-center rounded-lg bg-orange-50 border border-orange-200">
                          <ActiveIcon size={14} color="#ea580c" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-[10px] font-bold text-slate-900" numberOfLines={1}>
                            {activeOffer.title}
                          </Text>
                          <Text className="text-[8px] text-slate-500" numberOfLines={1}>
                            {activeOffer.area}
                          </Text>
                        </View>
                        <View className="items-end">
                          <Text className="text-[10px] font-black text-slate-900">{activeOffer.fare}</Text>
                          <Text className="text-[7px] text-slate-500">{activeOffer.durationMin}</Text>
                        </View>
                      </View>

                      <View className="mt-2 flex-row gap-1.5">
                        <View className="flex-1 flex-row items-center gap-1 rounded-md bg-slate-50 p-1 border border-slate-100">
                          <Navigation size={8} color="#64748b" />
                          <Text className="text-[8px] font-bold text-slate-700">{activeOffer.travelKm}</Text>
                        </View>
                        <View className="flex-1 flex-row items-center gap-1 rounded-md bg-slate-50 p-1 border border-slate-100">
                          <Clock size={8} color="#64748b" />
                          <Text className="text-[8px] font-bold text-slate-700">{activeOffer.etaMin}</Text>
                        </View>
                      </View>

                      <View className="mt-1.5 flex-row items-center gap-1 rounded-md bg-slate-50 p-1 border border-slate-100">
                        <MapPin size={9} color="#ea580c" />
                        <Text className="text-[7.5px] text-slate-600 flex-1" numberOfLines={1}>
                          {activeOffer.drop}
                        </Text>
                      </View>

                      <View className="mt-2 flex-row gap-1.5">
                        <View className="flex-1 items-center justify-center rounded-lg border border-slate-200 py-1 bg-white">
                          <Text className="text-[9px] font-bold text-slate-600">Decline</Text>
                        </View>
                        <View className="flex-2 items-center justify-center rounded-lg bg-emerald-600 py-1 shadow-xs">
                          <Text className="text-[9px] font-extrabold text-white">Accept · {activeOffer.fare}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Bottom App Tab Bar */}
                    <View className="mt-2 flex-row items-center justify-around border-t border-slate-200 bg-white pt-1.5 pb-0.5">
                      <View className="items-center">
                        <Briefcase size={12} color="#ea580c" />
                        <Text className="text-[7px] font-bold text-signal-500">Work</Text>
                      </View>
                      <View className="items-center">
                        <Wallet size={12} color="#94a3b8" />
                        <Text className="text-[7px] text-slate-400">Money</Text>
                      </View>
                      <View className="-mt-3 h-7 w-7 items-center justify-center rounded-full bg-signal-500 shadow-sm">
                        <HomeIcon size={12} color="#00112e" />
                      </View>
                      <View className="items-center">
                        <Bell size={12} color="#94a3b8" />
                        <Text className="text-[7px] text-slate-400">Alerts</Text>
                      </View>
                      <View className="items-center">
                        <User size={12} color="#94a3b8" />
                        <Text className="text-[7px] text-slate-400">Me</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </Animated.View>
            </View>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 3. TRUST & STATS TICKER STRIP                                              */}
      {/* ========================================================================= */}
      <View className="border-b border-slate-200 bg-white py-8 px-5 sm:px-8">
        <View
          className={`mx-auto w-full ${
            isDesktop ? "max-w-6xl flex-row items-center justify-between gap-6" : "max-w-md gap-5"
          }`}
        >
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <View
                key={s.label}
                className={isDesktop ? "flex-1 flex-row items-center gap-3.5" : "flex-row items-center gap-4"}
              >
                <View
                  style={{ backgroundColor: s.iconBg }}
                  className={`h-12 w-12 items-center justify-center shrink-0 ${
                    isDesktop ? "rounded-2xl" : "rounded-full"
                  }`}
                >
                  <Icon size={isDesktop ? 24 : 22} color={s.iconColor} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text
                    className={
                      isDesktop
                        ? "text-2xl font-black text-slate-900 tracking-tight"
                        : "text-base font-extrabold text-slate-900"
                    }
                    numberOfLines={1}
                  >
                    {s.value}
                  </Text>
                  <Text
                    className={
                      isDesktop
                        ? "text-xs font-semibold text-slate-500 mt-0.5"
                        : "text-xs font-medium text-slate-500 mt-0.5"
                    }
                    numberOfLines={1}
                  >
                    {s.label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 4. HOW IT WORKS                                                           */}
      {/* ========================================================================= */}
      <View className="px-5 py-20 sm:py-24 bg-white">
        <View className={`mx-auto w-full ${isDesktop ? "max-w-6xl" : "max-w-md"}`}>
          {/* Header */}
          <View className="items-center text-center">
            <View className="flex-row items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 border border-orange-200 shadow-xs">
              <Sparkles size={14} color="#ea580c" />
              <Text className="text-xs font-extrabold text-[#ea580c]">
                Simple 4-Step Journey
              </Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 38 : 30,
                fontWeight: "900",
                lineHeight: isDesktop ? 44 : 36,
                letterSpacing: -0.75,
                marginTop: 16,
                color: "#00112e",
              }}
              className="text-center"
            >
              How Becoming a Partner Works
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                marginTop: 10,
                color: "#64748b",
                maxWidth: 580,
              }}
              className="text-center"
            >
              From registration to your first payout in four quick steps. Zero joining fees and no complicated paperwork.
            </Text>
          </View>

          {/* Stepper Cards */}
          <View className={isDesktop ? "mt-14 flex-row gap-6" : "mt-8 gap-4 w-full"}>
            {HOW_IT_WORKS_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <View
                  key={step.step}
                  className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-xs ${
                    isDesktop ? "flex-1 flex-col justify-between" : ""
                  }`}
                >
                  <View>
                    <View className="flex-row items-center justify-between">
                      <View
                        style={{ backgroundColor: step.color }}
                        className="h-12 w-12 items-center justify-center rounded-2xl shadow-xs"
                      >
                        <Icon size={24} color="#ffffff" />
                      </View>
                      <View className={`rounded-full px-3 py-1 border ${step.badgeBg}`}>
                        <Text className="text-[11px] font-extrabold">{step.badge}</Text>
                      </View>
                    </View>

                    <View className="mt-6">
                      <Text className="text-xs font-black uppercase tracking-widest text-slate-400">
                        STEP {step.step}
                      </Text>
                      <Text className="mt-1 text-lg font-bold text-slate-900">{step.title}</Text>
                      <Text className="mt-2 text-xs leading-relaxed text-slate-500">
                        {step.desc}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-6 pt-4 border-t border-slate-100 flex-row items-center gap-2">
                    <CheckCircle2 size={16} color="#059669" />
                    <Text className="text-xs font-bold text-slate-900">{step.highlight}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Bottom Action CTA */}
          <View className="mt-12 items-center">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/apply")}
              className={`flex-row items-center justify-center gap-2 rounded-full bg-[#f87000] active:bg-[#ea580c] shadow-lg shadow-orange-500/25 ${
                isDesktop ? "px-8 py-3.5 self-center" : "h-13 w-full"
              }`}
            >
              <Text className="text-sm font-extrabold text-white">Start Your Partner Application</Text>
              <ArrowRight size={16} color="#ffffff" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 5. PLATFORM ADVANTAGES / WHY PARTNER WITH US                              */}
      {/* ========================================================================= */}
      <View className="border-t border-slate-200 bg-slate-50/70 px-5 py-20 sm:py-24">
        <View className={`mx-auto w-full ${isDesktop ? "max-w-6xl" : "max-w-md"}`}>
          {/* Header */}
          <View className="items-center text-center">
            <View className="flex-row items-center gap-1.5 rounded-full bg-slate-200/70 px-3.5 py-1 border border-slate-300 shadow-xs">
              <Award size={14} color="#00112e" />
              <Text className="text-xs font-extrabold text-navy-900">
                Platform Advantages
              </Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 38 : 30,
                fontWeight: "900",
                lineHeight: isDesktop ? 44 : 36,
                letterSpacing: -0.75,
                marginTop: 16,
                color: "#00112e",
              }}
              className="text-center"
            >
              Built for Your Independence & Growth
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                marginTop: 10,
                color: "#64748b",
                maxWidth: 580,
              }}
              className="text-center"
            >
              Everything you need to run and scale your service trade with dignity, security, and top earnings.
            </Text>
          </View>

          {/* 4 Bento Feature Cards */}
          <View className={isDesktop ? "mt-14 flex-row gap-6" : "mt-8 gap-4 w-full"}>
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <View
                  key={feat.title}
                  className={`rounded-3xl border border-slate-200 bg-white p-7 shadow-xs ${
                    isDesktop ? "flex-1 flex-col justify-between" : ""
                  }`}
                >
                  <View>
                    <View className="flex-row items-center justify-between">
                      <View className={`h-12 w-12 items-center justify-center rounded-2xl border ${feat.iconColor}`}>
                        <Icon size={22} />
                      </View>
                      <View className="rounded-full bg-slate-100 px-3 py-1 border border-slate-200">
                        <Text className="text-[11px] font-bold text-slate-600">{feat.tag}</Text>
                      </View>
                    </View>

                    <Text className="mt-6 text-lg font-bold text-navy-900">{feat.title}</Text>
                    <Text className="mt-2 text-xs leading-relaxed text-slate-500">{feat.body}</Text>
                  </View>

                  <View className="mt-6 pt-4 border-t border-slate-100 flex-row items-center gap-2">
                    <CheckCircle2 size={16} color="#059669" />
                    <Text className="text-xs font-extrabold text-emerald-700">{feat.stats}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 6. SERVICES / HIGH DEMAND TRADES                                          */}
      {/* ========================================================================= */}
      <View className="border-t border-slate-200 bg-white px-5 py-20 sm:py-24">
        <View className={`mx-auto w-full ${isDesktop ? "max-w-6xl" : "max-w-md"}`}>
          {/* Header */}
          <View className="items-center text-center">
            <View className="flex-row items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 border border-orange-200 shadow-xs">
              <Sparkles size={14} color="#ea580c" />
              <Text className="text-xs font-extrabold text-[#ea580c]">
                High Demand Trades
              </Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 38 : 30,
                fontWeight: "900",
                lineHeight: isDesktop ? 44 : 36,
                letterSpacing: -0.75,
                marginTop: 16,
                color: "#00112e",
              }}
              className="text-center"
            >
              Choose Your Trade to Start Earning
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                marginTop: 10,
                color: "#64748b",
                maxWidth: 580,
              }}
              className="text-center"
            >
              Active customer demand across Telangana guarantees regular jobs and reliable weekly earnings.
            </Text>
          </View>

          {/* 8 Trade Cards */}
          <View
            className={
              isDesktop
                ? "mt-14 flex-row flex-wrap gap-6"
                : "mt-8 gap-3.5 w-full"
            }
          >
            {HIGH_DEMAND_TRADES.map((trade) => {
              const Icon = trade.icon;
              return (
                <Pressable
                  key={trade.slug}
                  accessibilityRole="button"
                  onPress={() => router.push(`/apply?trade=${trade.slug}`)}
                  style={isDesktop ? { width: "calc(25% - 18px)" as any } : undefined}
                  className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs active:opacity-95 flex-col justify-between"
                >
                  <View>
                    <View className="flex-row items-center justify-between">
                      <View className={`h-12 w-12 items-center justify-center rounded-2xl border ${trade.iconBg}`}>
                        <Icon size={22} />
                      </View>

                      <View
                        className={`flex-row items-center gap-1 rounded-full px-2.5 py-0.5 border ${
                          trade.hot
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {trade.hot ? <Flame size={12} color="#e11d48" /> : null}
                        <Text
                          className={`text-[10px] font-extrabold ${
                            trade.hot ? "text-rose-700" : "text-emerald-700"
                          }`}
                        >
                          {trade.demand}
                        </Text>
                      </View>
                    </View>

                    <View className="mt-5">
                      <Text className="text-lg font-bold text-navy-900">{trade.name}</Text>
                      <Text className="text-xs font-bold text-[#ea580c] mt-1">{trade.earnings}</Text>
                    </View>

                    <View className="mt-4 flex-row flex-wrap gap-1.5">
                      {trade.skills.map((skill) => (
                        <View key={skill} className="rounded-lg bg-slate-100 px-2 py-0.5 border border-slate-200/60">
                          <Text className="text-[10px] font-semibold text-slate-600">{skill}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* 1-Click Action Row */}
                  <View className="mt-6 pt-3.5 border-t border-slate-100 flex-row items-center justify-between">
                    <Text className="text-xs font-bold text-navy-900">Apply for {trade.name}</Text>
                    <ArrowRight size={14} color="#00112e" />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Specialist Contractor Banner */}
          <View
            className={`mt-12 rounded-3xl bg-[#00112e] p-8 shadow-2xl border border-white/10 ${
              isDesktop ? "flex-row items-center justify-between gap-8" : "gap-4 w-full"
            }`}
          >
            <View className={isDesktop ? "flex-1 max-w-2xl" : "w-full"}>
              <View className="self-start rounded-full bg-white/10 px-2.5 py-0.5 border border-white/20">
                <Text className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                  Contractors & Fleet Owners
                </Text>
              </View>
              <Text className="mt-2.5 text-xl font-bold text-white">
                Supply Multi-Person Crews & Quote Custom Projects
              </Text>
              <Text className="mt-1 text-xs text-slate-300 leading-relaxed">
                Register complete work teams for daily workforce dispatch, commercial renovations, and high-volume corporate contracts.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/trades")}
              className={`rounded-full bg-white px-6 py-3 shadow-md active:bg-slate-100 shrink-0 ${
                isDesktop ? "self-center" : "self-start mt-2"
              }`}
            >
              <Text className="text-xs font-bold text-[#00112e]">Apply for Specialist Work →</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 7. FAQ SECTION                                                            */}
      {/* ========================================================================= */}
      <View className="border-t border-slate-200 bg-white px-5 py-20 sm:py-24">
        <View className="mx-auto w-full max-w-3xl items-center">
          {/* Header */}
          <View className="items-center text-center">
            <View className="rounded-full bg-slate-100 px-3.5 py-1 border border-slate-200">
              <Text className="text-xs font-extrabold text-navy-900">
                Got Questions?
              </Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 38 : 30,
                fontWeight: "900",
                lineHeight: isDesktop ? 44 : 36,
                letterSpacing: -0.75,
                marginTop: 16,
                color: "#00112e",
              }}
              className="text-center"
            >
              Frequently Asked Questions
            </Text>
            <Text
              style={{
                fontSize: 15,
                lineHeight: 22,
                marginTop: 10,
                color: "#64748b",
              }}
              className="text-center"
            >
              Everything you need to know about registering, verification, and getting paid.
            </Text>
          </View>

          {/* Accordion list */}
          <View className="mt-10 gap-3 w-full">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <View key={faq.q} className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
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

          {/* Helpdesk Callout Card */}
          <View className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-6 items-center text-center w-full">
            <Text className="text-sm font-bold text-navy-900">Have a specific question not covered here?</Text>
            <Text className="mt-1.5 text-xs text-slate-600 text-center leading-relaxed max-w-lg">
              Our partner helpdesk is available 9am–9pm every day (+91 879 056 4634) to guide you through registration and verification.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/contact")}
              className="mt-3.5"
            >
              <Text className="text-xs font-bold text-[#f87000] underline">
                Contact Partner Support →
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 8. FINAL HIGH-IMPACT CTA BAND                                              */}
      {/* ========================================================================= */}
      <View className="px-5 pb-24 sm:px-8">
        <LinearGradient
          colors={["#00112e", "#001f54", "#00112e"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 32,
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.12)",
            paddingVertical: isDesktop ? 64 : 48,
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
          <View className="flex-row items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-500/30 px-3.5 py-1">
            <Sparkles size={14} color="#fcd34d" />
            <Text className="text-xs font-extrabold text-amber-300">
              Start Earning This Week
            </Text>
          </View>

          <Text
            style={{
              fontSize: isDesktop ? 40 : 28,
              fontWeight: "900",
              lineHeight: isDesktop ? 48 : 34,
              letterSpacing: -0.75,
              marginTop: 18,
              color: "#ffffff",
            }}
            className="text-center"
          >
            Ready to Build a High-Earning Service Business?
          </Text>

          <Text
            style={{
              fontSize: 15,
              lineHeight: 24,
              marginTop: 12,
              color: "#cbd5e1",
              maxWidth: 540,
            }}
            className="text-center"
          >
            Start earning as a verified partner in Hyderabad. Zero upfront cost, weekly bank payouts, and upfront job pricing.
          </Text>

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
              className={`flex-row items-center justify-center gap-2 rounded-full bg-[#f87000] active:bg-[#ea580c] shadow-xl shadow-orange-600/30 ${
                isDesktop ? "px-8 py-3.5" : "h-12 w-full"
              }`}
            >
              <Text className="text-sm font-extrabold text-white">Register as a Partner Now</Text>
              <ArrowRight size={16} color="#ffffff" />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/contact")}
              className={`items-center justify-center rounded-full border border-white/25 bg-white/10 active:bg-white/20 ${
                isDesktop ? "px-7 py-3.5" : "h-12 w-full"
              }`}
            >
              <Text className="text-sm font-bold text-white">Contact Support</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>

      {/* Shared Marketing Footer */}
      <MarketingFooter />
    </ScrollView>
  );
}
