import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | V Solve Hub",
  description: "Read the V Solve Hub terms and conditions for users and booking domestic services.",
};

const SECTIONS = [
  {
    id: "acceptance",
    num: "01",
    title: "Acceptance of Terms",
    content: "By accessing or using V Solve Hub, you agree to comply with and be bound by these Terms of Service. If you do not agree to these terms, please do not use our platform or book services.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    )
  },
  {
    id: "services",
    num: "02",
    title: "Services & Bookings",
    content: "V Solve Hub connects customers with independent, vetted service professionals. We make reasonable efforts to vet professionals, but we are not responsible for the performance or quality of work completed, which remains the direct responsibility of the service professional.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <line x1="9" y1="9" x2="15" y2="9" />
        <line x1="9" y1="13" x2="15" y2="13" />
        <line x1="9" y1="17" x2="15" y2="17" />
      </svg>
    )
  },
  {
    id: "payments",
    num: "03",
    title: "Payments & Billing",
    content: "You agree to pay the fees for booked services at the rates presented. All transactions are handled securely through our payment processors. Charges are authorized when a professional commits to your request, and captured once the service is completed.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  },
  {
    id: "cancellation",
    num: "04",
    title: "Cancellation & Refunds",
    content: "Cancellations may be subject to a fee depending on how close to the scheduled start time they are requested. Refund requests are subject to review by our support team in accordance with our billing policies.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    )
  }
];

export default function TermsPage() {
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
            Legal & Compliance
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif font-black tracking-tight text-white mb-3">
            Terms of Service
          </h1>
          <p className="text-xs text-[#A9B9D1] font-medium">
            Last updated: August 23, 2026
          </p>
        </div>
      </div>

      {/* Main Content split layout */}
      <div className="mx-auto max-w-[1216px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-10 items-start">
          
          {/* Left Table of Contents */}
          <aside className="w-full lg:w-3/12 lg:sticky lg:top-24 flex flex-col gap-4 bg-white border border-[#e7e2da] rounded-2xl p-5 shadow-2xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-navy-900 border-b border-navy-900/10 pb-2.5">
              Sections
            </h3>
            <nav className="flex flex-col gap-1.5">
              {SECTIONS.map((sec) => (
                <a
                  key={sec.id}
                  href={`#${sec.id}`}
                  className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-text-secondary hover:text-[#EA580C] hover:bg-navy-50/50 rounded-lg transition-colors"
                >
                  <span>{sec.title}</span>
                  <span className="text-[10px] text-text-secondary/50 font-bold font-mono">{sec.num}</span>
                </a>
              ))}
            </nav>
          </aside>

          {/* Right Cards Content */}
          <div className="w-full lg:w-9/12 flex flex-col gap-6">
            {SECTIONS.map((sec) => (
              <section
                key={sec.id}
                id={sec.id}
                className="scroll-mt-24 bg-white border border-[#e7e2da] rounded-2xl p-6 sm:p-8 shadow-card flex flex-col gap-4 hover:shadow-raised transition-shadow"
              >
                <div className="flex items-center gap-4 border-b border-navy-900/5 pb-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#EBF0FE] text-[#2563EB] shadow-2xs">
                    {sec.icon}
                  </span>
                  <div>
                    <span className="text-[9px] font-bold font-mono text-[#2563EB] uppercase tracking-wider">Section {sec.num}</span>
                    <h2 className="text-lg font-extrabold text-[#00112e] font-serif leading-none mt-0.5">
                      {sec.title}
                    </h2>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-text-secondary font-medium">
                  {sec.content}
                </p>
              </section>
            ))}
          </div>

        </div>
      </div>
    </main>
  );
}
