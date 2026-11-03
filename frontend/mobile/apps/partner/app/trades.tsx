import { Text } from "@vsolve/mobile-ui";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  CheckCircle2,
  Droplets,
  Flame,
  Hammer,
  Scissors,
  ShieldAlert,
  Sparkles,
  Users,
  Wind,
  Wrench,
  Zap,
} from "lucide-react-native";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { MarketingHeader } from "../src/components/marketing-header";
import { MarketingFooter } from "../src/components/marketing-footer";

const TRADES = [
  {
    slug: "electrician",
    name: "Electrician",
    icon: Zap,
    iconBg: "bg-amber-50 text-amber-600 border-amber-200",
    earnings: "₹45,000 – ₹65,000 / mo",
    demand: "350+ Daily Jobs",
    hot: true,
    desc: "Residential wiring, fan & light installation, switchboard repair, MCBs, inverter setups, and short circuit troubleshooting.",
    skills: ["House Wiring", "Switchboards", "MCBs & Fuse", "Inverters", "Light Fitting", "Appliance Install"],
  },
  {
    slug: "plumber",
    name: "Plumber",
    icon: Wrench,
    iconBg: "bg-blue-50 text-blue-600 border-blue-200",
    earnings: "₹40,000 – ₹60,000 / mo",
    demand: "280+ Daily Jobs",
    hot: false,
    desc: "Pipe repairs, tap & faucet fixing, bathroom fittings, water motor & pump installation, drainage clearing, and water tank service.",
    skills: ["Pipe Fitting", "Tap Repair", "Motor & Pump", "Drainage", "Flush Repair", "Basin Fitting"],
  },
  {
    slug: "carpenter",
    name: "Carpenter",
    icon: Hammer,
    iconBg: "bg-yellow-50 text-amber-700 border-yellow-200",
    earnings: "₹42,000 – ₹58,000 / mo",
    demand: "190+ Daily Jobs",
    hot: false,
    desc: "Door lock repairs, furniture assembly, hinges & handles, cupboard fixing, curtain rods, and custom wood polishing.",
    skills: ["Furniture Assembly", "Door Locks", "Cupboards", "Polishing", "Hinges", "Modular Fitting"],
  },
  {
    slug: "ac-technician",
    name: "AC Technician",
    icon: Wind,
    iconBg: "bg-sky-50 text-sky-600 border-sky-200",
    earnings: "₹55,000 – ₹85,000 / mo",
    demand: "420+ Daily Jobs",
    hot: true,
    desc: "AC foam jet deep cleaning, gas refilling, split & window AC installation/uninstallation, PCB repair, and compressor diagnostics.",
    skills: ["AC Deep Clean", "Gas Refill", "Installs", "Compressor", "PCB Repair", "Leak Fix"],
  },
  {
    slug: "ro-technician",
    name: "RO Water Purifier Technician",
    icon: Droplets,
    iconBg: "bg-teal-50 text-teal-600 border-teal-200",
    earnings: "₹38,000 – ₹55,000 / mo",
    demand: "180+ Daily Jobs",
    hot: false,
    desc: "Water purifier installation, pre-filter and sediment filter replacement, RO membrane service, and TDS water quality testing.",
    skills: ["Purifier Install", "Filter Swap", "Membrane", "TDS Check", "Pump Repair", "Tubing Check"],
  },
  {
    slug: "home-cleaning",
    name: "Home Deep Cleaning",
    icon: Sparkles,
    iconBg: "bg-emerald-50 text-emerald-600 border-emerald-200",
    earnings: "₹35,000 – ₹52,000 / mo",
    demand: "260+ Daily Jobs",
    hot: false,
    desc: "Full home deep cleaning, kitchen degreasing, bathroom scrubbing, sofa shampooing, carpet wash, and move-in sanitization.",
    skills: ["Full Home Clean", "Bathroom Scrub", "Kitchen Degrease", "Sofa Wash", "Carpet Wash", "Move-In Cleaning"],
  },
  {
    slug: "pest-control",
    name: "Pest Control Specialist",
    icon: ShieldAlert,
    iconBg: "bg-rose-50 text-rose-600 border-rose-200",
    earnings: "₹45,000 – ₹68,000 / mo",
    demand: "150+ Daily Jobs",
    hot: true,
    desc: "Odorless cockroach herbal gel treatments, anti-termite drilling, bed bug thermal spray, and mosquito fogging services.",
    skills: ["Cockroach Gel", "Termite Drill", "Bedbugs Spray", "Mosquito Fog", "Rodent Control", "Herbal Treatment"],
  },
  {
    slug: "beauty",
    name: "Beauty & Wellness Professional",
    icon: Scissors,
    iconBg: "bg-pink-50 text-pink-600 border-pink-200",
    earnings: "₹48,000 – ₹75,000 / mo",
    demand: "320+ Daily Jobs",
    hot: true,
    desc: "At-home salon, hair styling, gold & diamond facials, waxing, pedicure & manicure, head massage, and bridal makeup appointments.",
    skills: ["Hair Styling", "Facials & Cleanup", "Waxing", "Bridal Makeup", "Nail Art", "Spa Treatments"],
  },
];

