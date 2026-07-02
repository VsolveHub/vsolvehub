import { MessageCircle, Phone, Mail } from "lucide-react";
import { Card } from "@vsolve/ui";
import { PageHeader } from "@/components/dashboard/page-header";

const FAQS = [
  {
    q: "How long does verification take?",
    a: "Most applications are reviewed within 24 hours. You'll get a WhatsApp notification once approved.",
  },
  {
    q: "When do I get paid?",
    a: "Earnings are settled to your bank account on a daily payout cycle once a job is marked complete.",
  },
  {
    q: "How do I receive jobs?",
    a: "Live jobs are sent to the V Solve Hub partner app. Stay online to receive them in your area.",
  },
  {
    q: "A document was rejected — what now?",
    a: "Open Documents, re-upload the flagged file, and we'll review it again automatically.",
  },
];

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Support" subtitle="We're here to help you earn without hassle." />

      <div className="grid gap-4 sm:grid-cols-3">
        <a
          href="https://wa.me/917330764634"
          className="block"
          target="_blank"
          rel="noreferrer"
        >
          <Card className="h-full transition-shadow hover:shadow-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
              <MessageCircle className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-ink-900">WhatsApp</p>
            <p className="text-sm text-gray-500">Chat with support instantly.</p>
          </Card>
        </a>
        <a href="tel:+917330764634" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Phone className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-ink-900">Call us</p>
            <p className="text-sm text-gray-500">+91 733 076 4634 · 9am–9pm</p>
          </Card>
        </a>
        <a href="mailto:support@vsolvehub.com" className="block">
          <Card className="h-full transition-shadow hover:shadow-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Mail className="h-5 w-5" />
            </span>
            <p className="mt-3 font-semibold text-ink-900">Email</p>
            <p className="text-sm text-gray-500">support@vsolvehub.com</p>
          </Card>
        </a>
      </div>

      <Card>
        <h2 className="mb-2 text-lg font-semibold text-ink-900">Frequently asked questions</h2>
        <div className="divide-y divide-border">
          {FAQS.map((f) => (
            <div key={f.q} className="py-4">
              <p className="font-semibold text-ink-900">{f.q}</p>
              <p className="mt-1 text-sm text-gray-500">{f.a}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
