"use client";

import { useLogout } from "@vsolve/query";
import { Logo } from "@vsolve/ui";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  LogOut,
  QrCode,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Zap,
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
    <div className="flex min-h-screen w-full flex-col bg-[#020b18] text-white overflow-x-clip">
      {/* Top Desktop Navigation */}
      <header className="border-b border-white/10 bg-[#00112e]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/me/documents" className="flex items-center gap-2">
              <Logo className="h-7 w-auto text-white" />
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Registration Approved • Mobile Portal Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/me/documents"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-bold text-white transition-colors hover:bg-white/10 hover:border-white/25"
            >
              <FileCheck2 size={14} className="text-emerald-400" />
              <span>Application & Documents</span>
            </Link>

            <button
              type="button"
              onClick={() => logout.mutate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut size={14} />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-6 py-12 lg:px-8">
        <div className="grid w-full gap-8 lg:grid-cols-12 lg:items-center">
          {/* Left Column: Partner Status & Mobile Notice */}
          <div className="flex flex-col gap-6 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-amber-300">
                <Smartphone size={13} />
                Mobile-Only Partner App
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-bold text-emerald-300">
                <CheckCircle2 size={13} />
                Desktop Registration Complete
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl lg:leading-tight">
                Partner Work & Dispatches are{" "}
                <span className="bg-gradient-to-r from-amber-300 via-emerald-300 to-cyan-300 bg-clip-text text-transparent">
                  Mobile-Only
                </span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Your registration and KYC verification are completed. Daily operations—including live dispatches, real-time navigation, job acceptance, customer calls, and instant payouts—operate exclusively through the VSOLVE Partner Mobile App.
              </p>
            </div>

            {/* Verified Partner Card */}
            <div className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 font-extrabold text-white text-lg shadow-md">
                    {partnerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-white">{partnerName}</h2>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10px] font-extrabold text-emerald-300">
                        <ShieldCheck size={11} /> Verified
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{partnerPhone}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-medium text-slate-400">Trade Category</span>
                  <p className="text-xs font-bold text-amber-300">{trackLabel}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Onboarding</span>
                  <p className="text-xs font-black text-emerald-400 mt-0.5">Approved</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Documents</span>
                  <p className="text-xs font-black text-white mt-0.5">KYC Verified</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Dispatch Radar</span>
                  <p className="text-xs font-black text-cyan-400 mt-0.5">Mobile App Ready</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    href="/me/profile"
                    className="inline-flex items-center gap-2 text-xs font-bold text-emerald-300 hover:text-emerald-200 transition-colors"
                  >
                    <User size={14} />
                    <span>View Partner Profile →</span>
                  </Link>

                  <Link
                    href="/me/documents"
                    className="inline-flex items-center gap-2 text-xs font-bold text-amber-300 hover:text-amber-200 transition-colors"
                  >
                    <FileText size={14} />
                    <span>Review Registered Documents & Agreements →</span>
                  </Link>
                </div>

                <p className="text-[11px] text-slate-400">
                  Desktop view is restricted to registration, profile & documents.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Mobile App Download & QR Code */}
          <div className="flex flex-col items-center lg:col-span-5">
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-8 backdrop-blur-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
              {/* Background ambient radial */}
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl" />
              <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-amber-500/15 blur-3xl" />

              <div className="relative z-10 flex flex-col items-center text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-amber-300 border border-white/15 shadow-inner mb-4">
                  <QrCode size={24} />
                </span>

                <h3 className="text-xl font-black text-white">
                  Scan to Open on Mobile
                </h3>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed max-w-xs">
                  Scan this QR code with your phone camera to download the VSOLVE Partner App or open directly on your mobile browser.
                </p>

                {/* Styled SVG QR Code */}
                <div className="my-6 rounded-2xl border-4 border-white bg-white p-4 shadow-xl">
                  <svg
                    viewBox="0 0 160 160"
                    width="160"
                    height="160"
                    className="h-40 w-40"
                    aria-label="QR Code to open Partner Mobile App"
                  >
                    {/* Corner Position Detection Patterns */}
                    <rect x="10" y="10" width="40" height="40" fill="#00112e" rx="6" />
                    <rect x="16" y="16" width="28" height="28" fill="#ffffff" rx="4" />
                    <rect x="22" y="22" width="16" height="16" fill="#00112e" rx="2" />

                    <rect x="110" y="10" width="40" height="40" fill="#00112e" rx="6" />
                    <rect x="116" y="16" width="28" height="28" fill="#ffffff" rx="4" />
                    <rect x="122" y="22" width="16" height="16" fill="#00112e" rx="2" />

                    <rect x="10" y="110" width="40" height="40" fill="#00112e" rx="6" />
                    <rect x="16" y="116" width="28" height="28" fill="#ffffff" rx="4" />
                    <rect x="22" y="122" width="16" height="16" fill="#00112e" rx="2" />

                    {/* Data Matrix Dots simulation */}
                    <rect x="58" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="74" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="90" y="15" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="58" y="32" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="74" y="32" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="90" y="32" width="8" height="8" fill="#00112e" rx="1.5" />

                    <rect x="15" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="32" y="58" width="8" height="8" fill="#00112e" rx="1.5" />
                    <rect x="58" y="58" width="14" height="14" fill="#f59e0b" rx="3" />
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

                {/* App Store / Google Play Buttons */}
                <div className="flex w-full flex-col gap-2.5">
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-bold text-white shadow-sm">
                    <Download size={15} className="text-emerald-400" />
                    <span>Android APK / Google Play</span>
                  </div>

                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-bold text-white shadow-sm">
                    <Download size={15} className="text-sky-400" />
                    <span>iOS App Store (TestFlight)</span>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>Compatible with Android 10+ and iOS 15+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
