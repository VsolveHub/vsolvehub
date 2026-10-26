import Link from "next/link";
import { Wallet, Clock, LineChart, Headset, ArrowRight, ShieldCheck, CheckCircle2, Sparkles, Award, Zap, Smartphone, CalendarClock, Banknote, Wrench, Hammer, Wind, Droplets, ShieldAlert, Scissors, Flame } from "lucide-react";

import { type Tone } from "@/components/graphics";
import { Faq, faqJsonLd } from "@/components/faq";
import { PartnerHero } from "@/components/hero/partner-hero";

export const dynamic = "force-static";

const HIGH_DEMAND_TRADES = [
  {
    slug: "electrician",
    name: "Electrician",
    icon: Zap,
    color: "from-amber-500 to-orange-500",
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
    color: "from-blue-500 to-cyan-500",
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
    color: "from-amber-600 to-yellow-600",
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
    color: "from-sky-500 to-indigo-500",
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
    color: "from-teal-500 to-emerald-500",
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
    color: "from-emerald-500 to-green-600",
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
    color: "from-rose-500 to-red-500",
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
    color: "from-pink-500 to-purple-500",
    iconBg: "bg-pink-50 text-pink-600 border-pink-200",
    earnings: "₹48,000 – ₹75,000 / mo",
    demand: "320+ Daily Jobs",
    hot: true,
    skills: ["Hair Styling", "Facials", "Waxing", "Bridal Spa"],
  },
];

const STATS = [
  { value: "Weekly", label: "Direct Bank Payouts", icon: Wallet, tone: "brand" as Tone },
  { value: "Your Hours", label: "Choose Shifts & Area", icon: Clock, tone: "green" as Tone },
  { value: "Upfront Rates", label: "Job Price Before Accepting", icon: LineChart, tone: "sky" as Tone },
  { value: "Hyderabad", label: "Now Onboarding Partners", icon: ShieldCheck, tone: "amber" as Tone },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    icon: Smartphone,
    color: "from-signal-500 to-amber-500",
    badge: "2 Mins",
    badgeBg: "bg-signal-50 text-signal-700 border-signal-200",
    title: "Quick Registration",
    desc: "Enter your 10-digit mobile number, choose your primary trade skills, and upload an ID proof.",
    highlight: "100% Free Signup",
  },
  {
    step: "02",
    icon: ShieldCheck,
    color: "from-amber-500 to-yellow-500",
    badge: "24h Review",
    badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
    title: "Fast Verification",
    desc: "Our operations desk approves your profile and documents within 24 hours. Zero registration fee.",
    highlight: "Zero Upfront Cost",
  },
  {
    step: "03",
    icon: CalendarClock,
    color: "from-sky-500 to-blue-600",
    badge: "Flexible Hours",
    badgeBg: "bg-sky-50 text-sky-800 border-sky-200",
    title: "Set Shifts & Get Jobs",
    desc: "Set your daily working hours, select your local service zones, and receive instant customer bookings.",
    highlight: "Instant Local Offers",
  },
  {
    step: "04",
    icon: Banknote,
    color: "from-emerald-500 to-teal-600",
    badge: "Weekly Payout",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
    title: "Guaranteed Payouts",
    desc: "Complete jobs, deliver 5-star service, and receive automated settlements directly into your bank account.",
    highlight: "Direct to Bank / UPI",
  },
];

