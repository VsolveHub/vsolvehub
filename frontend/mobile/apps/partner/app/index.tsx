// Ported from frontend/apps/partner/app/(marketing)/page.tsx, partner-hero.tsx & layout.tsx
import { useAuthStore } from "@vsolve/mobile-core";
import { Logo, Text } from "@vsolve/mobile-ui";
import * as WebBrowser from "expo-web-browser";
import { Redirect, useRouter } from "expo-router";
import {
  ArrowRight,
  Award,
  Banknote,
  BatteryFull,
  Bell,
  Briefcase,
  CalendarClock,
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
  Lock,
  MapPin,
  Navigation,
  Phone,
  PhoneCall,
  Scissors,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Smartphone,
  Sparkles,
  Star,
  TrendingUp,
  User,
  Users,
  Wallet,
  Wifi,
  Wind,
  Wrench,
  Zap,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  UIManager,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://partner.vsolvehub.com";

const STATS = [
  { value: "5,000+", label: "Verified Partners", icon: Users, color: "#0284c7" },
  { value: "₹45,000+", label: "Avg. Monthly Earnings", icon: TrendingUp, color: "#16a34a" },
  { value: "100%", label: "Weekly Bank Payouts", icon: Wallet, color: "#f87000" },
  { value: "< 24 Hrs", label: "Fast Verification", icon: Zap, color: "#d97706" },
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
    tint: "rgba(16, 185, 129, 0.08)",
  },
  {
    icon: Clock,
    tag: "Work Freedom",
    title: "Complete Schedule Flexibility",
    body: "Work on your own terms. Set daily shift hours, define custom service zones, and toggle duty online/offline at your choice.",
    stats: "Zero Minimum Hours",
    iconColor: "text-amber-600 bg-amber-50 border-amber-200",
    tint: "rgba(245, 158, 11, 0.08)",
  },
  {
    icon: LineChart,
    tag: "Clear Numbers",
    title: "Transparent Upfront Pricing",
    body: "See exactly how much you earn before accepting any customer job. Real-time in-app breakdown of fares, surge bonuses, and tips.",
    stats: "0% Hidden Deductions",
    iconColor: "text-blue-600 bg-blue-50 border-blue-200",
    tint: "rgba(37, 99, 235, 0.08)",
  },
  {
    icon: Headset,
    tag: "Safety & Care",
    title: "Dedicated 24/7 Support Desk",
    body: "Access direct partner assistance and safety emergency response for navigation, customer coordination, and dispute resolution.",
    stats: "Average < 30s Response",
    iconColor: "text-purple-600 bg-purple-50 border-purple-200",
    tint: "rgba(147, 51, 234, 0.08)",
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

const TESTIMONIALS = [
  {
    quote:
      "V Solve Hub changed how I manage my electrical repair work. The weekly payouts are always on time, and I get steady customer bookings right around Kukatpally and Madhapur.",
    name: "Rajesh Kumar",
    trade: "Electrician",
    city: "Hyderabad",
    tenure: "3 Yrs Partner",
    rating: 5,
    earnings: "₹52,000 / mo",
    initial: "R",
    avatarBg: "bg-amber-500",
  },
  {
    quote:
      "Earlier I spent hours hunting for plumbing jobs and haggling over rates. Now bookings come directly on my phone with clear prices and navigation. Best decision for my family's income.",
    name: "Suresh V.",
    trade: "Master Plumber",
    city: "Warangal",
    tenure: "2 Yrs Partner",
    rating: 5,
    earnings: "₹46,000 / mo",
    initial: "S",
    avatarBg: "bg-blue-500",
  },
  {
    quote:
      "As an AC technician, summers were busy but winters were dead. With V Solve Hub, I get consistent appliance maintenance contracts and commercial crew jobs all year round.",
    name: "Ananya Reddy",
    trade: "HVAC Specialist",
    city: "Nizamabad",
    tenure: "2.5 Yrs Partner",
    rating: 5,
    earnings: "₹58,000 / mo",
    initial: "A",
    avatarBg: "bg-indigo-500",
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

type FooterLink = {
  label: string;
  href?: string;
  section?: string;
  webHref?: string;
};

type FooterSection = {
  title: string;
  links: FooterLink[];
};

const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Partner With Us",
    links: [
      { label: "Become a Partner", href: "/apply" },
      { label: "High-Demand Trades", section: "services" },
      { label: "Payout Rates & Schedule", href: "/pricing" },
      { label: "How Onboarding Works", section: "how-it-works" },
      { label: "Contractors & Crew Supply", href: "/apply" },
    ],
  },
  {
    title: "Support & Help",
    links: [
      { label: "24/7 Partner Support Desk", webHref: `${WEB_BASE}/contact` },
      { label: "Frequently Asked Questions", section: "faq" },
      { label: "Partner Guides & Earnings Tips", webHref: `${WEB_BASE}/blog` },
      { label: "Safety & Emergency Response", webHref: `${WEB_BASE}/contact` },
    ],
  },
  {
    title: "Company & Trust",
    links: [
      { label: "About V Solve Hub", webHref: `${WEB_BASE}/about` },
      { label: "Partner Offices & Helpdesk", webHref: `${WEB_BASE}/contact` },
      { label: "Privacy & Data Protection", webHref: `${WEB_BASE}/privacy` },
      { label: "Partner Terms & Policies", webHref: `${WEB_BASE}/terms` },
    ],
  },
];

export default function Index() {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const [phone, setPhone] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [offerIndex, setOfferIndex] = useState(0);
  const [timerLeft, setTimerLeft] = useState(30);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const sectionPositions = useRef<Record<string, number>>({});
  const floatAnim = useRef(new Animated.Value(0)).current;

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

  const scrollToSection = (key: string) => {
    setMenuOpen(false);
    const y = sectionPositions.current[key];
    if (y !== undefined && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 70), animated: true });
    }
  };

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
      className="flex-1 bg-canvas"
      contentContainerClassName="pb-0"
      keyboardShouldPersistTaps="handled"
    >
      {/* ========================================================================= */}
      {/* 1. FLOATING DYNAMIC-ISLAND NAVIGATION BAR                                   */}
      {/* ========================================================================= */}
      <View className="sticky top-0 z-50 px-3 sm:px-6 pt-3 pb-2">
        <View className="mx-auto w-full max-w-5xl flex-row items-center justify-between rounded-full border border-line-strong bg-white/95 px-3.5 sm:px-4 py-2 shadow-md">
          <Pressable onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} className="active:opacity-80">
            <Logo />
          </Pressable>

          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/apply")}
              className="rounded-full bg-signal-500 px-4 py-2 active:bg-signal-600 shadow-sm"
              style={{
                backgroundColor: "#f87000",
                shadowColor: "#f87000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
              }}
            >
              <Text className="text-xs font-extrabold text-[#00112e]">Become a Partner</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Navigation menu"
              onPress={() => setMenuOpen((prev) => !prev)}
              className="h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-sunken active:bg-surface-hover"
            >
              <Svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="#00112e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                {menuOpen ? (
                  <Path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <Path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </Svg>
            </Pressable>
          </View>
        </View>

        {/* Dropdown Navigation Menu */}
        {menuOpen ? (
          <View className="mx-auto mt-2 w-full max-w-5xl overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-xl">
            <Pressable
              onPress={() => scrollToSection("how-it-works")}
              className="rounded-xl px-4 py-2.5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-navy-900">How It Works</Text>
            </Pressable>
            <Pressable
              onPress={() => scrollToSection("benefits")}
              className="rounded-xl px-4 py-2.5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-navy-900">Earnings & Benefits</Text>
            </Pressable>
            <Pressable
              onPress={() => scrollToSection("services")}
              className="rounded-xl px-4 py-2.5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-navy-900">High-Demand Trades</Text>
            </Pressable>
            <Pressable
              onPress={() => scrollToSection("testimonials")}
              className="rounded-xl px-4 py-2.5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-navy-900">Verified Partner Reviews</Text>
            </Pressable>
            <Pressable
              onPress={() => scrollToSection("faq")}
              className="rounded-xl px-4 py-2.5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-semibold text-navy-900">Frequently Asked Questions</Text>
            </Pressable>
            <View className="my-1.5 border-t border-line/60" />
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push("/login");
              }}
              className="rounded-xl px-4 py-2.5 bg-surface-sunken/60 active:bg-surface-sunken"
            >
              <Text className="text-sm font-bold text-signal-700">Partner Sign In →</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                router.push("/apply");
              }}
              className="rounded-xl px-4 py-2.5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-bold text-navy-900">Register as a Partner</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`);
              }}
              className="rounded-xl px-4 py-2.5 active:bg-surface-sunken"
            >
              <Text className="text-sm font-medium text-text-secondary">24/7 Support Desk</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* ========================================================================= */}
      {/* 2. HERO SECTION                                                           */}
      {/* ========================================================================= */}
      <View className="relative overflow-hidden bg-[#00112e] px-4 pt-6 pb-14 text-white">
        {/* Subtle Ambient Radial Glow */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -60,
            top: -40,
            width: 320,
            height: 320,
            borderRadius: 160,
            backgroundColor: "rgba(248, 112, 0, 0.15)",
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: -80,
            bottom: -60,
            width: 260,
            height: 260,
            borderRadius: 130,
            backgroundColor: "rgba(37, 99, 235, 0.1)",
          }}
        />

        <View className="mx-auto w-full max-w-md gap-4">
          {/* Bare Text Tag matching Web partner-hero.tsx */}
          <Text className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#fb8130]">
            Free to join
          </Text>

          {/* Main Headline with Heavy Plus Jakarta Sans Weight and Tight Tracking */}
          <View className="gap-1">
            <Text
              style={{
                fontSize: 38,
                lineHeight: 41,
                letterSpacing: -0.8,
              }}
              className="font-extrabold text-white"
            >
              Your skill. Their doorstep.
            </Text>
            <Text
              style={{
                fontSize: 38,
                lineHeight: 41,
                letterSpacing: -0.8,
              }}
              className="font-extrabold text-[#f87000]"
            >
              Paid instantly.
            </Text>
          </View>

          {/* Subtitle Body matching 17px leading-1.6 text-white/72 */}
          <Text
            style={{ fontSize: 17, lineHeight: 27 }}
            className="font-normal text-white/75 max-w-[440px]"
          >
            Join 5,000+ professionals across Telangana. Get local jobs and weekly payouts.
          </Text>

          {/* Phone Apply Input Form */}
          <View className="mt-2 gap-3">
            <View className="h-[52px] flex-row items-center rounded-xl border border-warm-300 bg-white px-3.5 shadow-sm">
              <View className="flex-row items-center gap-1.5 pr-2">
                <Phone size={16} color="#6b7280" />
                <Text className="text-sm font-bold text-gray-500">+91</Text>
              </View>
              <TextInput
                keyboardType="phone-pad"
                placeholder="Enter 10-digit number"
                placeholderTextColor="#9ca3af"
                value={phone}
                onChangeText={(val) => setPhone(val.replace(/\D/g, "").slice(0, 10))}
                className="h-full flex-1 pl-1 text-base font-semibold text-navy-900"
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleApply}
              className="h-[52px] w-full items-center justify-center rounded-xl bg-signal-500 active:bg-signal-600 shadow-md"
              style={{
                backgroundColor: "#f87000",
                shadowColor: "#f87000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
              }}
            >
              <Text className="text-base font-bold text-[#00112e]">Apply Now</Text>
            </Pressable>

            <View className="flex-row items-center gap-2 pt-0.5">
              <View className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <Text className="text-[13px] text-white/70">
                We'll send an OTP. Signup takes only 5 minutes.
              </Text>
            </View>

            {/* Already registered sign-in shortcut */}
            <View className="mt-2 flex-row items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-2.5">
              <Text className="text-xs text-white/80">Already registered as a Partner?</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/login")}
                className="rounded-full bg-white px-3.5 py-1.5 shadow-sm active:bg-amber-300"
              >
                <Text className="text-xs font-extrabold text-[#00112e]">Sign In</Text>
              </Pressable>
            </View>
          </View>

          {/* 3D App Mockup Phone Preview with Idle Float & 3-Degree Tilt */}
          <View className="mt-8 items-center">
            <Animated.View
              style={{
                transform: [{ translateY: floatAnim }],
              }}
            >
              <View
                style={{
                  width: 280,
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
                        <Text className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Today's Earnings</Text>
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

      {/* ========================================================================= */}
      {/* 3. TRUST & STATS TICKER STRIP                                              */}
      {/* ========================================================================= */}
      <View className="border-y border-line bg-surface py-7 px-4">
        <View className="mx-auto w-full max-w-5xl flex-row flex-wrap justify-between gap-3">
          {STATS.map((s) => {
            const Icon = s.icon;
            return (
              <View
                key={s.label}
                style={{ width: "48%", minWidth: 155 }}
                className="flex-row items-center gap-3 rounded-2xl bg-surface-sunken p-3.5 border border-line/60"
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-2xs shrink-0">
                  <Icon size={22} color={s.color} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-xl font-black text-navy-900 tracking-tight" numberOfLines={1}>{s.value}</Text>
                  <Text className="text-xs font-semibold text-text-secondary" numberOfLines={1}>{s.label}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 4. HOW IT WORKS                                                           */}
      {/* ========================================================================= */}
      <View
        onLayout={(e) => {
          sectionPositions.current["how-it-works"] = e.nativeEvent.layout.y;
        }}
        className="px-4 py-14 bg-white"
      >
        <View className="mx-auto w-full max-w-md">
          {/* Header */}
          <View className="items-center text-center gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 border border-orange-200">
              <Sparkles size={14} color="#ea580c" />
              <Text className="text-xs font-extrabold text-signal-700">Simple 4-Step Journey</Text>
            </View>
            <Text className="text-center text-2xl font-black text-navy-900 tracking-tight">
              How Becoming a Partner Works
            </Text>
            <Text className="text-center text-xs leading-relaxed text-text-secondary">
              From registration to your first payout in four quick steps. Zero joining fees and no complicated paperwork.
            </Text>
          </View>

          {/* Stepper Cards */}
          <View className="mt-8 gap-4">
            {HOW_IT_WORKS_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <View key={step.step} className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
                  <View className="flex-row items-center justify-between">
                    <View
                      style={{ backgroundColor: step.color }}
                      className="h-11 w-11 items-center justify-center rounded-xl shadow-xs"
                    >
                      <Icon size={22} color="#ffffff" />
                    </View>
                    <View className={`rounded-full px-2.5 py-0.5 border ${step.badgeBg}`}>
                      <Text className="text-[10px] font-extrabold">{step.badge}</Text>
                    </View>
                  </View>

                  <View className="mt-4">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-text-muted">
                      STEP {step.step}
                    </Text>
                    <Text className="mt-1 text-base font-bold text-navy-900">{step.title}</Text>
                    <Text className="mt-1.5 text-xs leading-relaxed text-text-secondary">
                      {step.desc}
                    </Text>
                  </View>

                  <View className="mt-4 pt-3 border-t border-line flex-row items-center gap-1.5">
                    <CheckCircle2 size={14} color="#059669" />
                    <Text className="text-xs font-bold text-navy-900">{step.highlight}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Bottom Action CTA */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className="mt-8 h-13 w-full flex-row items-center justify-center gap-2 rounded-full bg-signal-500 active:bg-signal-600 shadow-lg shadow-signal-500/25"
          >
            <Text className="text-sm font-extrabold text-white">Start Your Partner Application</Text>
            <ArrowRight size={16} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 5. PLATFORM ADVANTAGES / WHY PARTNER WITH US                              */}
      {/* ========================================================================= */}
      <View
        onLayout={(e) => {
          sectionPositions.current["benefits"] = e.nativeEvent.layout.y;
        }}
        className="border-t border-line bg-surface-sunken/50 px-4 py-14"
      >
        <View className="mx-auto w-full max-w-md">
          {/* Header */}
          <View className="items-center text-center gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full bg-navy-100 px-3.5 py-1 border border-navy-200">
              <Award size={14} color="#00112e" />
              <Text className="text-xs font-extrabold text-navy-900">Platform Advantages</Text>
            </View>
            <Text className="text-center text-2xl font-black text-navy-900 tracking-tight">
              Built for Your Independence & Growth
            </Text>
            <Text className="text-center text-xs leading-relaxed text-text-secondary">
              Everything you need to run and scale your service trade with dignity, security, and top earnings.
            </Text>
          </View>

          {/* 4 Modern Bento Cards */}
          <View className="mt-8 gap-4">
            {FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <View key={feat.title} className="rounded-3xl border border-line bg-white p-5 shadow-xs">
                  <View className="flex-row items-center justify-between">
                    <View className={`h-11 w-11 items-center justify-center rounded-xl border ${feat.iconColor}`}>
                      <Icon size={20} />
                    </View>
                    <View className="rounded-full bg-surface-sunken px-2.5 py-0.5 border border-line">
                      <Text className="text-[10px] font-bold text-text-secondary">{feat.tag}</Text>
                    </View>
                  </View>

                  <Text className="mt-4 text-base font-bold text-navy-900">{feat.title}</Text>
                  <Text className="mt-1.5 text-xs leading-relaxed text-text-secondary">{feat.body}</Text>

                  <View className="mt-4 pt-3 border-t border-line/70 flex-row items-center gap-1.5">
                    <CheckCircle2 size={14} color="#059669" />
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
      <View
        onLayout={(e) => {
          sectionPositions.current["services"] = e.nativeEvent.layout.y;
        }}
        className="border-t border-line bg-surface px-4 py-14"
      >
        <View className="mx-auto w-full max-w-md">
          {/* Header */}
          <View className="items-center text-center gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 border border-orange-200">
              <Sparkles size={14} color="#ea580c" />
              <Text className="text-xs font-extrabold text-signal-700">High Demand Trades</Text>
            </View>
            <Text className="text-center text-2xl font-black text-navy-900 tracking-tight">
              Choose Your Trade to Start Earning
            </Text>
            <Text className="text-center text-xs leading-relaxed text-text-secondary">
              Active customer demand across Telangana guarantees regular jobs and reliable weekly earnings.
            </Text>
          </View>

          {/* 8 Trade Cards */}
          <View className="mt-8 gap-3.5">
            {HIGH_DEMAND_TRADES.map((trade) => {
              const Icon = trade.icon;
              return (
                <Pressable
                  key={trade.slug}
                  accessibilityRole="button"
                  onPress={() => router.push(`/apply?trade=${trade.slug}`)}
                  className="rounded-3xl border border-line bg-surface p-4 active:bg-white shadow-2xs"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-3">
                      <View className={`h-11 w-11 items-center justify-center rounded-xl border ${trade.iconBg}`}>
                        <Icon size={20} />
                      </View>
                      <View>
                        <Text className="text-base font-bold text-navy-900">{trade.name}</Text>
                        <Text className="text-xs font-bold text-signal-700 mt-0.5">{trade.earnings}</Text>
                      </View>
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

                  <View className="mt-3.5 flex-row flex-wrap gap-1.5">
                    {trade.skills.map((skill) => (
                      <View key={skill} className="rounded-lg bg-surface-sunken px-2 py-0.5 border border-line/60">
                        <Text className="text-[10px] font-semibold text-text-secondary">{skill}</Text>
                      </View>
                    ))}
                  </View>

                  {/* 1-Click Action Row */}
                  <View className="mt-3.5 pt-3 border-t border-line flex-row items-center justify-between">
                    <Text className="text-xs font-bold text-navy-900">Apply for {trade.name}</Text>
                    <ArrowRight size={14} color="#00112e" />
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Specialist Contractor Banner */}
          <View className="mt-8 rounded-3xl bg-[#00112e] p-6 shadow-2xl border border-white/10">
            <View className="self-start rounded-full bg-white/10 px-2.5 py-0.5 border border-white/20">
              <Text className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                Contractors & Fleet Owners
              </Text>
            </View>
            <Text className="mt-2.5 text-lg font-bold text-white">
              Supply Multi-Person Crews & Quote Custom Projects
            </Text>
            <Text className="mt-1 text-xs text-navy-200 leading-relaxed">
              Register complete work teams for daily workforce dispatch, commercial renovations, and high-volume corporate contracts.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/apply")}
              className="mt-4 self-start rounded-full bg-white px-5 py-2.5 shadow-md active:bg-navy-50"
            >
              <Text className="text-xs font-bold text-[#00112e]">Apply for Specialist Work →</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 7. TESTIMONIALS / VERIFIED PARTNER STORIES                                */}
      {/* ========================================================================= */}
      <View
        onLayout={(e) => {
          sectionPositions.current["testimonials"] = e.nativeEvent.layout.y;
        }}
        className="border-t border-line bg-surface-sunken/40 px-4 py-14"
      >
        <View className="mx-auto w-full max-w-md">
          {/* Header */}
          <View className="items-center text-center gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 border border-emerald-200">
              <ShieldCheck size={14} color="#059669" />
              <Text className="text-xs font-extrabold text-emerald-800">Verified Partner Stories</Text>
            </View>
            <Text className="text-center text-2xl font-black text-navy-900 tracking-tight">
              Trusted by 5,000+ Skilled Professionals
            </Text>
            <Text className="text-center text-xs leading-relaxed text-text-secondary">
              Real stories, verified partner reviews, and reliable weekly earnings across Telangana.
            </Text>

            {/* Rating Summary Pill */}
            <View className="mt-3 flex-row items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 border border-line shadow-xs">
              <View className="flex-row gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={12} fill="#f59e0b" color="#f59e0b" />
                ))}
              </View>
              <Text className="text-[11px] font-bold text-navy-900">
                4.9 / 5 Average Partner Satisfaction (12,000+ Reviews)
              </Text>
            </View>
          </View>

          {/* Testimonial Cards Horizontal Snap-Scroll Carousel */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 4,
              gap: 16,
              paddingBottom: 8,
            }}
            snapToInterval={296}
            decelerationRate="fast"
            className="mt-8"
          >
            {TESTIMONIALS.map((t) => (
              <View
                key={t.name}
                style={{ width: 280 }}
                className="rounded-3xl border border-line bg-white p-5 shadow-xs justify-between"
              >
                <View>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row gap-0.5">
                      {[...Array(t.rating)].map((_, i) => (
                        <Star key={i} size={13} fill="#f59e0b" color="#f59e0b" />
                      ))}
                    </View>
                    <View className="rounded-full bg-emerald-50 px-2.5 py-0.5 border border-emerald-200">
                      <Text className="text-[11px] font-extrabold text-emerald-800">{t.earnings}</Text>
                    </View>
                  </View>

                  <Text className="mt-3 text-xs leading-relaxed text-navy-950 font-medium">
                    "{t.quote}"
                  </Text>
                </View>

                <View className="mt-5 pt-3.5 border-t border-line flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2.5">
                    <View className={`h-9 w-9 items-center justify-center rounded-xl ${t.avatarBg}`}>
                      <Text className="text-xs font-black text-white">{t.initial}</Text>
                    </View>
                    <View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-xs font-extrabold text-navy-900">{t.name}</Text>
                        <CheckCircle2 size={12} color="#059669" />
                      </View>
                      <Text className="text-[10px] text-text-secondary">{t.trade} • {t.city}</Text>
                    </View>
                  </View>
                  <View className="rounded-full bg-surface-sunken px-2.5 py-1 border border-line">
                    <Text className="text-[10px] font-bold text-text-muted">{t.tenure}</Text>
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 8. FAQ SECTION                                                            */}
      {/* ========================================================================= */}
      <View
        onLayout={(e) => {
          sectionPositions.current["faq"] = e.nativeEvent.layout.y;
        }}
        className="border-t border-line bg-surface px-4 py-14"
      >
        <View className="mx-auto w-full max-w-md">
          {/* Header */}
          <View className="items-center text-center gap-2">
            <View className="rounded-full bg-navy-50 px-3.5 py-1 border border-navy-200">
              <Text className="text-xs font-extrabold text-navy-900">Got Questions?</Text>
            </View>
            <Text className="text-center text-2xl font-black text-navy-900 tracking-tight">
              Frequently Asked Questions
            </Text>
            <Text className="text-center text-xs text-text-secondary leading-relaxed">
              Everything you need to know about registering, verification, and getting paid.
            </Text>
          </View>

          {/* Accordion list */}
          <View className="mt-8 gap-2.5">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <View key={faq.q} className="rounded-2xl border border-line bg-surface overflow-hidden">
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => toggleFaq(idx)}
                    className="flex-row items-center justify-between p-4 active:bg-surface-sunken"
                  >
                    <Text className="text-xs font-bold text-navy-900 flex-1 pr-2">{faq.q}</Text>
                    {isOpen ? (
                      <ChevronUp size={16} color="#6b7280" />
                    ) : (
                      <ChevronDown size={16} color="#6b7280" />
                    )}
                  </Pressable>
                  {isOpen ? (
                    <View className="px-4 pb-4 pt-1 border-t border-line/40">
                      <Text className="text-xs leading-relaxed text-text-secondary">{faq.a}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>

          {/* Helpdesk Callout Card */}
          <View className="mt-8 rounded-2xl border border-line bg-surface-sunken p-5 items-center text-center">
            <Text className="text-xs font-bold text-navy-900">Have a specific question not covered here?</Text>
            <Text className="mt-1 text-[11px] text-text-secondary text-center leading-relaxed">
              Our partner helpdesk is available 24/7 to guide you through registration and verification.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`)}
              className="mt-3"
            >
              <Text className="text-xs font-bold text-signal-700 underline">
                Contact Partner Support →
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 9. FINAL HIGH-IMPACT CTA BAND                                              */}
      {/* ========================================================================= */}
      <View className="px-4 py-8">
        <View className="mx-auto w-full max-w-md rounded-3xl bg-[#00112e] p-7 items-center text-center shadow-2xl border border-white/10">
          <View className="flex-row items-center gap-1.5 rounded-full bg-signal-500/20 px-3.5 py-1 border border-signal-500/30">
            <Sparkles size={12} color="#fcd34d" />
            <Text className="text-[11px] font-extrabold text-amber-300">Start Earning This Week</Text>
          </View>
          <Text className="mt-3.5 text-2xl font-black text-white text-center leading-snug">
            Ready to Build a High-Earning Service Business?
          </Text>
          <Text className="mt-2.5 text-xs text-navy-200 text-center leading-relaxed">
            Join 5,000+ happy technicians across Telangana. Zero upfront cost, weekly automatic payouts, and instant local job offers.
          </Text>
          <View className="mt-6 w-full gap-2.5">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/apply")}
              className="h-12 w-full flex-row items-center justify-center gap-2 rounded-full bg-signal-500 active:bg-signal-600 shadow-xl shadow-signal-500/30"
            >
              <Text className="text-xs font-extrabold text-white">Register as a Partner Now</Text>
              <ArrowRight size={14} color="#ffffff" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/contact`)}
              className="h-12 w-full items-center justify-center rounded-full border border-white/25 bg-white/10 active:bg-white/20"
            >
              <Text className="text-xs font-bold text-white">Contact Support</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 10. COMPREHENSIVE FOOTER (MATCHING WEB LAYOUT.TSX)                         */}
      {/* ========================================================================= */}
      <View className="border-t border-navy-800 bg-[#00112e] text-slate-300 px-4 pt-12 pb-10">
        <View className="mx-auto w-full max-w-md">
          {/* Brand Info */}
          <Logo dark />
          <Text className="mt-3.5 text-xs leading-relaxed text-slate-300">
            Empowering skilled technicians, electricians, plumbers, drivers, and service entrepreneurs across Telangana with steady local jobs, direct weekly payouts, and modern digital tools.
          </Text>

          {/* Trust Badges */}
          <View className="mt-5 flex-row flex-wrap gap-2">
            <View className="flex-row items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1">
              <ShieldCheck size={12} color="#fb923c" />
              <Text className="text-[11px] font-semibold text-slate-200">Verified Platform</Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1">
              <Zap size={12} color="#f59e0b" />
              <Text className="text-[11px] font-semibold text-slate-200">Weekly Payouts</Text>
            </View>
            <View className="flex-row items-center gap-1.5 rounded-full bg-white/5 border border-white/10 px-3 py-1">
              <Lock size={12} color="#34d399" />
              <Text className="text-[11px] font-semibold text-slate-200">Bank-Grade Security</Text>
            </View>
          </View>

          {/* Footer Navigation Columns */}
          <View className="mt-8 border-t border-navy-800/80 pt-6 gap-6">
            {FOOTER_SECTIONS.map((section) => (
              <View key={section.title}>
                <Text className="text-xs font-black uppercase tracking-wider text-slate-100">
                  {section.title}
                </Text>
                <View className="mt-2.5 gap-2">
                  {section.links.map((link) => (
                    <Pressable
                      key={link.label}
                      accessibilityRole="button"
                      onPress={() => {
                        if (link.section) {
                          scrollToSection(link.section);
                        } else if (link.href) {
                          router.push(link.href as any);
                        } else if (link.webHref) {
                          void WebBrowser.openBrowserAsync(link.webHref);
                        }
                      }}
                      className="py-0.5 active:opacity-70"
                    >
                      <Text className="text-xs text-slate-400">
                        {link.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Operational Hubs in Telangana */}
          <View className="mt-8 border-t border-navy-800/80 pt-6 gap-3">
            <Text className="text-xs font-bold text-slate-200">Operational Hubs in Telangana:</Text>
            <View className="flex-row flex-wrap gap-1.5">
              {["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"].map((city) => (
                <View key={city} className="rounded-full bg-white/5 border border-white/10 px-2.5 py-0.5">
                  <Text className="text-[10px] text-slate-300">{city}</Text>
                </View>
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => void WebBrowser.openBrowserAsync(`tel:18008765832`)}
              className="mt-2 flex-row items-center gap-1.5 active:opacity-80"
            >
              <PhoneCall size={14} color="#f59e0b" />
              <Text className="text-xs font-bold text-amber-400">
                Partner Helpline: +91 (800) 876-5832
              </Text>
            </Pressable>
          </View>

          {/* Copyright and Legal Row */}
          <View className="mt-8 border-t border-navy-800/80 pt-6 gap-2">
            <Text className="text-[11px] text-slate-400">
              © {new Date().getFullYear()} V Solve Hub Technologies Pvt. Ltd. All rights reserved.
            </Text>
            <View className="flex-row flex-wrap items-center gap-3">
              <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/privacy`)}>
                <Text className="text-[11px] text-slate-400 underline">Privacy Policy</Text>
              </Pressable>
              <Text className="text-slate-500">•</Text>
              <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/terms`)}>
                <Text className="text-[11px] text-slate-400 underline">Terms of Service</Text>
              </Pressable>
              <Text className="text-slate-500">•</Text>
              <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${WEB_BASE}/pricing`)}>
                <Text className="text-[11px] text-slate-400 underline">Payout Policy</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
