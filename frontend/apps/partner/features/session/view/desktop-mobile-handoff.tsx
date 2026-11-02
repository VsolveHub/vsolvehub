"use client";

import { useLogout } from "@vsolve/query";
import { Logo } from "@vsolve/ui";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  LogOut,
  Smartphone,
  ShieldCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import type { Schemas } from "@vsolve/api-client";
import { getApiClient } from "@/lib/api/browser";

interface DesktopMobileHandoffProps {
  application?: Schemas["PartnerApplication"] | null;
  phone?: string | null;
  name?: string | null;
}

export function DesktopMobileHandoff({
  application,
  phone,
  name,
}: DesktopMobileHandoffProps) {
  const logout = useLogout(getApiClient());
  const partnerName = name || application?.display_name || "Partner";
  const partnerPhone = phone || "Registered Phone";
  const track = application?.track;

  const trackLabel =
    track === "SERVICES"
      ? "Services & Skilled Trades"
      : track === "RENTAL_OWNER"
      ? "Equipment & Tool Rentals"
      : track === "STAY_HOST"
      ? "Accommodation & Stays"
      : "Verified Service Partner";

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#FAF9F7] text-navy-900">
      {/* Top Floating Pill Navigation */}
      <div className="fixed top-4 inset-x-0 z-50 px-4 sm:px-6 pointer-events-none">
        <header className="pointer-events-auto mx-auto max-w-6xl rounded-full bg-white/95 backdrop-blur-2xl border border-line-strong shadow-[0_12px_32px_rgba(0,17,46,0.08),0_1px_3px_rgba(0,0,0,0.04)] px-5 py-3 transition-all">
          <div className="flex items-center justify-between gap-4">
            {/* Brand Logo & Verification Badge */}
            <div className="flex items-center gap-3 sm:gap-4">
              <Link href="/me/documents" className="flex items-center gap-2">
                <Logo className="h-7 w-auto" />
              </Link>
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Registration Completed • Verified Partner
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/me/documents"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-4 text-xs font-bold text-navy-900 transition-colors hover:bg-surface-hover hover:border-line-strong"
              >
                <FileCheck2 size={15} className="text-emerald-600" />
                <span>Application & Documents</span>
              </Link>

              <button
                type="button"
                onClick={() => logout.mutate()}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-white px-4 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-hover hover:text-navy-900"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </header>
      </div>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 pt-28 pb-16 sm:px-6 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Congratulations & Instructions */}
          <div className="flex flex-col gap-6 lg:col-span-7">
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-bold text-emerald-800">
                <CheckCircle2 size={14} className="text-emerald-600" />
                Registration Completed Successfully
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                <Smartphone size={14} className="text-amber-600" />
                Mobile-Only Partner App
              </span>
            </div>

            {/* Main Title & Narrative */}
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl lg:text-5xl lg:leading-tight">
                Download Partner App{" "}
                <span className="block text-2xl font-bold sm:text-3xl lg:text-4xl text-signal-500 mt-1">
                  Now your registration is completed!
                </span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
                Your partner onboarding, verification, and KYC documents have been approved.
                Live partner operations—including receiving bookings, radar dispatch, customer navigation, and instant payouts—operate exclusively on mobile.
              </p>
            </div>

            {/* Verified Partner Profile Card */}
            <div className="overflow-hidden rounded-3xl border border-line bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-line pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900 font-extrabold text-white text-lg shadow-sm">
                    {partnerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-navy-900 text-base sm:text-lg">
                        {partnerName}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                        <CheckCircle2 size={11} className="text-emerald-600" /> Verified
                      </span>
                    </div>
                    <span className="text-xs font-medium text-text-secondary">{partnerPhone}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="block text-[11px] font-medium text-text-secondary">Trade Category</span>
                  <span className="block text-xs font-bold text-navy-900">{trackLabel}</span>
                </div>
              </div>

              {/* Status Row */}
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1 rounded-2xl bg-surface-sunken p-3.5 text-center border border-line">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Onboarding</span>
                  <span className="text-xs font-extrabold text-emerald-700">Approved</span>
                </div>
                <div className="flex flex-col gap-1 rounded-2xl bg-surface-sunken p-3.5 text-center border border-line">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">KYC Documents</span>
                  <span className="text-xs font-extrabold text-emerald-700">Verified</span>
                </div>
                <div className="flex flex-col gap-1 rounded-2xl bg-surface-sunken p-3.5 text-center border border-line">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Operations</span>
                  <span className="text-xs font-extrabold text-signal-500">Mobile Only</span>
                </div>
              </div>

              {/* Bottom Document Review Link */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs pt-4 border-t border-line">
                <Link
                  href="/me/documents"
                  className="inline-flex items-center gap-1.5 font-bold text-navy-900 transition-colors hover:text-signal-500"
                >
                  <FileCheck2 size={15} className="text-emerald-600" />
                  <span>Review Registered Documents & Agreements</span>
                  <ArrowRight size={13} />
                </Link>

                <span className="text-[11px] text-text-secondary">
                  Desktop view is restricted to registration, profile & documents.
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: Download QR & Store Badges */}
          <div className="flex flex-col items-center justify-center lg:col-span-5">
            <div className="relative flex w-full max-w-md flex-col items-center rounded-3xl border border-line bg-white p-7 text-center shadow-[0_16px_40px_rgba(0,17,46,0.06)]">
              {/* Top Tag */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-200 bg-amber-100 px-3.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900 shadow-sm">
                Get Started on Mobile
              </div>

              <div className="flex flex-col items-center gap-3.5 w-full mt-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-signal-500 border border-amber-200">
                  <Smartphone size={24} />
                </div>

                <div>
                  <h2 className="text-xl font-extrabold text-navy-900">Scan to Download App</h2>
                  <p className="mt-1 text-xs text-text-secondary leading-relaxed max-w-xs mx-auto">
                    Point your phone camera at this QR code to download the VSolve Partner App or open directly on your mobile browser.
                  </p>
                </div>

                {/* QR Code Container with subtle warm frame */}
                <div className="relative my-2 flex items-center justify-center rounded-2xl border-2 border-line bg-surface-sunken p-4 shadow-sm">
                  <svg
                    viewBox="0 0 160 160"
                    className="h-44 w-44"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    {/* Corner Position Detection Patterns */}
                    <rect x="10" y="10" width="40" height="40" rx="8" stroke="#00112e" strokeWidth="6" />
                    <rect x="22" y="22" width="16" height="16" rx="4" fill="#00112e" />

                    <rect x="110" y="10" width="40" height="40" rx="8" stroke="#00112e" strokeWidth="6" />
                    <rect x="122" y="22" width="16" height="16" rx="4" fill="#00112e" />

                    <rect x="10" y="110" width="40" height="40" rx="8" stroke="#00112e" strokeWidth="6" />
                    <rect x="22" y="122" width="16" height="16" rx="4" fill="#00112e" />

                    {/* QR Code Dot Matrix Patterns */}
                    <rect x="58" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="74" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="90" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="58" y="32" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="74" y="32" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="90" y="32" width="8" height="8" fill="#00112e" rx="1.5" />

                    <rect x="15" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="32" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="58" y="58" width="14" height="14" fill="#ea580c" rx="3" />
                    <rect x="80" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="96" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="112" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="128" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="144" y="58" width="8" height="8" fill="#00112e" rx="1.5" />

                    <rect x="15" y="74" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="32" y="74" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="80" y="74" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="104" y="74" width="16" height="8" fill="#00112e" rx="1.5" />
                    <rect x="128" y="74" width="8" height="8" fill="#00112e" rx="1.5" />

                    <rect x="15" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="32" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="58" y="80" width="8" height="18" fill="#00112e" rx="1.5" />
                    <rect x="74" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="90" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="112" y="90" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="136" y="90" width="8" height="8" fill="#00112e" rx="1.5" />

                    <rect x="58" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="74" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="90" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="106" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="122" y="112" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="138" y="112" width="8" height="8" fill="#00112e" rx="1.5" />

                    <rect x="58" y="128" width="16" height="8" fill="#00112e" rx="1.5" />
                    <rect x="82" y="128" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="98" y="128" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="114" y="128" width="16" height="8" fill="#00112e" rx="1.5" />
                    <rect x="138" y="128" width="8" height="8" fill="#00112e" rx="1.5" />

                    <rect x="58" y="144" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="74" y="144" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="90" y="144" width="16" height="8" fill="#00112e" rx="1.5" />
                    <rect x="114" y="144" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="130" y="144" width="16" height="8" fill="#00112e" rx="1.5" />
                  </svg>
                </div>

                {/* App Store & Google Play Styled Download Badges */}
                <div className="flex w-full flex-col gap-2.5">
                  <div className="flex items-center justify-center gap-2.5 rounded-2xl bg-navy-900 px-4 py-3 text-xs font-bold text-white shadow-sm hover:bg-navy-800 transition-colors cursor-pointer">
                    <Download size={15} className="text-signal-500" />
                    <span>Download for Android (APK / Play Store)</span>
                  </div>

                  <div className="flex items-center justify-center gap-2.5 rounded-2xl border border-line bg-surface-sunken px-4 py-3 text-xs font-bold text-navy-900 shadow-xs hover:bg-surface-hover transition-colors cursor-pointer">
                    <Download size={15} className="text-text-secondary" />
                    <span>Download for iOS (App Store / TestFlight)</span>
                  </div>
                </div>

                {/* Compatibility tag */}
                <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] font-medium text-text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Supports Android 10+ and iOS 15+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