export default function TradesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  return (
    <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-0">
      <MarketingHeader activeTab="trades" />

      {/* Hero Header */}
      <View className="px-5 pt-12 pb-8 sm:pt-20 sm:pb-14">
        <View className="mx-auto w-full max-w-4xl items-center text-center">
          <View className="flex-row items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 border border-orange-200 shadow-xs">
            <Sparkles size={14} color="#ea580c" />
            <Text className="text-xs font-extrabold text-[#ea580c]">
              High Demand Trades
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
            Supported Trades & Service Specialties
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
            Explore high-earning crafts across Telangana with guaranteed booking volume and transparent weekly settlements.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className="mt-8 flex-row items-center justify-center gap-2 rounded-full bg-[#f87000] active:bg-[#ea580c] px-8 py-3.5 shadow-lg shadow-orange-500/25"
          >
            <Text className="text-sm font-extrabold text-white">Apply for Any Trade</Text>
            <ArrowRight size={16} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {/* Grid of Trades */}
      <View className="px-5 py-8 sm:py-12">
        <View
          className={`mx-auto w-full max-w-6xl ${
            isDesktop ? "flex-row flex-wrap gap-6" : "gap-5"
          }`}
        >
          {TRADES.map((trade) => {
            const Icon = trade.icon;
            return (
              <View
                key={trade.slug}
                style={isDesktop ? { width: "calc(50% - 12px)" as any } : undefined}
                className="rounded-3xl border border-slate-200 bg-white p-7 sm:p-8 shadow-xs flex-col justify-between"
              >
                <View>
                  <View className="flex-row items-center justify-between">
                    <View className={`h-14 w-14 items-center justify-center rounded-2xl border ${trade.iconBg}`}>
                      <Icon size={26} />
                    </View>

                    <View
                      className={`flex-row items-center gap-1 rounded-full px-3 py-1 border ${
                        trade.hot
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}
                    >
                      {trade.hot ? <Flame size={12} color="#e11d48" /> : null}
                      <Text
                        className={`text-xs font-extrabold ${
                          trade.hot ? "text-rose-700" : "text-emerald-700"
                        }`}
                      >
                        {trade.demand}
                      </Text>
                    </View>
                  </View>

                  <View className="mt-6 flex-row items-baseline justify-between gap-4">
                    <Text className="text-xl font-bold text-navy-900">{trade.name}</Text>
                    <Text className="text-sm font-extrabold text-[#ea580c]">{trade.earnings}</Text>
                  </View>

                  <Text className="mt-2.5 text-sm text-slate-600 leading-relaxed">{trade.desc}</Text>

                  {/* Skills tags */}
                  <View className="mt-5 flex-row flex-wrap gap-2">
                    {trade.skills.map((skill) => (
                      <View
                        key={skill}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 border border-slate-200/60"
                      >
                        <Text className="text-xs font-semibold text-slate-600">{skill}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Bottom 1-Click Apply */}
                <View className="mt-7 pt-4 border-t border-slate-100 flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <CheckCircle2 size={16} color="#059669" />
                    <Text className="text-xs font-bold text-emerald-700">Instant Booking Dispatch</Text>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push(`/apply?trade=${trade.slug}`)}
                    className="flex-row items-center gap-1.5 rounded-full bg-navy-900 active:bg-slate-800 px-4 py-2"
                  >
                    <Text className="text-xs font-bold text-white">Apply Now</Text>
                    <ArrowRight size={14} color="#ffffff" />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Contractor & Multi-Crew Section */}
      <View className="px-5 py-12 sm:py-16">
        <View
          className={`mx-auto w-full max-w-6xl rounded-3xl bg-[#00112e] p-8 sm:p-12 text-white shadow-2xl border border-white/10 ${
            isDesktop ? "flex-row items-center justify-between gap-8" : "gap-6"
          }`}
        >
          <View className={isDesktop ? "max-w-xl" : "w-full"}>
            <View className="self-start flex-row items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 border border-white/20">
              <Users size={14} color="#fcd34d" />
              <Text className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                Contractors & Fleet Suppliers
              </Text>
            </View>
            <Text
              style={{
                fontSize: isDesktop ? 30 : 22,
                fontWeight: "800",
                lineHeight: isDesktop ? 38 : 30,
                marginTop: 12,
                color: "#ffffff",
                fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
              }}
            >
              Supply Multi-Person Crews & Custom Projects
            </Text>
            <Text className="mt-2 text-sm sm:text-base text-slate-300 leading-relaxed">
              Are you a contractor or team lead with 3+ technicians? Dispatch full crews for commercial renovations, corporate maintenance contracts, and large-scale installations.
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/apply")}
            className={`rounded-full bg-white px-6 py-3.5 shadow-lg active:bg-slate-100 shrink-0 ${
              isDesktop ? "self-center" : "self-start mt-2"
            }`}
          >
            <Text className="text-sm font-extrabold text-[#00112e]">
              Register Contractor Crew →
            </Text>
          </Pressable>
        </View>
      </View>

      <MarketingFooter />
    </ScrollView>
  );
}

