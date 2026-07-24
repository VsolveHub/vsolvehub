import Link from "next/link";
import { HOME_FAQ } from "@/lib/catalog/display-catalog";
import { FaqAccordion } from "@/components/customer/support/FaqAccordion";

const CONTACT = [
  {
    icon: "💬",
    title: "Live chat",
    desc: "Chat with our support team in real-time. Typical reply in under 5 minutes.",
    cta: "Start chat →",
    href: "#",
  },
  {
    icon: "📞",
    title: "Call us",
    desc: "Prefer to talk? Reach our support team by phone anytime, 24/7.",
    cta: "1-800-123-4567 →",
    href: "tel:+18001234567",
  },
  {
    icon: "📧",
    title: "Email us",
    desc: "Send us an email and we'll get back to you within 24 hours.",
    cta: "support@vsolvehub.com →",
    href: "mailto:support@vsolvehub.com",
  },
];

export default function SupportPage() {
  return (
    <div className="w-full">
      <section className="bg-gradient-to-br from-[var(--color-brand-dark)] to-[var(--color-brand)] px-4 py-14 text-center text-white">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">How can we help you?</h1>
          <p className="mt-3 text-white/80">
            Find answers to common questions or reach out to our team directly. We're here for you 24/7.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CONTACT.map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div className="mb-3 text-3xl">{c.icon}</div>
              <h3 className="text-base font-bold text-gray-900">{c.title}</h3>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-gray-500">{c.desc}</p>
              <span className="mt-4 text-sm font-black text-[var(--color-brand)]">{c.cta}</span>
            </Link>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="mb-6 text-2xl font-black tracking-tight text-gray-900">
            Frequently asked questions
          </h2>
          <FaqAccordion items={HOME_FAQ} />
        </section>
      </div>
    </div>
  );
}