const HOME_FAQS = [
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
    a: "Earnings depend on your trade, the hours you choose to work, and the service areas you cover. You see the earnings for each job upfront before choosing to accept it.",
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

const FEATURES = [
  {
    icon: Wallet,
    tag: "Financial Security",
    title: "Guaranteed Weekly Payouts",
    body: "Receive your full earnings directly into your bank account or UPI every Monday without delays, hidden deductions, or lock-ins.",
    stats: "100% On-Time Settlements",
    color: "from-emerald-500/10 to-teal-500/10",
    iconColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
  {
    icon: Clock,
    tag: "Work Freedom",
    title: "Complete Schedule Flexibility",
    body: "Work on your own terms. Set daily shift hours, define custom service zones, and toggle duty online/offline at your choice.",
    stats: "Zero Minimum Hours",
    color: "from-amber-500/10 to-orange-500/10",
    iconColor: "text-amber-600 bg-amber-50 border-amber-200",
  },
  {
    icon: LineChart,
    tag: "Clear Numbers",
    title: "Transparent Upfront Pricing",
    body: "See exactly how much you earn before accepting any customer job. Real-time in-app breakdown of fares, surge bonuses, and tips.",
    stats: "0% Hidden Deductions",
    color: "from-blue-500/10 to-indigo-500/10",
    iconColor: "text-blue-600 bg-blue-50 border-blue-200",
  },
  {
    icon: Headset,
    tag: "Safety & Care",
    title: "Dedicated 24/7 Support Desk",
    body: "Access direct partner assistance and safety emergency response for navigation, customer coordination, and dispute resolution.",
    stats: "Average < 30s Response",
    color: "from-purple-500/10 to-violet-500/10",
    iconColor: "text-purple-600 bg-purple-50 border-purple-200",
  },
];


export default function LandingPage() {
  return (
    <main className="bg-canvas">
      {/* Hero Section */}
      <PartnerHero />

      {/* Trust & Key Stats Strip */}
      <section className="border-y border-line bg-surface py-8 sm:py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3.5 rounded-card p-3 transition-colors hover:bg-surface-sunken"
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-sunken">
                  <s.icon className="h-6 w-6 text-signal-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-extrabold text-text tracking-tight sm:text-2xl truncate">
                    {s.value}
                  </p>
                  <p className="text-xs font-semibold text-text-secondary truncate">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative px-4 py-24 sm:px-6 bg-surface overflow-hidden">
        {/* Subtle background ambient glow */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[900px] bg-gradient-to-tr from-signal-500/5 via-amber-500/5 to-emerald-500/5 blur-3xl -z-0" />

        <div className="relative z-10 mx-auto max-w-6xl">
          {/* Header */}
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-3.5 py-1 text-xs font-extrabold text-signal-700 border border-signal-200 shadow-xs">
              <Sparkles className="h-3.5 w-3.5" /> Simple 4-Step Journey
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
              How Becoming a Partner Works
            </h2>
            <p className="mt-3 text-sm sm:text-base text-text-secondary leading-relaxed">
              From registration to your first payout in four quick steps. Zero joining fees and no complicated paperwork.
            </p>
          </div>

          {/* Connected Stepper Grid */}
          <div className="relative mt-16">
            {/* Desktop connecting progress bar behind cards */}
            <div className="hidden lg:block absolute top-14 left-16 right-16 h-1 bg-gradient-to-r from-signal-500/40 via-amber-400/40 to-emerald-500/40 -z-0 rounded-full" />

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
              {HOW_IT_WORKS_STEPS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.step}
                    className="group relative flex flex-col justify-between rounded-2xl border border-line bg-surface p-6 shadow-xs hover:border-signal-400 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                  >
                    <div>
                      {/* Top Step Number & Icon Header */}
                      <div className="flex items-center justify-between">
                        <div
                          className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${item.color} text-white shadow-md shadow-black/10 group-hover:scale-110 transition-transform duration-300`}
                        >
                          <Icon className="h-6 w-6" />
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-extrabold border ${item.badgeBg}`}
                        >
                          {item.badge}
                        </span>
                      </div>

                      {/* Step Number + Title */}
                      <div className="mt-6">
                        <span className="text-xs font-black uppercase tracking-widest text-text-muted block">
                          Step {item.step}
                        </span>
                        <h3 className="mt-1 text-lg font-bold text-navy-900">{item.title}</h3>
                        <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-text-secondary">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Highlight Tag */}
                    <div className="mt-6 pt-4 border-t border-line flex items-center gap-2 text-xs font-bold text-navy-900">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{item.highlight}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Action CTA */}
          <div className="mt-14 text-center">
            <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-8 py-3.5 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <span>Start Your Partner Application</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
          </div>
        </div>
      </section>

      {/* Why Partner With Us / Platform Advantages */}
      <section id="benefits" className="relative border-t border-line bg-surface-sunken/50 px-4 py-24 sm:px-6 overflow-hidden">
        {/* Subtle ambient lighting */}
        <div className="pointer-events-none absolute right-0 top-0 h-[400px] w-[400px] bg-signal-500/5 blur-3xl -z-0" />
        <div className="pointer-events-none absolute left-0 bottom-0 h-[400px] w-[400px] bg-navy-500/5 blur-3xl -z-0" />

        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100 px-3.5 py-1 text-xs font-extrabold text-navy-900 border border-navy-200 shadow-xs">
              <Award className="h-3.5 w-3.5 text-navy-700" /> Platform Advantages
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
              Built for Your Independence & Growth
            </h2>
            <p className="mt-3 text-sm sm:text-base text-text-secondary leading-relaxed">
              Everything you need to run and scale your service trade with dignity, security, and top earnings.
            </p>
          </div>

          {/* 4-Card Modern Bento Grid */}
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group relative flex flex-col justify-between rounded-3xl border border-line bg-white p-7 shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:border-signal-400 hover:shadow-xl overflow-hidden"
                >
                  {/* Subtle top corner gradient tint on hover */}
                  <div
                    className={`pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${f.color} blur-2xl group-hover:opacity-100 opacity-60 transition-opacity`}
                  />

                  <div>
                    {/* Top Icon & Tag */}
                    <div className="flex items-center justify-between">
                      <div
                        className={`grid h-12 w-12 place-items-center rounded-2xl border ${f.iconColor} shadow-xs group-hover:scale-105 transition-transform duration-300`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="rounded-full bg-surface-sunken px-3 py-1 text-[11px] font-bold text-text-secondary border border-line">
                        {f.tag}
                      </span>
                    </div>

                    {/* Title & Body */}
                    <h3 className="mt-6 text-lg font-bold text-navy-900">{f.title}</h3>
                    <p className="mt-2.5 text-xs sm:text-sm leading-relaxed text-text-secondary">
                      {f.body}
                    </p>
                  </div>

                  {/* Bottom Metric Strip */}
                  <div className="mt-7 pt-4 border-t border-line/70 flex items-center justify-between text-xs font-extrabold text-navy-900">
                    <span className="flex items-center gap-1.5 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{f.stats}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services / High Demand Trades Showcase */}
      <section id="services" className="border-t border-line px-4 py-24 sm:px-6 bg-surface">
        <div className="mx-auto max-w-6xl">
          <div className="text-center max-w-2xl mx-auto">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-3.5 py-1 text-xs font-extrabold text-signal-700 border border-signal-200 shadow-xs">
              <Sparkles className="h-3.5 w-3.5" /> High Demand Trades
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
              Choose Your Trade to Start Earning
            </h2>
            <p className="mt-3 text-sm sm:text-base text-text-secondary leading-relaxed">
              Active customer demand across Telangana guarantees regular jobs and reliable weekly earnings.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HIGH_DEMAND_TRADES.map((trade) => {
              const Icon = trade.icon;
              return (
                <Link
                  key={trade.slug}
                  href="/apply"
                  className="group relative flex flex-col justify-between rounded-3xl border border-line bg-surface p-6 shadow-xs transition-all duration-300 hover:-translate-y-1.5 hover:border-signal-400 hover:shadow-xl hover:bg-white"
                >
                  <div>
                    {/* Top Row: Icon + Demand Pill */}
                    <div className="flex items-center justify-between">
                      <div
                        className={`grid h-12 w-12 place-items-center rounded-2xl border ${trade.iconBg} shadow-xs group-hover:scale-105 transition-transform duration-300`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>

                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold border ${
                          trade.hot
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {trade.hot && <Flame className="h-3 w-3 text-rose-500 fill-rose-500" />}
                        <span>{trade.demand}</span>
                      </span>
                    </div>

                    {/* Trade Name + Avg Earnings */}
                    <div className="mt-5">
                      <h3 className="text-lg font-bold text-navy-900">{trade.name}</h3>
                      <p className="text-xs font-bold text-signal-700 mt-1">{trade.earnings}</p>
                    </div>

                    {/* Skill Tags */}
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {trade.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-lg bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-text-secondary border border-line/60"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Bottom 1-Click Action */}
                  <div className="mt-6 pt-3.5 border-t border-line flex items-center justify-between text-xs font-bold text-navy-900 group-hover:text-signal-700 transition-colors">
                    <span>Apply for {trade.name}</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Specialist Contractor Banner */}
          <div className="mt-12 rounded-2xl bg-[#00112e] p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl border border-white/10">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 border border-white/20">
                Contractors & Fleet Owners
              </span>
              <h3 className="text-xl font-bold text-white mt-2">
                Supply Multi-Person Crews & Quote Custom Projects
              </h3>
              <p className="mt-1 text-xs sm:text-sm text-navy-200 leading-relaxed">
                Register complete work teams for daily workforce dispatch, commercial renovations, and high-volume corporate contracts.
              </p>
            </div>
            <Link href="/apply/capabilities" className="inline-block shrink-0 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-[#00112e] hover:bg-navy-50 transition-colors shadow-md text-center">
                Apply for Specialist Work →
              </Link>
          </div>
        </div>
      </section>


      {/* FAQ Section */}
      <section id="faq" className="border-t border-line bg-surface px-4 py-24 sm:px-6">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(HOME_FAQS)) }}
        />
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3.5 py-1 text-xs font-extrabold text-navy-900 border border-navy-200">
              Got Questions?
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
              Frequently Asked Questions
            </h2>
            <p className="mt-3 text-base text-text-secondary">
              Everything you need to know about registering, verification, and getting paid.
            </p>
          </div>

          <div className="mt-12">
            <Faq items={HOME_FAQS} />
          </div>

          <div className="mt-10 rounded-2xl border border-line bg-surface-sunken p-5 text-center">
            <p className="text-sm font-bold text-navy-900">Have a specific question not covered here?</p>
            <p className="mt-1 text-xs text-text-secondary">
              Our partner helpdesk is available 9am–9pm every day (+91 733 076 4634) to guide you through registration and verification.
            </p>
            <Link
              href="/contact"
              className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-signal-700 hover:text-signal-800 hover:underline"
            >
              Contact Partner Support →
            </Link>
          </div>
        </div>
      </section>

      {/* Final High-Impact CTA Band */}
      <section className="px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-[#00112e] via-[#001f54] to-[#00112e] px-8 py-16 text-center text-white shadow-2xl border border-white/10">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-500/20 text-amber-300 px-3.5 py-1 text-xs font-extrabold border border-signal-500/30">
            <Sparkles className="h-3.5 w-3.5" /> Start Earning This Week
          </span>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
            Ready to Build a High-Earning Service Business?
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm sm:text-base leading-relaxed text-navy-200">
            Start earning as a verified partner in Hyderabad. Zero upfront cost, weekly bank payouts, and upfront job pricing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-7 py-3.5 text-sm font-extrabold text-[#00112e] shadow-xl shadow-signal-500/30 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <span>Register as a Partner Now</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            <Link href="/contact" className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-7 py-3.5 text-sm font-bold text-white hover:bg-white/20 transition-all">
                <span>Contact Support</span>
              </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

