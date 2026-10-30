import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ShieldCheck, Award, ArrowRight, Sparkles, HeartHandshake, TrendingUp, MapPin } from "lucide-react";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "About Us: Our Mission for Trade Professionals",
  description:
    "V Solve Hub is empowering local technicians, electricians, plumbers, and home service professionals across Telangana with dignity, modern technology, and sustainable income.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  {
    icon: Award,
    title: "Dignity of Labor & Respect",
    desc: "We treat skilled trade professionals as true partners and business owners, ensuring respectful customer interactions and zero wage exploitation.",
  },
  {
    icon: ShieldCheck,
    title: "Complete Transparency",
    desc: "No hidden deductions, no surprise fees, and no delayed settlements. What you see is exactly what you get, deposited straight into your bank account every Monday.",
  },
  {
    icon: TrendingUp,
    title: "Sustainable Income Growth",
    desc: "We connect technicians with consistent local demand and high-value corporate contracts so their earnings grow reliably year-round.",
  },
  {
    icon: HeartHandshake,
    title: "Safety & Community Support",
    desc: "From safety guidance to a dedicated partner helpline, our platform stands firmly behind every professional on duty.",
  },
];

const MILESTONES = [
  { value: "Verified", label: "ID & Document Checks" },
  { value: "Upfront", label: "Job Pricing Before Acceptance" },
  { value: "Weekly", label: "Direct Bank Settlements" },
  { value: "Hyderabad", label: "Now Onboarding Partners" },
];

export default function AboutPage() {
  return (
    <main className="bg-canvas text-text pt-24 sm:pt-28 pb-20">
      {/* Hero */}
      <section className="px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100 px-3.5 py-1 text-xs font-extrabold text-navy-900 border border-navy-200 shadow-xs">
          <Building2 className="h-3.5 w-3.5 text-navy-700" /> Our Mission
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-navy-900 leading-tight">
          Empowering Local Trade Professionals with Dignity & Modern Technology
        </h1>
        <p className="mt-4 text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
          V Solve Hub is India&rsquo;s partner-first digital enablement platform, connecting certified electricians, plumbers, carpenters, and technicians with regular customer demand.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-8 py-3.5 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]">
              <span>Join as a Partner</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          <Link href="/contact" className="inline-flex items-center gap-2 rounded-full bg-surface border border-line-strong px-6 py-3.5 text-sm font-bold text-navy-900 hover:bg-surface-sunken transition-colors shadow-xs">
              <span>Contact Our Team</span>
            </Link>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="mt-20 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-4 gap-6 rounded-3xl bg-[#00112e] p-6 sm:p-8 text-white shadow-xl border border-white/10">
          {MILESTONES.map((m) => (
            <div key={m.label} className="text-center">
              <span className="text-3xl sm:text-4xl font-black text-amber-400 block">{m.value}</span>
              <span className="text-xs sm:text-sm text-navy-200 mt-1 block font-medium">{m.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Core Values Bento */}
      <section className="mt-24 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-3.5 py-1 text-xs font-extrabold text-signal-700 border border-signal-200">
            <Sparkles className="h-3.5 w-3.5" /> What We Stand For
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-navy-900">
            Our Core Principles
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {VALUES.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title}
                className="rounded-3xl border border-line bg-white p-8 shadow-xs hover:shadow-xl hover:border-signal-400 transition-all duration-300"
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-sunken border border-line text-navy-900">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-bold text-navy-900">{v.title}</h3>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{v.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Operational Hubs in Telangana */}
      <section className="mt-24 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl bg-surface-sunken/70 border border-line p-8 sm:p-12 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100 px-3.5 py-1 text-xs font-extrabold text-navy-900 border border-navy-200">
            <MapPin className="h-3.5 w-3.5" /> Operational Footprint
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-navy-900">
            Serving Telangana&rsquo;s Fast-Growing Cities
          </h2>
          <p className="mt-2 text-sm text-text-secondary max-w-xl mx-auto">
            Headquartered in Hyderabad with active field partner hubs across Hyderabad, Warangal, Nizamabad, Karimnagar, and Khammam.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {["Hyderabad (HQ)", "Warangal", "Nizamabad", "Karimnagar", "Khammam"].map((city) => (
              <span
                key={city}
                className="rounded-full bg-white border border-line px-4 py-2 text-xs font-bold text-navy-900 shadow-xs"
              >
                {city}
              </span>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
