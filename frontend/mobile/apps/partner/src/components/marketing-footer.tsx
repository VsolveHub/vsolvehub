import { Logo, Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Lock, PhoneCall, ShieldCheck, Zap } from "lucide-react-native";
import { Pressable, useWindowDimensions, View } from "react-native";
import { PARTNER_SUPPORT_HOURS, PARTNER_SUPPORT_PHONE, PARTNER_SUPPORT_PHONE_DISPLAY } from "@/features/support/contact";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "https://partner.vsolvehub.com";

type FooterLink = {
  label: string;
  href?: string;
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
      { label: "High-Demand Trades", href: "/trades" },
      { label: "Payout Rates & Schedule", href: "/benefits" },
      { label: "How Onboarding Works", href: "/how-it-works" },
      { label: "Contractors & Crew Supply", href: "/trades" },
    ],
  },
  {
    title: "Support & Help",
    links: [
      { label: "24/7 Partner Support Desk", href: "/contact" },
      { label: "Frequently Asked Questions", href: "/how-it-works" },
      { label: "Partner Guides & Earnings Tips", href: "/benefits" },
      { label: "Safety & Emergency Response", href: "/contact" },
    ],
  },
  {
    title: "Company & Trust",
    links: [
      { label: "About V Solve Hub", webHref: `${WEB_BASE}/about` },
      { label: "Partner Offices & Helpdesk", href: "/contact" },
      { label: "Privacy & Data Protection", webHref: `${WEB_BASE}/privacy` },
      { label: "Partner Terms & Policies", webHref: `${WEB_BASE}/terms` },
    ],
  },
];

export function MarketingFooter() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <View
      style={{
        backgroundColor: "#000e29",
        borderTopWidth: 1,
        borderTopColor: "rgba(30, 41, 59, 0.8)",
      }}
      className="text-slate-300 overflow-hidden"
    >
      <View className={`mx-auto w-full ${isDesktop ? "max-w-6xl px-6 pt-16 pb-12" : "max-w-md px-5 pt-12 pb-8"}`}>
        {/* Top Row: Brand Info + Links Grid */}
        <View className={isDesktop ? "flex-row justify-between gap-12 pb-14 border-b border-navy-800" : "gap-8"}>
          {/* Left Brand Summary */}
          <View className={isDesktop ? "w-[40%] justify-between" : "w-full"}>
            <View>
              <Logo dark />
              <Text className="mt-4 text-xs leading-relaxed text-slate-300">
                Empowering skilled technicians, electricians, plumbers, drivers, and service entrepreneurs across Telangana with steady local jobs, direct weekly payouts, and modern digital tools.
              </Text>
            </View>

            {/* Trust Badges */}
            <View className="mt-6 flex-row flex-wrap gap-2">
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
          </View>

          {/* Right Links Columns */}
          <View className={isDesktop ? "w-[56%] flex-row justify-between gap-6" : "border-t border-navy-800/80 pt-6 gap-6"}>
            {FOOTER_SECTIONS.map((section) => (
              <View key={section.title} className={isDesktop ? "flex-1" : ""}>
                <Text className="text-xs font-black uppercase tracking-wider text-slate-100">
                  {section.title}
                </Text>
                <View className="mt-3 gap-2.5">
                  {section.links.map((link) => (
                    <Pressable
                      key={link.label}
                      accessibilityRole="button"
                      onPress={() => {
                        if (link.href) {
                          router.push(link.href as any);
                        } else if (link.webHref) {
                          void WebBrowser.openBrowserAsync(link.webHref);
                        }
                      }}
                      className="py-0.5 active:opacity-70"
                    >
                      <Text className="text-xs text-slate-400 hover:text-white">
                        {link.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Operational Hubs in Telangana */}
        <View className="mt-8 border-t border-navy-800/80 pt-6 gap-3">
          <Text className="text-xs font-bold text-slate-200">Operational Hubs in Telangana:</Text>
          <View className="flex-row flex-wrap gap-2">
            {["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"].map((city) => (
              <View key={city} className="rounded-full bg-white/5 border border-white/10 px-3 py-1">
                <Text className="text-[11px] text-slate-300">{city}</Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => void WebBrowser.openBrowserAsync(`tel:${PARTNER_SUPPORT_PHONE}`)}
            className="mt-2 flex-row items-center gap-2 active:opacity-80"
          >
            <PhoneCall size={14} color="#f59e0b" />
            <Text className="text-xs font-bold text-amber-400">
              Partner Helpline: {PARTNER_SUPPORT_PHONE_DISPLAY} ({PARTNER_SUPPORT_HOURS})
            </Text>
          </Pressable>
        </View>

        {/* Copyright and Legal Row */}
        <View
          className={`mt-8 border-t border-navy-800/80 pt-6 ${
            isDesktop ? "flex-row items-center justify-between" : "gap-3"
          }`}
        >
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
  );
}

