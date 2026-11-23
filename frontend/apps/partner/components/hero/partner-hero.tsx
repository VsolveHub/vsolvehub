"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCurrentSession } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";
import { usePartnerApplication } from "@/features/application/queries";

function capNationalPhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

export function PartnerHero() {
  const router = useRouter();
  const session = useCurrentSession(getApiClient());
  const activeUser = session.data?.user ?? null;
  const application = usePartnerApplication({ enabled: Boolean(activeUser) });
  const isApproved = application.data?.status === "APPROVED";
  const activePhoneDigits = activeUser?.phone_number
    ? activeUser.phone_number.replace(/\D/g, "").slice(-10)
    : null;

  const [phone, setPhone] = useState("");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const rawPhone = capNationalPhoneDigits(phone);
    if (rawPhone.length >= 10) {
      if (activePhoneDigits && activePhoneDigits === rawPhone) {
        router.push(isApproved ? "/home" : "/apply");
        return;
      }
      if (activePhoneDigits && activePhoneDigits !== rawPhone) {
        router.push(
          `/login?phone=${encodeURIComponent(rawPhone)}&next=${encodeURIComponent("/apply")}&switch=true`
        );
        return;
      }
      router.push(`/login?phone=${encodeURIComponent(rawPhone)}&next=${encodeURIComponent("/apply")}`);
    } else {
      router.push(activeUser ? (isApproved ? "/home" : "/apply") : "/apply");
    }
  };

  return (
    <section
      id="hero"
      className="relative overflow-x-clip bg-[#faf9f8] pt-28 pb-16 sm:pt-36 sm:pb-24 lg:pt-40 lg:pb-28 text-slate-900 border-b border-line"
    >
      {/* Subtle warm ambient glow in background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[850px] h-[550px] bg-gradient-to-tr from-amber-100/40 via-orange-50/30 to-blue-50/40 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">

        {/* ========================================================================= */}
        {/* DESKTOP FLOATING TRADE NAME PILLS (Matching reference image)             */}
        {/* ========================================================================= */}

        {/* 1. Electrician (Warm peach/amber pill) */}
        <div className="hidden lg:block absolute left-6 xl:left-12 top-12 vsh-trade-float-1 group cursor-default">
          <div className="rounded-full bg-[#fde8d7] border border-[#fbd3b6] px-5 py-2.5 text-sm font-bold text-[#8a2e09] shadow-xs transition-transform duration-200 group-hover:scale-110 select-none">
            Electrician
          </div>
        </div>

        {/* 2. Plumber (Soft sky/periwinkle blue pill) */}
        <div className="hidden lg:block absolute left-16 xl:left-24 top-52 vsh-trade-float-2 group cursor-default">
          <div className="rounded-full bg-[#e0eaff] border border-[#c7d7fe] px-5 py-2.5 text-sm font-bold text-[#1d4ed8] shadow-xs transition-transform duration-200 group-hover:scale-110 select-none">
            Plumber
          </div>
        </div>

        {/* 3. AC technician (Soft mint green pill) */}
        <div className="hidden lg:block absolute left-8 xl:left-14 bottom-8 vsh-trade-float-3 group cursor-default">
          <div className="rounded-full bg-[#dcfce7] border border-[#bbf7d0] px-5 py-2.5 text-sm font-bold text-[#15803d] shadow-xs transition-transform duration-200 group-hover:scale-110 select-none">
            AC technician
          </div>
        </div>

        {/* 4. Cleaner (Soft lavender/purple pill) */}
        <div className="hidden lg:block absolute right-6 xl:right-12 top-12 vsh-trade-float-4 group cursor-default">
          <div className="rounded-full bg-[#f3e8ff] border border-[#e9d5ff] px-5 py-2.5 text-sm font-bold text-[#7e22ce] shadow-xs transition-transform duration-200 group-hover:scale-110 select-none">
            Cleaner
          </div>
        </div>

        {/* 5. Carpenter (Soft cream/yellow pill) */}
        <div className="hidden lg:block absolute right-16 xl:right-24 top-52 vsh-trade-float-5 group cursor-default">
          <div className="rounded-full bg-[#fef3c7] border border-[#fde68a] px-5 py-2.5 text-sm font-bold text-[#b45309] shadow-xs transition-transform duration-200 group-hover:scale-110 select-none">
            Carpenter
          </div>
        </div>

        {/* 6. Painter (Soft pink/blush pill) */}
        <div className="hidden lg:block absolute right-8 xl:right-14 bottom-8 vsh-trade-float-6 group cursor-default">
          <div className="rounded-full bg-[#ffe4e6] border border-[#fecdd3] px-5 py-2.5 text-sm font-bold text-[#be123c] shadow-xs transition-transform duration-200 group-hover:scale-110 select-none">
            Painter
          </div>
        </div>


        {/* ========================================================================= */}
        {/* MOBILE TOP 3 TRADE PILLS (Electrician, Plumber, AC technician)            */}
        {/* ========================================================================= */}
        <div className="flex lg:hidden flex-wrap items-center justify-center gap-2.5 pb-6">
          <div className="rounded-full bg-[#fde8d7] border border-[#fbd3b6] px-4 py-2 text-xs font-bold text-[#8a2e09] shadow-xs vsh-trade-float-1 select-none">
            Electrician
          </div>
          <div className="rounded-full bg-[#e0eaff] border border-[#c7d7fe] px-4 py-2 text-xs font-bold text-[#1d4ed8] shadow-xs vsh-trade-float-2 select-none">
            Plumber
          </div>
          <div className="rounded-full bg-[#dcfce7] border border-[#bbf7d0] px-4 py-2 text-xs font-bold text-[#15803d] shadow-xs vsh-trade-float-3 select-none">
            AC technician
          </div>
        </div>


        {/* ========================================================================= */}
        {/* MAIN CENTER CONTENT: Headline, Subtitle, Form & Google Play Badge         */}
        {/* ========================================================================= */}
        <div className="max-w-2xl mx-auto text-center space-y-6">

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-[#00112e] leading-[1.08]">
            Your skill. Their<br />
            doorstep. <span className="text-[#f25c05]">Paid<br />instantly.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-slate-600 text-sm sm:text-base max-w-lg mx-auto font-medium leading-relaxed">
            Now onboarding service professionals in Hyderabad. Get local jobs and weekly bank payouts.
          </p>

          {/* Phone Apply Form (Matching Reference Image) */}
          <form onSubmit={handleSubmit} className="pt-2 max-w-lg mx-auto">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative w-full flex-1">
                <label htmlFor="hero-phone" className="sr-only">
                  Mobile number
                </label>
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 flex items-center">
                  <span className="text-[17px] font-bold text-[#00112e] tracking-tight">+91</span>
                </div>
                <input
                  id="hero-phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                  placeholder="10–digit mobile number"
                  value={phone}
                  onChange={(event) => setPhone(capNationalPhoneDigits(event.target.value))}
                  className="w-full h-[52px] pl-16 pr-4 rounded-2xl bg-white border border-slate-300 text-[#00112e] font-medium text-base placeholder:text-slate-500 focus:outline-none focus:border-[#fa5a00] focus:ring-1 focus:ring-[#fa5a00] shadow-xs transition-colors"
                />
              </div>
              <button
                type="submit"
                className="w-full sm:w-auto h-[52px] px-8 rounded-2xl bg-[#fa5a00] hover:bg-[#e05000] active:scale-98 text-[#00112e] font-extrabold text-base tracking-normal transition-all shadow-none shrink-0"
              >
                Apply now
              </button>
            </div>
          </form>

          {/* Official Google Play Store Badge Button */}
          <div className="pt-1 flex flex-col items-center gap-3">
            <a
              href="https://play.google.com/store/apps/details?id=com.vsolvehub.partner"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Get VSolveHub Partner App on Google Play"
              className="inline-flex items-center gap-2.5 bg-black hover:bg-neutral-900 text-white px-4 py-2 rounded-xl transition-all hover:scale-102 active:scale-98 shadow-sm"
            >
              {/* Official Google Play Brand SVG */}
              <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M3.609 1.814L13.792 12 3.61 22.186a2.38 2.38 0 01-.61-.913V2.727c.18-.363.398-.679.61-.913z" />
                <path fill="#FBBC04" d="M17.38 10.152L14.845 8.69 3.609 1.814 14.845 12z" />
                <path fill="#34A853" d="M14.845 12l-11.236 10.186 11.236-6.876 2.535-1.462z" />
                <path fill="#EA4335" d="M17.38 10.152l3.415 1.972c1.08.625 1.08 1.644 0 2.27l-3.415 1.972-2.535-1.462-2.535-1.462 2.535-1.462z" />
              </svg>
              <div className="text-left">
                <div className="text-[8px] uppercase tracking-wider text-slate-300 font-semibold leading-none">GET IT ON</div>
                <div className="text-[15px] font-bold text-white leading-tight tracking-tight">Google Play</div>
              </div>
            </a>

            {/* Already a Partner Sign In */}
            <div className="text-xs text-slate-600 font-medium">
              Already a partner?{" "}
              <Link href="/login" className="font-bold text-[#00112e] underline underline-offset-2 hover:text-[#fa5a00] transition-colors">
                Sign in
              </Link>
            </div>
          </div>

        </div>

        {/* ========================================================================= */}
        {/* MOBILE BOTTOM 3 TRADE PILLS (Cleaner, Carpenter, Painter)                 */}
        {/* ========================================================================= */}
        <div className="flex lg:hidden flex-wrap items-center justify-center gap-2.5 pt-8">
          <div className="rounded-full bg-[#f3e8ff] border border-[#e9d5ff] px-4 py-2 text-xs font-bold text-[#7e22ce] shadow-xs vsh-trade-float-4 select-none">
            Cleaner
          </div>
          <div className="rounded-full bg-[#fef3c7] border border-[#fde68a] px-4 py-2 text-xs font-bold text-[#b45309] shadow-xs vsh-trade-float-5 select-none">
            Carpenter
          </div>
          <div className="rounded-full bg-[#ffe4e6] border border-[#fecdd3] px-4 py-2 text-xs font-bold text-[#be123c] shadow-xs vsh-trade-float-6 select-none">
            Painter
          </div>
        </div>

      </div>
    </section>
  );
}
