import type { Metadata } from "next";
import Link from "next/link";
import {
  Smartphone,
  ShieldCheck,
  CalendarClock,
  Banknote,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  FileText,
  HelpCircle,
} from "lucide-react";
import { Faq, faqJsonLd } from "@/components/faq";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "How It Works: Partner Journey & Onboarding",
  description:
    "Learn how skilled technicians register, verify documents, set working hours, and receive weekly payouts on V Solve Hub.",
  alternates: { canonical: "/how-it-works" },
};

const DETAILED_STEPS = [
  {
    step: "01",
    title: "Quick Registration & Profile Creation",
    duration: "Takes ~5 Mins",
    badgeBg: "bg-signal-50 text-signal-700 border-signal-200",
    color: "from-signal-500 to-amber-500",
    icon: Smartphone,
    desc: "Enter your 10-digit mobile number, verify with an instant OTP, and tell us your name, primary craft, and years of field experience.",
    highlights: [
      "No registration or onboarding fees",
      "Choose from 10+ core trade specialties",
      "Set your primary base location and service radius",
    ],
  },
  {
    step: "02",
    title: "Document Verification & KYC Approval",
    duration: "Within 24 Hours",
    badgeBg: "bg-amber-50 text-amber-800 border-amber-200",
    color: "from-amber-500 to-yellow-500",
    icon: ShieldCheck,
    desc: "Upload a government-issued photo ID (Aadhaar Card, Voter ID, Driving Licence, or Passport) and bank details for automated weekly settlements.",
    highlights: [
      "Fast 24-hour verification desk",
      "Bank-grade encrypted document storage",
      "Instant SMS confirmation upon approval",
    ],
  },
  {
    step: "03",
    title: "Set Working Hours & Service Zones",
    duration: "Flexible Any Time",
    badgeBg: "bg-sky-50 text-sky-800 border-sky-200",
    color: "from-sky-500 to-blue-600",
    icon: CalendarClock,
    desc: "Choose exactly which days and shift hours you want to work. Select your preferred local neighborhoods across Telangana and toggle duty online.",
    highlights: [
      "Zero mandatory minimum working hours",
      "Accept jobs near your home or neighborhood",
      "Turn duty ON / OFF whenever you need a break",
    ],
  },
  {
    step: "04",
    title: "Accept Jobs & Receive Guaranteed Weekly Payouts",
    duration: "Every Monday",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200",
    color: "from-emerald-500 to-teal-600",
    icon: Banknote,
    desc: "Receive real-time job offers with upfront pricing, turn-by-turn navigation, and customer details. Get full earnings directly into your bank or UPI.",
    highlights: [
      "Upfront pricing with 0% hidden deductions",
      "Automated Monday settlements directly to bank",
      "100% tips and customer bonuses go directly to you",
    ],
  },
];

const REQUIREMENTS = [
  {
    title: "Government Photo ID",
    desc: "Aadhaar card, Voter ID, Passport, or PAN card for identity verification.",
    icon: FileText,
  },
  {
    title: "Active Bank Account or UPI",
    desc: "Savings account or UPI ID in your name for automated weekly direct deposits.",
    icon: Banknote,
  },
  {
    title: "Smartphone with Internet",
    desc: "Android or iOS smartphone to receive job requests, customer addresses, and navigation.",
    icon: Smartphone,
  },
  {
    title: "Professional Trade Experience",
    desc: "Basic hands-on skill and appropriate tools for your selected craft specialty.",
    icon: CheckCircle2,
  },
];

