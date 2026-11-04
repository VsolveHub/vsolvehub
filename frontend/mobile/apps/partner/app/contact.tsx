import { Text } from "@vsolve/mobile-ui";
import * as WebBrowser from "expo-web-browser";
import { Clock, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react-native";
import { Platform, Pressable, ScrollView, StatusBar, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MarketingHeader } from "../src/components/marketing-header";
import { MarketingFooter } from "../src/components/marketing-footer";

const CHANNELS = [
  {
    icon: MessageCircle,
    iconColor: "#059669",
    iconBg: "#ecfdf5",
    iconBorder: "#a7f3d0",
    title: "WhatsApp",
    detail: "Chat with support instantly",
    value: "+91 879 056 4634",
    url: "https://wa.me/918790564634",
  },
  {
    icon: Phone,
    iconColor: "#0284c7",
    iconBg: "#f0f9ff",
    iconBorder: "#bae6fd",
    title: "Call us",
    detail: "9am–9pm, all days",
    value: "+91 879 056 4634",
    url: "tel:+918790564634",
  },
  {
    icon: Mail,
    iconColor: "#d97706",
    iconBg: "#fffbeb",
    iconBorder: "#fde68a",
    title: "Email",
    detail: "We reply within a business day",
    value: "support@vsolvehub.com",
    url: "mailto:support@vsolvehub.com",
  },
];

export default function ContactScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'ios' ? 48 : (StatusBar.currentHeight ?? 16));
  const heroPaddingTop = isDesktop ? 128 : topInset + 80;

  const handleOpen = (url: string) => {
    void WebBrowser.openBrowserAsync(url);
  };

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-0">
      <MarketingHeader activeTab="contact" />

      {/* Hero Header */}
      <View className="px-5 pb-8 sm:pb-14" style={{ paddingTop: heroPaddingTop }}>
        <View className="mx-auto w-full max-w-3xl items-center text-center">
          <View className="flex-row items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3.5 py-1 shadow-xs mb-3">
            <ShieldCheck size={14} color="#059669" />
            <Text className="text-xs font-bold text-navy-900">
              Partner Support & Helpline
            </Text>
          </View>

          <Text
            style={{
              fontSize: isDesktop ? 44 : 32,
              fontWeight: "900",
              lineHeight: isDesktop ? 52 : 38,
              letterSpacing: -1,
              marginTop: 10,
              color: "#00112e",
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            }}
            className="text-center"
          >
            Contact us
          </Text>

          <Text
            style={{
              fontSize: isDesktop ? 16 : 14,
              lineHeight: isDesktop ? 26 : 22,
              marginTop: 12,
              color: "#64748b",
              maxWidth: 580,
              fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
            }}
            className="text-center"
          >
            Questions about becoming a partner or need help with your account? Reach our dedicated partner support team any day, 9am–9pm.
          </Text>
        </View>

        {/* 3 Channels Cards */}
        <View
          className={`mx-auto mt-10 w-full max-w-3xl ${
            isDesktop ? "flex-row gap-4" : "gap-4"
          }`}
        >
          {CHANNELS.map((c) => {
            const Icon = c.icon;
            return (
              <Pressable
                key={c.title}
                accessibilityRole="button"
                onPress={() => handleOpen(c.url)}
                className={`rounded-3xl border border-slate-200 bg-white p-6 items-center text-center shadow-xs active:bg-slate-50 ${
                  isDesktop ? "flex-1" : "w-full"
                }`}
              >
                <View
                  style={{ backgroundColor: c.iconBg, borderColor: c.iconBorder }}
                  className="h-14 w-14 items-center justify-center rounded-2xl border shadow-xs"
                >
                  <Icon size={26} color={c.iconColor} />
                </View>
                <Text className="mt-4 text-base font-bold text-navy-900 text-center">{c.title}</Text>
                <Text className="mt-1 text-xs text-slate-500 text-center">{c.detail}</Text>
                <Text className="mt-3 text-sm font-extrabold text-navy-900 text-center">
                  {c.value}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Operating Hours & Physical Center Card */}
        <View
          className={`mx-auto mt-8 w-full max-w-3xl rounded-3xl border border-slate-200 bg-slate-50/80 p-6 ${
            isDesktop ? "flex-row items-center justify-between gap-6" : "gap-4"
          }`}
        >
          <View className="flex-row items-start gap-3.5 flex-1">
            <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 border border-purple-100">
              <Clock size={20} color="#7c3aed" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-navy-900">Operating Hours</Text>
              <Text className="text-xs text-slate-500 mt-1 leading-relaxed">
                Monday through Sunday, 9:00 AM – 9:00 PM IST
              </Text>
            </View>
          </View>

          <View
            className={`flex-row items-start gap-3.5 flex-1 ${
              isDesktop ? "border-l border-slate-200 pl-6" : "border-t border-slate-200 pt-4"
            }`}
          >
            <View className="h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 border border-teal-100">
              <MapPin size={20} color="#0d9488" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-navy-900">Partner Onboarding Hub</Text>
              <Text className="text-xs text-slate-500 mt-1 leading-relaxed">
                Hitech City, Hyderabad, Telangana 500081
              </Text>
            </View>
          </View>
        </View>
      </View>

      <MarketingFooter />
    </ScrollView>
  );
}

