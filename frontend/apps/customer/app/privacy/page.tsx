import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | V Solve Hub",
  description: "Learn how V Solve Hub collects, uses, and protects your personal data.",
};

const SECTIONS = [
  {
    id: "info",
    num: "01",
    title: "Information We Collect",
    content: "We collect information to provide better services to all our users. This includes information you provide to us (such as name, email address, phone number, and billing information) when creating an account or booking a service, as well as information collected automatically (such as device information, location data, and usage details).",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    )
  },
  {
    id: "use",
    num: "02",
    title: "How We Use Your Information",
    content: "We use the collected data to process bookings, match you with service professionals, communicate with you regarding your service requests, improve our platform, and send marketing communications (where permitted). We never sell your personal information to third parties.",
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
    id: "security",
    num: "03",
    title: "Data Security",
    content: "We implement advanced technical and organizational security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no internet transmission is ever completely secure, and we cannot guarantee absolute security.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    )
  },
  {
    id: "rights",
    num: "04",
    title: "Your Rights",
    content: "Depending on your location, you may have rights under local laws regarding your personal information, including the right to access, correct, delete, or restrict the use of your data. To exercise these rights, please contact our support team.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  }
];

export default function PrivacyPage() {
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
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-3">
            Privacy Policy
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
                    <h2 className="text-lg font-extrabold text-[#00112e] leading-none mt-0.5">
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
