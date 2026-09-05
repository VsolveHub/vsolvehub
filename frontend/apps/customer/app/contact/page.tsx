import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contact Us & Help Center | V Solve Hub",
  description: "Get support, check frequently asked questions, or contact the V Solve Hub team directly.",
};

const FAQS = [
  {
    id: "booking",
    num: "01",
    question: "How do I book a domestic service?",
    answer: "Browse our service catalog, select your specific category and time slot, and fill out details of your requirements. We will calculate the price instantly and match you with a verified local professional.",
  },
  {
    id: "vetting",
    num: "02",
    question: "What is the vetting process for professionals?",
    answer: "Every service professional undergoes a rigorous identity verification, background check, and technical expertise vetting process to ensure high-quality service and security for our clients.",
  },
  {
    id: "cancellation",
    num: "03",
    question: "What is your cancellation policy?",
    answer: "You can cancel a service request without penalty before a professional is assigned and accepts. Once a specialist is matched, a late cancellation fee may apply depending on the proximity to the service start time.",
  },
  {
    id: "payment",
    num: "04",
    question: "How and when do I pay for my booking?",
    answer: "Payment is cashless and processed securely through the platform. Your card is authorized only when a professional commits to your visit, and payment is captured after the visit is completed.",
  },
];

export default function ContactPage() {
  return (
    <main className="bg-[#FAF9F7] min-h-screen pb-16">
      {/* Hero Banner Section */}
      <div className="bg-[#041227] text-white py-16 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="mx-auto max-w-[1216px] relative z-10 flex flex-col items-center text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[#8EA2C6] hover:text-white transition-colors mb-6 group">
            <svg viewBox="0 0 20 20" fill="none" className="size-3.5 rotate-180 transition-transform group-hover:-translate-x-0.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10h11m-4-4 4 4-4 4" />
            </svg>
            Back to Home
          </Link>
          <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#EA580C] bg-[#EA580C]/10 px-3 py-1 rounded-full border border-[#EA580C]/20 mb-3">
            Support & Help Center
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-3">
            Contact & Support
          </h1>
          <p className="text-xs text-[#A9B9D1] font-medium max-w-md leading-relaxed">
            Need help? Read our frequently asked questions or submit a message to our operations team.
          </p>
        </div>
      </div>

      {/* Main Content Split Layout */}
      <div className="mx-auto max-w-[1216px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-10 items-start">
          
          {/* Left Table of Contents */}
          <aside className="w-full lg:w-3/12 lg:sticky lg:top-24 flex flex-col gap-4 bg-white border border-[#e7e2da] rounded-2xl p-5 shadow-2xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy-900 border-b border-navy-900/10 pb-2.5">
              Help Categories
            </h3>
            <nav className="flex flex-col gap-1.5">
              {FAQS.map((faq) => (
                <a
                  key={faq.id}
                  href={`#${faq.id}`}
                  className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-text-secondary hover:text-[#EA580C] hover:bg-navy-50/50 rounded-lg transition-colors"
                >
                  <span>{faq.question.split(" ").slice(0, 3).join(" ") + "..."}</span>
                  <span className="text-[10px] text-text-secondary/50 font-bold font-mono">{faq.num}</span>
                </a>
              ))}
              <a
                href="#message-form"
                className="flex items-center justify-between px-3 py-2 text-xs font-bold text-[#EA580C] hover:bg-[#EA580C]/5 rounded-lg transition-colors border border-dashed border-[#EA580C]/20 mt-2"
              >
                <span>Send Message</span>
                <span>✉</span>
              </a>
            </nav>
          </aside>

          {/* Right Main Content */}
          <div className="w-full lg:w-9/12 flex flex-col gap-8">
            
            {/* FAQ List */}
            <div className="flex flex-col gap-4">
              <h2 className="text-base font-extrabold uppercase tracking-widest text-navy-900 border-b border-navy-900/10 pb-2">
                Frequently Asked Questions
              </h2>
              <div className="flex flex-col gap-4">
                {FAQS.map((faq) => (
                  <section
                    key={faq.id}
                    id={faq.id}
                    className="scroll-mt-24 bg-white border border-[#e7e2da] rounded-2xl p-6 shadow-card flex flex-col gap-3 hover:shadow-raised transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-7 items-center justify-center rounded-full bg-[#EBF0FE] text-xs font-bold font-mono text-[#2563EB]">
                        {faq.num}
                      </span>
                      <h3 className="text-sm font-extrabold text-[#00112e]">{faq.question}</h3>
                    </div>
                    <p className="text-xs text-text-secondary leading-relaxed pl-10 font-medium">
                      {faq.answer}
                    </p>
                  </section>
                ))}
              </div>
            </div>

            {/* Message Form Card */}
            <section
              id="message-form"
              className="scroll-mt-24 bg-white border border-[#e7e2da] rounded-2xl p-6 sm:p-8 shadow-card flex flex-col gap-6"
            >
              <div className="border-b border-navy-900/10 pb-4">
                <h2 className="text-lg font-bold text-navy-900">Send us a direct message</h2>
                <p className="text-xs text-text-secondary mt-1 font-medium">We typically reply within 2 hours during operations hours.</p>
              </div>
              
              <form className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="name" className="text-xs font-bold text-navy-900">Name</label>
                    <input
                      id="name"
                      type="text"
                      placeholder="Your Name"
                      className="w-full bg-[#f4f1ec] border-0 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-[#b46535]/25 font-medium"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="email" className="text-xs font-bold text-navy-900">Email Address</label>
                    <input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      className="w-full bg-[#f4f1ec] border-0 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-[#b46535]/25 font-medium"
                      required
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="message" className="text-xs font-bold text-navy-900">Message</label>
                  <textarea
                    id="message"
                    rows={4}
                    placeholder="Tell us what you need help with..."
                    className="w-full bg-[#f4f1ec] border-0 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-[#b46535]/25 font-medium resize-none"
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="mt-2 w-full sm:w-auto self-end bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold py-3 px-8 rounded-xl text-sm transition-colors shadow-xs cursor-pointer"
                >
                  Submit Message
                </button>
              </form>
            </section>

          </div>

        </div>
      </div>
    </main>
  );
}
