import type { Metadata } from "next";
import Link from "next/link";
import { Wallet, Clock, LineChart, ShieldCheck, TrendingUp, Award, ArrowRight, CheckCircle2 } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Partner Earnings & Platform Benefits",
  description:
    "Explore partner earnings, weekly settlements, schedule freedom, 0% hidden fees, and safety benefits on V Solve Hub.",
  alternates: { canonical: "/benefits" },
};

const BENEFITS_LIST = [
  {
    icon: Wallet,
    title: "100% Guaranteed Weekly Payouts",
    desc: "Every single rupee you earn is automatically calculated and transferred directly to your bank account or UPI every Monday. Zero payout delays, zero withholding.",
    badge: "Direct to Bank / UPI",
    color: "from-emerald-500 to-teal-600",
    points: [
      "Automated Monday settlements",
      "Real-time wallet balance and transaction ledger",
      "Zero withdrawal fees or hidden payment cuts",
    ],
  },
  {
    icon: Clock,
    title: "Complete Schedule & Location Freedom",
    desc: "You are your own boss. Pick your working hours, select your local service zones across Telangana, and toggle duty online/offline whenever you want.",
    badge: "Zero Minimum Hours",
    color: "from-amber-500 to-orange-500",
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
    color: "from-sky-500 to-blue-600",
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
    color: "from-purple-500 to-indigo-600",
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

export default function BenefitsPage() {
  return (
    <main className="bg-canvas text-text pt-24 sm:pt-28 pb-20">
      {/* Hero */}
      <section className="px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-extrabold text-emerald-800 border border-emerald-200 shadow-xs">
          <Award className="h-3.5 w-3.5 text-emerald-600" /> Platform Advantages
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-navy-900 leading-tight">
          Built for Your Independence & Maximum Earnings
        </h1>
        <p className="mt-4 text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
          Discover why 5,000+ skilled trade professionals choose V Solve Hub for steady local jobs, direct payouts, and complete work freedom.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/apply">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-8 py-3.5 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Join as a Partner</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
          <Link href="/how-it-works">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full bg-surface border border-line-strong px-6 py-3.5 text-sm font-bold text-navy-900 hover:bg-surface-sunken transition-colors shadow-xs"
            >
              <span>How Onboarding Works</span>
            </button>
          </Link>
        </div>
      </section>

      {/* 4 Pillars Bento Grid */}
      <section className="mt-20 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {BENEFITS_LIST.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.title}
                className="rounded-3xl border border-line bg-white p-8 shadow-xs hover:shadow-xl hover:border-signal-400 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div
                      className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${b.color} text-white shadow-md`}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-extrabold text-navy-900 border border-line">
                      {b.badge}
                    </span>
                  </div>

                  <h2 className="mt-6 text-xl font-bold text-navy-900">{b.title}</h2>
                  <p className="mt-2.5 text-sm text-text-secondary leading-relaxed">{b.desc}</p>

                  <ul className="mt-6 space-y-2.5 border-t border-line pt-5">
                    {b.points.map((pt) => (
                      <li key={pt} className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-navy-900">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Monthly Earnings Table */}
      <section className="mt-20 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-3.5 py-1 text-xs font-extrabold text-signal-700 border border-signal-200">
            <TrendingUp className="h-3.5 w-3.5" /> Real Market Earnings
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-navy-900">
            Average Monthly Payouts by Trade
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Based on active verified partner earnings across Hyderabad, Warangal, and Nizamabad.
          </p>
        </div>

        <div className="mt-8 -mx-4 sm:mx-0 overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap min-w-[500px]">
            <thead className="border-b border-line bg-surface-sunken/50 text-xs font-black uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 sm:px-6 py-3.5">Trade Specialty</th>
                <th className="px-4 sm:px-6 py-3.5">Full-Time (8h / day)</th>
                <th className="px-4 sm:px-6 py-3.5">Part-Time (4h / day)</th>
                <th className="px-4 sm:px-6 py-3.5">Top Performers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {EARNINGS_BREAKDOWN.map((row) => (
                <tr key={row.trade} className="hover:bg-surface-sunken/40 transition-colors">
                  <td className="px-4 sm:px-6 py-4 font-bold text-navy-900">{row.trade}</td>
                  <td className="px-4 sm:px-6 py-4 font-extrabold text-signal-700">{row.fullTime}</td>
                  <td className="px-4 sm:px-6 py-4 text-text-secondary font-medium">{row.partTime}</td>
                  <td className="px-4 sm:px-6 py-4 font-extrabold text-emerald-700">{row.topEarners}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="mt-24 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl bg-[#00112e] p-8 sm:p-12 text-white text-center shadow-2xl border border-white/10">
          <h2 className="text-2xl sm:text-3xl font-black">Start Earning What You Deserve</h2>
          <p className="mt-2 text-sm sm:text-base text-navy-200 max-w-xl mx-auto leading-relaxed">
            Apply today in under 5 minutes. No upfront costs, guaranteed weekly bank payouts.
          </p>
          <div className="mt-8">
            <Link href="/apply">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-8 py-3.5 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Become a Partner Now</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
