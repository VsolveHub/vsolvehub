import Link from "next/link";
import {
  Wallet,
  Clock,
  LineChart,
  Headset,
  IndianRupee,
  Star,
  Zap,
  ArrowRight,
  Quote,
} from "lucide-react";
import { PARTNER_CATEGORIES } from "@vsolve/config";
import { Button } from "@vsolve/ui";
import { Medallion, EarningsHeroArt, type Tone } from "@/components/graphics";
import { Faq, faqJsonLd } from "@/components/faq";
import { PartnerHero } from "@/components/hero/partner-hero";

export const dynamic = "force-static";

const HOME_FAQS = [
  {
    q: "How do I become a V Solve Hub partner?",
    a: "Sign up with your mobile number, choose the service you offer, add a profile photo and a few basic details, and submit. Most applications are verified within 24 hours.",
  },
  {
    q: "Is there any joining or registration fee?",
    a: "No. Signing up as a partner is completely free — you only pay a transparent platform commission on jobs you complete.",
  },
  {
    q: "How much can I earn?",
    a: "Earnings depend on your trade, the hours you work, and your area. You keep your payout after a transparent commission, and active partners in busy areas earn steadily.",
  },
  {
    q: "How and when do I get paid?",
    a: "Your earnings are settled to your bank account or UPI on a regular payout cycle once a job is marked complete.",
  },
  {
    q: "What documents do I need to sign up?",
    a: "A profile photo and basic details are enough to get started. Aadhaar is optional and can be added later; drivers also add a driving licence and vehicle registration (RC).",
  },
  {
    q: "Which areas is V Solve Hub available in?",
    a: "We're live across Telangana and expanding. Enter your area during signup to see the services available near you.",
  },
];

const FEATURES = [
  { icon: Wallet, tone: "brand" as Tone, title: "Weekly Payouts", body: "Get your hard-earned money deposited directly into your bank account every single week." },
  { icon: Clock, tone: "amber" as Tone, title: "Flexible Hours", body: "You are your own boss. Choose when and where you want to work based on your schedule." },
  { icon: LineChart, tone: "green" as Tone, title: "Transparent Earnings", body: "Real-time tracking of your income, bonuses, and customer tips with zero hidden fees." },
  { icon: Headset, tone: "sky" as Tone, title: "Dedicated Support", body: "Access 24/7 priority support to resolve any issues and keep your business running smoothly." },
];

const TESTIMONIALS = [
  {
    quote:
      "V Solve Hub changed how I manage my rental fleet. The payout system is incredibly reliable and the local customer base is growing every single day.",
    name: "Rajesh Kumar",
    role: "Rental Vendor, Hyderabad",
    tone: "violet" as Tone,
  },
  {
    quote:
      "Finding customers was my biggest challenge. V Solve Hub brings the business to me, and I can focus on doing the work I love.",
    name: "Ananya Reddy",
    role: "Interior Professional, Warangal",
    tone: "sky" as Tone,
  },
  {
    quote:
      "I've doubled my monthly earnings while spending more time with my family. Best decision I've made for my career.",
    name: "Suresh V.",
    role: "Electrician, Nizamabad",
    tone: "green" as Tone,
  },
];

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <PartnerHero />

      {/* Designed for your success */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-ink-900">Designed for your success</h2>
            <p className="mt-2 text-gray-500">
              We provide the tools and support you need to scale your services and manage your
              earnings with ease.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm"
              >
                <Medallion icon={f.icon} tone={f.tone} size={56} />
                <h3 className="mt-4 font-semibold text-ink-900">{f.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What service do you offer */}
      <section className="bg-surface-muted px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-ink-900">What service do you offer?</h2>
            <p className="mt-2 text-gray-500">
              Join in the category that fits your work — more coming soon.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PARTNER_CATEGORIES.map((cat) => {
              const soon = cat.status === "coming-soon";
              const inner = (
                <>
                  {soon && (
                    <span className="absolute right-3 top-3 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      Soon
                    </span>
                  )}
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-surface-muted text-2xl">
                    {cat.icon}
                  </span>
                  <span className="text-base font-bold text-ink-900">{cat.name}</span>
                  <span className="text-xs text-gray-500">{cat.description}</span>
                </>
              );
              const cls =
                "group relative flex flex-col gap-2 rounded-2xl border border-border bg-white p-5 shadow-sm transition-all";
              return soon ? (
                <div key={cat.id} className={`${cls} opacity-70`}>
                  {inner}
                </div>
              ) : (
                <Link key={cat.id} href={`/login?category=${cat.id}`} className={`${cls} hover:-translate-y-1 hover:shadow-lg`}>
                  {inner}
                </Link>
              );
            })}
          </div>
          <div className="mt-10 text-center">
            <Link href="/solutions" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:text-brand-700">
              See all categories
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-ink-900">Trusted by thousands of professionals</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col rounded-2xl border border-border bg-white p-6 shadow-sm"
              >
                <Quote className="h-7 w-7 text-brand-200" />
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-gray-600">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-5 flex items-center gap-3">
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg,#8b7dff,#4f46e5)" }}
                  >
                    {t.name.charAt(0)}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink-900">{t.name}</span>
                    <span className="block text-xs text-gray-500">{t.role}</span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 pb-16">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(HOME_FAQS)) }}
        />
        <div className="mx-auto max-w-3xl">
          <h2 className="text-center text-3xl font-bold text-ink-900">
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-gray-500">
            Everything you need to know about partnering with V Solve Hub.
          </p>
          <div className="mt-8">
            <Faq items={HOME_FAQS} />
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="px-5 pb-20">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-r from-brand-600 to-brand-800 px-8 py-14 text-center text-white">
          <h2 className="text-3xl font-bold">Ready to take off?</h2>
          <p className="mx-auto mt-3 max-w-md text-white/80">
            Start your onboarding journey today and see your business flourish on Telangana&rsquo;s
            best marketplace.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/solutions">
              <Button variant="accent" size="lg">
                Become a Partner <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button size="lg" className="bg-white/10 text-white hover:bg-white/20">
                Contact Sales
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
