import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, HelpCircle, BadgePercent } from "lucide-react";
import { Faq, faqJsonLd } from "@/components/faq";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Partner Payout Rates & Commission",
  description:
    "Transparent partner payout rates, weekly settlement schedule, 0% joining fees, and fair platform commission structure on V Solve Hub.",
  alternates: { canonical: "/pricing" },
};

const PAYOUT_TIERS = [
  {
    trade: "Electrician",
    avgJob: "₹350 – ₹1,800",
    monthlyEstimate: "₹45,000 – ₹65,000",
    payoutSpeed: "Every Monday",
    commission: "Transparent 10–15%",
    perks: ["100% Tips Kept", "Surge Pricing Bonuses", "Free Job Safety Insurance"],
  },
  {
    trade: "Plumber",
    avgJob: "₹400 – ₹2,200",
    monthlyEstimate: "₹40,000 – ₹60,000",
    payoutSpeed: "Every Monday",
    commission: "Transparent 10–15%",
    perks: ["Instant Spare Parts Reimbursement", "High-Volume Area Routing", "Free In-App Support"],
  },
  {
    trade: "AC Technician",
    avgJob: "₹600 – ₹4,500",
    monthlyEstimate: "₹55,000 – ₹85,000",
    payoutSpeed: "Every Monday",
    commission: "Transparent 10–15%",
    perks: ["Summer Surge Multipliers", "Commercial Contract Dispatch", "Gas Refill Margin Protection"],
  },
  {
    trade: "Carpenter",
    avgJob: "₹450 – ₹3,200",
    monthlyEstimate: "₹42,000 – ₹58,000",
    payoutSpeed: "Every Monday",
    commission: "Transparent 10–15%",
    perks: ["Custom Quote Authorization", "Material Allowance Booking", "Direct Bank Settlements"],
  },
  {
    trade: "Home Cleaning",
    avgJob: "₹800 – ₹3,800",
    monthlyEstimate: "₹35,000 – ₹52,000",
    payoutSpeed: "Every Monday",
    commission: "Transparent 10–15%",
    perks: ["Chemical & Consumable Support", "Multi-Room Booking Bonuses", "Same-Day Settlements"],
  },
  {
    trade: "Beauty & Wellness",
    avgJob: "₹700 – ₹4,000",
    monthlyEstimate: "₹48,000 – ₹75,000",
    payoutSpeed: "Every Monday",
    commission: "Transparent 10–15%",
    perks: ["Premium Package Booking Tips", "Female Safety Protection Protocol", "Repeat Customer Preference"],
  },
];

const PRICING_FAQS = [
  {
    q: "Are there any hidden deductions or signup fees?",
    a: "None whatsoever. There are zero joining fees, zero monthly subscription costs, and zero security deposits. You only pay a transparent, competitive platform commission on successfully completed jobs.",
  },
  {
    q: "How does the weekly payout cycle work?",
    a: "All jobs completed between Monday 00:00 to Sunday 23:59 are calculated automatically. The full net amount is transferred directly to your bank account or UPI by Monday evening.",
  },
  {
    q: "Who pays for spare parts and materials?",
    a: "Customers pay directly for spare parts and materials approved during job inspection. You never have to spend your own money or bear the material cost.",
  },
];

export default function PricingPage() {
  return (
    <main className="bg-canvas text-text pt-24 sm:pt-28 pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(PRICING_FAQS)) }}
      />

      {/* Hero */}
      <section className="px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-extrabold text-emerald-800 border border-emerald-200 shadow-xs">
          <BadgePercent className="h-3.5 w-3.5 text-emerald-600" /> Transparent Partner Rates
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-navy-900 leading-tight">
          Keep More of What You Earn
        </h1>
        <p className="mt-4 text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
          Zero joining fees, zero hidden deductions, and automated weekly bank payouts every single Monday.
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
        </div>
      </section>

      {/* Payout Cards Grid */}
      <section className="mt-16 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {PAYOUT_TIERS.map((tier) => (
            <div
              key={tier.trade}
              className="rounded-3xl border border-line bg-white p-7 shadow-xs hover:shadow-xl hover:border-signal-400 transition-all duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-navy-900">{tier.trade}</h2>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-800 border border-emerald-200">
                    {tier.payoutSpeed}
                  </span>
                </div>

                <div className="mt-6 border-b border-line pb-5">
                  <span className="text-xs font-bold text-text-muted uppercase tracking-wider block">
                    Avg. Monthly Earnings
                  </span>
                  <span className="text-2xl font-black text-signal-700 mt-1 block">
                    {tier.monthlyEstimate}
                  </span>
                  <span className="text-xs text-text-secondary mt-1 block font-medium">
                    Average Job Fare: {tier.avgJob}
                  </span>
                </div>

                <ul className="mt-6 space-y-2.5">
                  {tier.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-navy-900">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{perk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 pt-4 border-t border-line">
                <Link href="/apply">
                  <button
                    type="button"
                    className="w-full rounded-full bg-surface-sunken hover:bg-navy-900 hover:text-white border border-line-strong py-2.5 text-xs font-bold text-navy-900 transition-all shadow-xs"
                  >
                    Apply for {tier.trade} →
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mt-24 max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3.5 py-1 text-xs font-extrabold text-navy-900 border border-navy-200">
            <HelpCircle className="h-3.5 w-3.5" /> Payout FAQ
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-navy-900">
            Frequently Asked Payout Questions
          </h2>
        </div>

        <div className="mt-10">
          <Faq items={PRICING_FAQS} />
        </div>
      </section>
    </main>
  );
}
