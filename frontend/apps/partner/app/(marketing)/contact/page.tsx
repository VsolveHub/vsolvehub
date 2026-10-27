import type { Metadata } from "next";
import { MessageCircle, Phone, Mail, Clock, MapPin, ShieldCheck } from "lucide-react";
import { Card } from "@vsolve/ui";

export const dynamic = "force-static";
export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Get in touch with V Solve Hub partner support — call +91 879 056 4634, WhatsApp us, or email support@vsolvehub.com. We're here 9am–9pm.",
  alternates: { canonical: "/contact" },
};

const CHANNELS = [
  {
    icon: MessageCircle,
    tone: "bg-emerald-50 text-emerald-600 border-emerald-200/80",
    title: "WhatsApp",
    detail: "Chat with support instantly",
    value: "+91 879 056 4634",
    href: "https://wa.me/918790564634",
    external: true,
  },
  {
    icon: Phone,
    tone: "bg-blue-50 text-blue-600 border-blue-200/80",
    title: "Call us",
    detail: "9am–9pm, all days",
    value: "+91 879 056 4634",
    href: "tel:+918790564634",
  },
  {
    icon: Mail,
    tone: "bg-amber-50 text-amber-600 border-amber-200/80",
    title: "Email",
    detail: "We reply within a business day",
    value: "support@vsolvehub.com",
    href: "mailto:support@vsolvehub.com",
  },
];

export default function ContactPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 pt-24 sm:pt-28 lg:pt-32 pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface-sunken px-3.5 py-1 text-xs font-bold text-navy-900 shadow-xs mb-3">
          <ShieldCheck size={13} className="text-emerald-600" />
          Partner Support & Helpline
        </span>
        <h1 className="text-3xl font-extrabold text-navy-900 tracking-tight sm:text-4xl">
          Contact us
        </h1>
        <p className="mt-2 text-sm sm:text-base text-text-secondary leading-relaxed max-w-xl mx-auto">
          Questions about becoming a partner or need help with your account? Reach our dedicated partner support team any day, 9am–9pm.
        </p>
      </div>

      <div className="mx-auto mt-8 sm:mt-10 grid max-w-3xl gap-4 sm:grid-cols-3">
        {CHANNELS.map((c) => (
          <a
            key={c.title}
            href={c.href}
            {...(c.external ? { target: "_blank", rel: "noreferrer" } : {})}
            className="group block rounded-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Card className="h-full rounded-3xl border border-line bg-surface p-6 text-center transition-all duration-200 hover:border-line-strong hover:shadow-md hover:-translate-y-0.5">
              <span
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border shadow-xs ${c.tone}`}
              >
                <c.icon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-base font-bold text-navy-900">{c.title}</p>
              <p className="mt-1 text-xs text-text-secondary">{c.detail}</p>
              <p className="mt-3 text-sm font-extrabold text-navy-900 group-hover:text-signal-700 transition-colors">
                {c.value}
              </p>
            </Card>
          </a>
        ))}
      </div>

      {/* Operating Hours & Physical Center Card */}
      <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-line bg-surface-sunken/70 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
            <Clock className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy-900 leading-tight">Operating Hours</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Monday through Sunday, 9:00 AM – 9:00 PM IST
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 border-t sm:border-t-0 sm:border-l border-line pt-3 sm:pt-0 sm:pl-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700 border border-teal-100">
            <MapPin className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-bold text-navy-900 leading-tight">Partner Onboarding Hub</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              Hitech City, Hyderabad, Telangana 500081
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
