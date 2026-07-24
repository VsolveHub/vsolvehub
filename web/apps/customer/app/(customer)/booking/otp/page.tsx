import { OtpForm } from "@/components/customer/auth/OtpForm";
import { getServerSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import logoMark from "@/public/logo-mark.png";
import heroCouples from "@/public/login_hero_couples.png";

type PageProps = {
  searchParams: Promise<{ redirect?: string }>;
};

export default async function BookingOtpPage({ searchParams }: PageProps) {
  const session = await getServerSession();
  const { redirect: redirectTo } = await searchParams;

  if (session) {
    redirect(redirectTo ?? "/booking");
  }

  return (
    <div className="w-full bg-[#f8f9fa] py-6 sm:py-12 px-4 sm:px-6">
      <div className="mx-auto w-full max-w-5xl bg-white rounded-3xl border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
          
          {/* Left Column: Official Logo, Tagline & People Illustration */}
          <div className="lg:col-span-6 flex flex-col items-center text-center p-6 sm:p-10 bg-slate-50/50">
            {/* Logo Mark */}
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center p-1 overflow-hidden mx-auto">
              <Image
                src={logoMark}
                alt="Vsolve Hub Logo"
                priority
                sizes="96px"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Brand Title */}
            <h2 className="font-heading text-2xl font-black tracking-wider text-[#0b1c30] mt-2">
              V SOLVE <span className="text-[#ea580c]">HUB</span>
            </h2>

            {/* Tagline */}
            <p className="text-xs sm:text-sm font-extrabold text-[#0b1c30] tracking-tight mt-0.5">
              All Services at Your Fingertips
            </p>

            {/* Hero Illustration */}
            <div className="mt-6 w-full max-w-xs sm:max-w-sm overflow-hidden mx-auto">
              <Image
                src={heroCouples}
                alt="Vsolve Hub booking illustration"
                placeholder="blur"
                sizes="(min-width: 640px) 384px, 320px"
                className="w-full h-auto object-contain max-h-[300px]"
              />
            </div>
          </div>

          {/* Right Column: Sign In Header & Form Card */}
          <div className="lg:col-span-6 flex flex-col justify-center p-6 sm:p-10">
            <div className="mb-6 text-center lg:text-left">
              <span className="text-xs font-bold uppercase tracking-widest text-[#ea580c]">
                Welcome Back!
              </span>
              <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-[#0b1c30] tracking-tight mt-1">
                Welcome to Vsolve Hub
              </h1>
              <p className="text-xs sm:text-sm font-medium text-slate-500 mt-1">
                Login to book and manage your home services.
              </p>
            </div>

            {/* Main Form Container Card */}
            <div className="w-full rounded-2xl bg-white p-5 sm:p-6 border border-slate-100 shadow-xs">
              <OtpForm redirectTo={redirectTo ?? "/booking"} />
            </div>

            {/* Bottom Signup Prompt Link */}
            <div className="mt-5 w-full flex items-center justify-between px-1 text-xs font-semibold text-slate-500">
              <span>New to Vsolve Hub?</span>
              <Link href="/services" className="font-bold text-[#ea580c] hover:underline transition-colors">
                Browse Services & Sign Up →
              </Link>
            </div>
          </div>

        </div>
      </div>

      {/* Page Bottom Footer */}
      <footer className="mx-auto w-full max-w-5xl mt-6 px-2 text-[11px] font-medium text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          Vsolve Hub © {new Date().getFullYear()} Vsolve Hub. All rights reserved.
        </div>
        <div className="flex items-center gap-4">
          <Link href="/support" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
          <Link href="/support" className="hover:text-slate-600 transition-colors">Terms of Service</Link>
          <Link href="/support" className="hover:text-slate-600 transition-colors">Security</Link>
        </div>
      </footer>
    </div>
  );
}
