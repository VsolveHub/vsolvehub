import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Become a Partner",
  description:
    "Join V Solve Hub as a verified service professional in Hyderabad and get booked for home service jobs near you.",
  alternates: { canonical: "/join-pro" },
};

const BENEFITS = [
  {
    title: "Vetted Premium Client Base",
    description: "Get matched directly with clients who have already verified their payment details, ensuring reliable work without collection hassles.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )
  },
  {
    title: "Flexible Hours",
    description: "Accept and fulfill job requests entirely on your own schedule. Work when and where you want.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    )
  },
  {
    title: "Exemplary Compensation",
    description: "Earn top rates for your professional trade expertise, with payouts deposited directly and securely to your bank account weekly.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  },
];

export default function JoinProPage() {
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
            Partner Program
          </span>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-3">
            Become a Partner
          </h1>
          <p className="text-xs text-[#A9B9D1] font-medium max-w-md leading-relaxed">
            Gain access to high-quality service jobs in your region, set your own schedule, and build your business.
          </p>
        </div>
      </div>

      {/* Main Content Split Layout */}
      <div className="mx-auto max-w-[1216px] px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-10 items-start">
          
          {/* Left: Program Benefits */}
          <div className="w-full lg:w-5/12 flex flex-col gap-6">
            <h2 className="text-base font-extrabold uppercase tracking-widest text-navy-900 border-b border-navy-900/10 pb-2">
              Program Benefits
            </h2>
            <div className="flex flex-col gap-4">
              {BENEFITS.map((benefit, index) => (
                <div
                  key={index}
                  className="bg-white border border-[#e7e2da] rounded-2xl p-5 shadow-card flex gap-4 items-start hover:shadow-raised transition-shadow"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#EBF0FE] text-[#2563EB]">
                    {benefit.icon}
                  </span>
                  <div>
                    <h3 className="font-extrabold text-sm text-[#00112e]">{benefit.title}</h3>
                    <p className="text-xs text-text-secondary mt-1 leading-relaxed font-medium">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Registration Form */}
          <div className="w-full lg:w-7/12 flex flex-col gap-6">
            <section className="bg-white border border-[#e7e2da] rounded-2xl p-6 sm:p-8 shadow-card flex flex-col gap-6">
              <div className="border-b border-navy-900/10 pb-4">
                <h2 className="text-lg font-bold text-navy-900">Partnership Request Form</h2>
                <p className="text-xs text-text-secondary mt-1 font-medium">Provide details about your experience. Vetting specialists typically contact you within 24 hours.</p>
              </div>
              
              <form className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="businessName" className="text-xs font-bold text-navy-900">Name or Business Name</label>
                    <input
                      id="businessName"
                      type="text"
                      placeholder="e.g. Premium Electricals"
                      className="w-full bg-[#f4f1ec] border-0 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-[#b46535]/25 font-medium"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="trade" className="text-xs font-bold text-navy-900">Primary Trade / Service Type</label>
                    <select
                      id="trade"
                      className="w-full bg-[#f4f1ec] border-0 rounded-xl px-4 py-2.5 text-sm text-navy-900 focus:outline-none focus:ring-2 focus:ring-[#b46535]/25 font-medium"
                      required
                    >
                      <option value="electrician">Electrician</option>
                      <option value="plumber">Plumber / Plumbing</option>
                      <option value="cleaning">Deep Cleaning</option>
                      <option value="painting">Painting & Decorating</option>
                      <option value="ac-repair">AC Repair</option>
                      <option value="carpenter">Carpenter</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="phone" className="text-xs font-bold text-navy-900">Phone Number</label>
                    <input
                      id="phone"
                      type="tel"
                      placeholder="e.g. +1 (555) 000-0000"
                      className="w-full bg-[#f4f1ec] border-0 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-[#b46535]/25 font-medium"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor="city" className="text-xs font-bold text-navy-900">City / Operating Region</label>
                    <input
                      id="city"
                      type="text"
                      placeholder="e.g. New York, NY"
                      className="w-full bg-[#f4f1ec] border-0 rounded-xl px-4 py-2.5 text-sm text-navy-900 placeholder:text-text-secondary/70 focus:outline-none focus:ring-2 focus:ring-[#b46535]/25 font-medium"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="mt-2 w-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-bold py-3 rounded-xl text-sm transition-colors shadow-xs cursor-pointer"
                >
                  Submit Application
                </button>
              </form>
            </section>
          </div>

        </div>
      </div>
    </main>
  );
}
