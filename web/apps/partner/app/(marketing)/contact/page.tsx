import type { Metadata } from "next";
import { MessageCircle, Phone, Mail } from "lucide-react";
import { Card } from "@vsolve/ui";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Get in touch with V Solve Hub partner support — call +91 733 076 4634, WhatsApp us, or email support@vsolvehub.com. We're here 9am–9pm.",
  alternates: { canonical: "/contact" },
};

const CHANNELS = [
  {
    icon: MessageCircle,
    tone: "bg-green-100 text-green-600",
    title: "WhatsApp",
    detail: "Chat with support instantly",
    value: "+91 733 076 4634",
    href: "https://wa.me/917330764634",
    external: true,
  },
  {
    icon: Phone,
    tone: "bg-brand-50 text-brand-600",
    title: "Call us",
    detail: "9am–9pm, all days",
    value: "+91 733 076 4634",
    href: "tel:+917330764634",
  },
  {
    icon: Mail,
    tone: "bg-amber-100 text-amber-600",
    title: "Email",
    detail: "We reply within a business day",
    value: "support@vsolvehub.com",
    href: "mailto:support@vsolvehub.com",
  },
];

export default function ContactPage() {
  return (
    <main className="px-5 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl">Contact us</h1>
        <p className="mt-3 text-lg text-gray-500">
          Questions about becoming a partner or need help with your account? Reach our support team
          any day, 9am–9pm.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <a
            key={c.title}
            href={c.href}
            {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="block"
          >
            <Card className="h-full text-center transition-shadow hover:shadow-md">
              <span
                className={`mx-auto flex h-11 w-11 items-center justify-center rounded-lg ${c.tone}`}
              >
                <c.icon className="h-5 w-5" />
              </span>
              <p className="mt-3 font-semibold text-ink-900">{c.title}</p>
              <p className="text-xs text-gray-400">{c.detail}</p>
              <p className="mt-1 text-sm font-medium text-brand-600">{c.value}</p>
            </Card>
          </a>
        ))}
      </div>
    </main>
  );
}
