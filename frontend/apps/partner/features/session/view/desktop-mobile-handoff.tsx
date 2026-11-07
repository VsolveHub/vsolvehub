"use client";

import { useLogout } from "@vsolve/query";
import { Logo, useT } from "@vsolve/ui";
import {
  CheckCircle2,
  FileCheck2,
  LogOut,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import type { Schemas } from "@vsolve/api-client";
import { trackLabelKey } from "@/features/application/model/status";
import { getApiClient } from "@/lib/api/browser";
import { SITE_URL } from "@/lib/site";

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
  const t = useT();
  const logout = useLogout(getApiClient());
  const partnerName = name || application?.display_name || "Partner";
  const partnerPhone = phone || "Registered Phone";
  const track = application?.track;

  const trackLabel = t(trackLabelKey(track));

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
                You are approved{" "}
                <span className="block text-2xl font-bold sm:text-3xl lg:text-4xl text-signal-500 mt-1">
                  Continue on your phone
                </span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
                Jobs, navigation and payouts run on your phone. On a computer you can see your
                profile and documents.
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

          {/* Right Column: where to continue */}
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
                  <h2 className="text-xl font-extrabold text-navy-900">Open this on your phone</h2>
                  <p className="mt-1 text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                    Open this address in the browser on your phone and sign in with the same mobile number.
                  </p>
                </div>

                <p className="w-full rounded-2xl border border-line bg-surface-sunken px-4 py-3 text-base font-bold text-navy-900 break-all">
                  {SITE_URL.replace(/^https?:\/\//, "")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
