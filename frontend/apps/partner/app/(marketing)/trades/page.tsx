import type { Metadata } from "next";
import Link from "next/link";
import { Zap, Wrench, Hammer, Wind, Droplets, Sparkles, ShieldAlert, Scissors, Flame, ArrowRight, CheckCircle2, Users } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Supported Trades & Services",
  description:
    "Explore high-demand trades on V Solve Hub including Electrician, Plumber, Carpenter, AC Technician, Cleaning, and Salon services.",
  alternates: { canonical: "/trades" },
};

const TRADES = [
  {
    slug: "electrician",
    name: "Electrician",
    icon: Zap,
    color: "from-amber-500 to-orange-500",
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
    color: "from-blue-500 to-cyan-500",
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
    color: "from-amber-600 to-yellow-600",
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
    color: "from-sky-500 to-indigo-500",
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
    color: "from-teal-500 to-emerald-500",
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
    color: "from-emerald-500 to-green-600",
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
    color: "from-rose-500 to-red-500",
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
    color: "from-pink-500 to-purple-500",
    iconBg: "bg-pink-50 text-pink-600 border-pink-200",
    earnings: "₹48,000 – ₹75,000 / mo",
    demand: "320+ Daily Jobs",
    hot: true,
    desc: "At-home salon, hair styling, gold & diamond facials, waxing, pedicure & manicure, head massage, and bridal makeup appointments.",
    skills: ["Hair Styling", "Facials & Cleanup", "Waxing", "Bridal Makeup", "Nail Art", "Spa Treatments"],
  },
];

export default function TradesPage() {
  return (
    <main className="bg-canvas text-text pt-24 sm:pt-28 pb-20">
      {/* Hero */}
      <section className="px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-3.5 py-1 text-xs font-extrabold text-signal-700 border border-signal-200 shadow-xs">
          <Sparkles className="h-3.5 w-3.5" /> High Demand Trades
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-navy-900 leading-tight">
          Supported Trades & Service Specialties
        </h1>
        <p className="mt-4 text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
          Explore high-earning crafts across Telangana with guaranteed booking volume and transparent weekly settlements.
        </p>

        <div className="mt-8">
          <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-8 py-3.5 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]">
              <span>Apply for Any Trade</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
        </div>
      </section>

      {/* Grid of Trades */}
      <section className="mt-16 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {TRADES.map((trade) => {
            const Icon = trade.icon;
            return (
              <div
                key={trade.slug}
                className="group rounded-3xl border border-line bg-white p-7 shadow-xs hover:shadow-xl hover:border-signal-400 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div
                      className={`grid h-14 w-14 place-items-center rounded-2xl border ${trade.iconBg} shadow-xs group-hover:scale-105 transition-transform duration-300`}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-extrabold border ${
                        trade.hot
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200"
                      }`}
                    >
                      {trade.hot && <Flame className="h-3.5 w-3.5 text-rose-500 fill-rose-500" />}
                      <span>{trade.demand}</span>
                    </span>
                  </div>

                  <div className="mt-6 flex items-baseline justify-between gap-4">
                    <h2 className="text-xl font-bold text-navy-900">{trade.name}</h2>
                    <span className="text-sm font-extrabold text-signal-700 shrink-0">{trade.earnings}</span>
                  </div>

                  <p className="mt-2.5 text-sm text-text-secondary leading-relaxed">{trade.desc}</p>

                  {/* Skills tags */}
                  <div className="mt-5 flex flex-wrap gap-1.5">
                    {trade.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-lg bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-secondary border border-line/60"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom 1-Click Apply */}
                <div className="mt-7 pt-4 border-t border-line flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>Instant Booking Dispatch</span>
                  </span>

                  <Link href="/apply" className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 hover:bg-navy-950 text-white px-4 py-2 text-xs font-bold transition-all">
                      <span>Apply Now</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Contractor & Multi-Crew Section */}
      <section className="mt-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl bg-[#00112e] p-8 sm:p-12 text-white shadow-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider text-amber-300 border border-white/20">
              <Users className="h-3.5 w-3.5" /> Contractors & Fleet Suppliers
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold mt-3">
              Supply Multi-Person Crews & Custom Projects
            </h2>
            <p className="mt-2 text-sm sm:text-base text-navy-200 leading-relaxed">
              Are you a contractor or team lead with 3+ technicians? Dispatch full crews for commercial renovations, corporate maintenance contracts, and large-scale installations.
            </p>
          </div>

          <Link href="/apply/capabilities" className="inline-block shrink-0 rounded-full bg-white px-6 py-3.5 text-sm font-extrabold text-[#00112e] hover:bg-navy-50 transition-colors shadow-lg text-center">
              <span>Register Contractor Crew →</span>
            </Link>
        </div>
      </section>
    </main>
  );
}
