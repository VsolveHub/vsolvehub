import type { Metadata } from "next";
import Link from "next/link";

import { ContactForm } from "@/features/support/view/contact-form";
import { grievanceOfficerLabel, SUPPORT } from "@/lib/support";

const phone = SUPPORT.phone;

export const metadata: Metadata = {
  title: "Contact Us & Help Center",
  description: `${phone ? `Call or WhatsApp ${phone.display} (${SUPPORT.phoneHours}), email` : "Email"} ${SUPPORT.email}, or send us a message. Answers to common questions about booking, payments and cancellations.`,
  alternates: { canonical: "/contact" },
};

const CHANNELS: { title: string; value: string; detail: string; href: string; external: boolean }[] = [
  ...(phone
    ? [
        {
          title: "WhatsApp",
          value: phone.display,
          detail: `Chat with us, ${SUPPORT.phoneHours}`,
          href: phone.whatsappHref,
          external: true,
        },
        {
          title: "Call us",
          value: phone.display,
          detail: SUPPORT.phoneHours,
          href: phone.telHref,
          external: false,
        },
      ]
    : []),
  {
    title: "Email",
    value: SUPPORT.email,
    detail: `We reply ${SUPPORT.replyTime}`,
    href: `mailto:${SUPPORT.email}`,
    external: false,
  },
];

const FAQS = [
  {
    id: "booking",
    question: "How do I book a service?",
    answer: (
      <>
        Choose a service, tell us about the job and pick a time. When you check out, your request
        goes to verified professionals near you. You are not charged at checkout — you pay only
        once a professional has accepted your booking.
      </>
    ),
  },
  {
    id: "professionals",
    question: "How are professionals checked?",
    answer: (
      <>
        Every professional completes identity and document checks before they can accept work,
        and customers rate them after every job.
      </>
    ),
  },
  {
    id: "payment",
    question: "How and when do I pay?",
    answer: (
      <>
        You pay online through our payment partner, Razorpay, once a professional has accepted.
        If nobody accepts, you are not charged. A receipt for every payment is available from your
        booking.
      </>
    ),
  },
  {
    id: "cancellation",
    question: "Can I cancel or reschedule?",
    answer: (
      <>
        Yes. Cancelling well ahead of your visit is free, and so is rescheduling with enough
        notice. Closer to the visit a fee applies, and the app always shows the exact fee before
        you confirm. The current fees are in our{" "}
        <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>.
      </>
    ),
  },
  {
    id: "refunds",
    question: "How long does a refund take?",
    answer: (
      <>
        We start a refund as soon as it is due. It goes back to your original payment method, and
        banks usually take 5–7 working days to show it.
      </>
    ),
  },
] as const;

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#FAF9F7] pb-16">
      <div className="relative overflow-hidden bg-[#041227] px-4 py-16 text-white sm:px-6">
        <div className="absolute inset-0 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        <div className="relative z-10 mx-auto flex max-w-[1216px] flex-col items-center text-center">
          <Link
            href="/"
            className="group mb-6 inline-flex items-center gap-1.5 text-xs font-bold tracking-widest text-[#8EA2C6] uppercase transition-colors hover:text-white"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="size-3.5 rotate-180 transition-transform group-hover:-translate-x-0.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 10h11m-4-4 4 4-4 4" />
            </svg>
            Back to Home
          </Link>
          <span className="mb-3 rounded-full border border-[#EA580C]/20 bg-[#EA580C]/10 px-3 py-1 text-[10px] font-extrabold tracking-[0.2em] text-[#EA580C] uppercase">
            Support & Help Center
          </span>
          <h1 className="mb-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Contact & Support
          </h1>
          <p className="max-w-md text-xs leading-relaxed font-medium text-[#A9B9D1]">
            {phone ? `Call or WhatsApp us ${SUPPORT.phoneHours}, or send` : "Send"} a message and
            we will reply {SUPPORT.replyTime}.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1216px] px-4 py-12 sm:px-6 lg:px-8">
        <div className={`grid grid-cols-1 gap-4 ${CHANNELS.length > 1 ? "sm:grid-cols-3" : ""}`}>
          {CHANNELS.map((channel) => (
            <a
              key={channel.title}
              href={channel.href}
              {...(channel.external ? { target: "_blank", rel: "noreferrer" } : {})}
              className="flex flex-col gap-1 rounded-2xl border border-[#e7e2da] bg-white p-5 shadow-card transition-shadow hover:shadow-raised"
            >
              <span className="text-xs font-bold tracking-wider text-[#EA580C] uppercase">
                {channel.title}
              </span>
              <span className="text-base font-extrabold break-all text-navy-900">
                {channel.value}
              </span>
              <span className="text-xs font-medium text-text-secondary">{channel.detail}</span>
            </a>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start gap-10 lg:flex-row">
          <section
            id="message-form"
            aria-labelledby="message-form-heading"
            className="flex w-full scroll-mt-24 flex-col gap-6 rounded-2xl border border-[#e7e2da] bg-white p-6 shadow-card sm:p-8 lg:w-7/12"
          >
            <div className="border-b border-navy-900/10 pb-4">
              <h2 id="message-form-heading" className="text-lg font-bold text-navy-900">
                Send us a message
              </h2>
              <p className="mt-1 text-xs font-medium text-text-secondary">
                It goes straight to our support team. We reply {SUPPORT.replyTime}.
              </p>
            </div>
            <ContactForm />
          </section>

          <section aria-labelledby="faq-heading" className="flex w-full flex-col gap-4 lg:w-5/12">
            <h2
              id="faq-heading"
              className="border-b border-navy-900/10 pb-2 text-base font-extrabold tracking-widest text-navy-900 uppercase"
            >
              Common questions
            </h2>
            {FAQS.map((faq) => (
              <div
                key={faq.id}
                id={faq.id}
                className="scroll-mt-24 rounded-2xl border border-[#e7e2da] bg-white p-5 shadow-card"
              >
                <h3 className="text-sm font-extrabold text-[#00112e]">{faq.question}</h3>
                <p className="mt-2 text-xs leading-relaxed font-medium text-text-secondary [&_a]:font-semibold [&_a]:text-action">
                  {faq.answer}
                </p>
              </div>
            ))}
            <div className="rounded-2xl border border-[#e7e2da] bg-white p-5 shadow-card">
              <h3 className="text-sm font-extrabold text-[#00112e]">Complaints and grievances</h3>
              <p className="mt-2 text-xs leading-relaxed font-medium text-text-secondary [&_a]:font-semibold [&_a]:text-action">
                Not happy with how we handled something? Write to {grievanceOfficerLabel()} at{" "}
                <a href={`mailto:${SUPPORT.email}?subject=Grievance`}>{SUPPORT.email}</a> with
                &ldquo;Grievance&rdquo; in the subject. We acknowledge it within 48 hours and aim to
                resolve it within one month.
              </p>
            </div>
            <p className="text-xs font-medium text-text-secondary [&_a]:font-semibold [&_a]:text-action">
              Read our <Link href="/terms">Terms</Link>, <Link href="/privacy">Privacy Policy</Link>{" "}
              and <Link href="/refund-policy">Refund &amp; Cancellation Policy</Link>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