const FAQS = [
  {
    q: "How long does it take for my partner application to be approved?",
    a: "Most partner applications are reviewed and approved within 24 hours of document submission. You will receive an SMS and WhatsApp notification once your account is live.",
  },
  {
    q: "Is there any upfront security deposit or joining fee?",
    a: "No. Joining V Solve Hub is 100% free with zero registration fees and zero deposit. You keep the lion's share of every job you complete.",
  },
  {
    q: "Can I do jobs part-time or on weekends only?",
    a: "Yes! You have complete freedom to choose your shift hours. Work full-time, part-time, or only on weekends depending on your availability.",
  },
  {
    q: "When and how are payouts transferred?",
    a: "Payouts are transferred directly into your bank account or UPI ID every Monday. You can track your daily earnings and completed jobs in real-time.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="bg-canvas text-text pt-24 sm:pt-28 pb-20">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQS)) }}
      />

      {/* Hero Section */}
      <section className="px-4 sm:px-6 max-w-5xl mx-auto text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-3.5 py-1 text-xs font-extrabold text-signal-700 border border-signal-200 shadow-xs">
          <Sparkles className="h-3.5 w-3.5" /> Simple 4-Step Journey
        </span>
        <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-tight text-navy-900 leading-tight">
          How Becoming a Partner Works
        </h1>
        <p className="mt-4 text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
          From registration to your first direct bank payout in four straightforward steps. Zero joining fee and zero complicated paperwork.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-8 py-3.5 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]">
              <span>Start Partner Application</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full bg-surface border border-line-strong px-6 py-3.5 text-sm font-bold text-navy-900 hover:bg-surface-sunken transition-colors shadow-xs">
              <span>View Payout Rates</span>
            </Link>
        </div>
      </section>

      {/* 4 Detailed Step Cards */}
      <section className="mt-20 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="space-y-8">
          {DETAILED_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.step}
                className="group relative rounded-3xl border border-line bg-white p-7 sm:p-9 shadow-xs hover:shadow-xl hover:border-signal-400 transition-all duration-300"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="flex items-start gap-4 sm:gap-5">
                    <div
                      className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${step.color} text-white shadow-md`}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs font-black uppercase tracking-widest text-text-muted">
                          Step {step.step}
                        </span>
                        <span className={`rounded-full px-3 py-0.5 text-[11px] font-extrabold border ${step.badgeBg}`}>
                          {step.duration}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl sm:text-2xl font-bold text-navy-900">{step.title}</h2>
                      <p className="mt-2.5 text-sm sm:text-base text-text-secondary leading-relaxed max-w-2xl">
                        {step.desc}
                      </p>

                      {/* Highlights checklist */}
                      <ul className="mt-5 space-y-2">
                        {step.highlights.map((h) => (
                          <li key={h} className="flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-navy-900">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* What You Need to Get Started */}
      <section className="mt-20 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-100 px-3.5 py-1 text-xs font-extrabold text-navy-900 border border-navy-200">
            Requirements
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-navy-900">
            What You Need to Join
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            Keep these simple requirements handy to complete your registration in minutes.
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {REQUIREMENTS.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="rounded-2xl bg-white border border-line p-5 shadow-xs">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-navy-50 text-navy-900 border border-navy-200">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-navy-900">{r.title}</h3>
                <p className="mt-1.5 text-xs text-text-secondary leading-relaxed">{r.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mt-24 max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3.5 py-1 text-xs font-extrabold text-navy-900 border border-navy-200">
            <HelpCircle className="h-3.5 w-3.5" /> Frequently Asked Questions
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold text-navy-900">
            Questions About the Process?
          </h2>
        </div>

        <div className="mt-10">
          <Faq items={FAQS} />
        </div>
      </section>

      {/* Bottom Final CTA */}
      <section className="mt-20 max-w-5xl mx-auto px-4 sm:px-6">
        <div className="rounded-3xl bg-[#00112e] p-8 sm:p-12 text-white text-center shadow-2xl border border-white/10 relative overflow-hidden">
          <h2 className="text-2xl sm:text-3xl font-black">Ready to Take Control of Your Earnings?</h2>
          <p className="mt-2 text-sm sm:text-base text-navy-200 max-w-xl mx-auto leading-relaxed">
            Join 5,000+ certified technicians and professionals earning reliable income on V Solve Hub.
          </p>
          <div className="mt-8">
            <Link href="/apply" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-signal-500 via-amber-500 to-signal-400 px-8 py-3.5 text-sm font-extrabold text-[#00112e] shadow-lg shadow-signal-500/25 hover:from-signal-400 hover:to-amber-300 transition-all hover:scale-[1.02] active:scale-[0.98]">
                <span>Apply as a Partner Now</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
