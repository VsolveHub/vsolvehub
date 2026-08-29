"use client";

import { Logo, buttonStyles } from "@vsolve/ui";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Money } from "@/features/checkout/view/money";
import { claimViewport } from "@/lib/focus-mode";
import type { BookingGroup } from "../queries";
import { heldUnitCount } from "./group-status";
import searchAnimationData from "./search-lottie.json";

const LottiePlayer = dynamic(
  () => import("lottie-react").then((mod) => mod.Lottie),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center size-36 animate-pulse">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-14 text-orange-600"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </div>
    ),
  },
);

interface FullScreenPartnerSearchProps {
  group: BookingGroup;
  onDismiss?: () => void;
}

const SEARCH_STEPS = [
  {
    title: "Finding your V Solve Hub partner…",
    desc: "Broadcasting service request to certified technicians nearby",
    step: 1,
  },
  {
    title: "Searching nearby professionals…",
    desc: "Scanning top-rated partners within 5 km of your address",
    step: 2,
  },
  {
    title: "Checking schedule & availability…",
    desc: "Confirming arrival window and verified equipment",
    step: 3,
  },
  {
    title: "Matching the best professional for you…",
    desc: "Selecting the highest-rated professional with 100% guarantee",
    step: 4,
  },
];

const VERIFICATION_CHECKS = [
  { label: "Background & Police Verification", status: "Verified" },
  { label: "Skill & Quality Certifications", status: "Checked" },
  { label: "Minimum 4.8★ Rating Filter", status: "Applied" },
  { label: "Tools & Equipment Readiness", status: "Confirmed" },
];

export function FullScreenPartnerSearch({
  group,
}: FullScreenPartnerSearchProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const held = heldUnitCount(group);
  const total = group.units.length;

  const isAwaitingPayment =
    group.recovery_action === "PAYMENT_REQUIRED" ||
    group.status === "PAYMENT_PENDING" ||
    (group.status === "PARTIALLY_HELD" && held === total && total > 0);

  useEffect(() => {
    return claimViewport();
  }, []);

  // Cycle searching messages while matching
  useEffect(() => {
    if (isAwaitingPayment) return;
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % SEARCH_STEPS.length);
    }, 2800);
    return () => clearInterval(interval);
  }, [isAwaitingPayment]);

  const currency = group.units[0]?.total?.currency ?? "INR";
  const totalPaise = group.units.reduce((acc, u) => acc + (u.total?.amount_paise ?? 0), 0);
  const itemChargesPaise = group.units.reduce(
    (acc, u) => acc + u.lines.reduce((lAcc, l) => lAcc + (l.amount?.amount_paise ?? 0), 0),
    0,
  );
  const feeOrTaxPaise = Math.max(0, totalPaise - itemChargesPaise);

  const totalMoney = { amount_paise: totalPaise, currency };
  const feeOrTaxMoney = { amount_paise: feeOrTaxPaise, currency };

  const currentStep = SEARCH_STEPS[stepIndex] ?? SEARCH_STEPS[0];
  const serviceNames = group.units
    .flatMap((u) => u.lines.map((l) => l.label))
    .filter(Boolean)
    .join(", ");

  return (
    <div
      role="region"
      aria-label="Finding your professional"
      className="fixed inset-0 z-[100] flex flex-col justify-between overflow-y-auto bg-white p-4 pb-10 sm:p-6 lg:p-8 animate-fade-in"
    >
      {/* Soft background ambient dot matrix pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: "radial-gradient(#0f172a 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Top Bar: Brand & Matching Indicator */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Logo className="shrink-0" />
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
              isAwaitingPayment
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-orange-50 text-orange-700 border-orange-200"
            }`}>
              <span className={`size-2 rounded-full ${
                isAwaitingPayment ? "bg-emerald-500" : "bg-orange-500 animate-pulse"
              }`} />
              {isAwaitingPayment ? "Pros Held & Ready" : "Live Matching"}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isAwaitingPayment
              ? "All professionals confirmed · Complete payment to begin"
              : "Broadcasting request to nearby verified network"}
          </p>
        </div>
      </header>

      {/* 2-Column Balanced Stage */}
      <main className="relative z-10 my-auto max-w-5xl mx-auto w-full py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: Lottie Animation / Match Secured Status */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left">
            {isAwaitingPayment ? (
              <>
                <div className="size-20 rounded-full bg-emerald-500 text-white shadow-lg flex items-center justify-center border-4 border-white mb-5 animate-scale-in">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-10 text-white animate-pulse"
                    aria-hidden
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100/80 border border-emerald-200 px-3.5 py-1 text-xs font-bold text-emerald-800 mb-3">
                  <span className="size-2 rounded-full bg-emerald-600" />
                  Professionals Found & Held
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Please make payment to complete the process
                </h2>

                <p className="text-sm text-slate-600 mt-2 max-w-md">
                  All visits have been matched with top-rated certified professionals. Pay now to lock in your booking and unlock technician details.
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center lg:items-start w-full">
                {/* Lottie Search Animation Arena */}
                <div className="relative size-60 sm:size-68 flex items-center justify-center mb-6 self-center lg:self-start">
                  <span className="absolute inset-0 rounded-full border border-orange-200/60 bg-orange-100/20 animate-ping [animation-duration:3.2s]" />
                  <span className="absolute inset-6 rounded-full border border-orange-200 bg-orange-50/60 animate-pulse [animation-duration:2.2s]" />

                  <div className="relative z-10 size-52 sm:size-56 rounded-full border-2 border-orange-200/90 bg-white shadow-xl flex items-center justify-center overflow-hidden">
                    <div className="relative z-20 flex items-center justify-center w-full h-full p-2">
                      <LottiePlayer
                        src={searchAnimationData}
                        loop
                        autoplay
                        className="w-full h-full max-w-[200px] max-h-[200px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 rounded-full bg-orange-100/80 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-800 mb-2">
                  <span className="size-2 rounded-full bg-orange-600 animate-ping" />
                  Live partner search in progress
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {currentStep.title}
                </h2>

                <p className="text-sm text-slate-600 mt-1 max-w-md">
                  {currentStep.desc}
                </p>

                {/* Step Progress Dots */}
                <div className="flex items-center gap-2 pt-3">
                  {SEARCH_STEPS.map((s, idx) => (
                    <span
                      key={s.step}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        idx === stepIndex
                          ? "w-8 bg-orange-600"
                          : idx < stepIndex
                            ? "w-3 bg-emerald-500"
                            : "w-3 bg-slate-200"
                      }`}
                    />
                  ))}
                </div>

                {total > 1 ? (
                  <p className="text-xs text-slate-500 pt-2">
                    <span className="font-semibold text-slate-700">{held} / {total}</span> partner slots reserved
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* Right Column: Safety & Quality Trust Words (While Searching) / Payment Summary Card (When Ready) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {isAwaitingPayment ? (
              /* Payment Summary Card when Pay Now is ready */
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-md">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Payment Summary</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {group.units.length} {group.units.length === 1 ? "visit" : "visits"} held & ready
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                    Awaiting Payment
                  </span>
                </div>

                {/* Booked Services Details */}
                <div className="mt-3 space-y-2 border-b border-slate-100 pb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Booked Services
                  </p>
                  {group.units.flatMap((u) => u.lines).map((line) => (
                    <div key={line.id} className="flex justify-between items-center text-xs text-slate-700">
                      <span>
                        {line.label}
                        {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                      </span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        <Money value={line.amount} />
                      </span>
                    </div>
                  ))}

                  {feeOrTaxPaise > 0 ? (
                    <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
                      <span>Taxes & platform fee</span>
                      <span className="font-semibold text-slate-900 tabular-nums">
                        <Money value={feeOrTaxMoney} />
                      </span>
                    </div>
                  ) : null}
                </div>

                {/* Total Payable */}
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Payable</span>
                  <span className="text-xl font-extrabold text-slate-900">
                    <Money value={totalMoney} />
                  </span>
                </div>

                {/* Pay Now CTA */}
                <div className="mt-4">
                  <Link
                    href={`/bookings/${group.id}/pay`}
                    className={buttonStyles({
                      className: "w-full justify-center h-11 text-sm font-bold shadow-md bg-orange-600 hover:bg-orange-700",
                    })}
                  >
                    Pay Now →
                  </Link>
                </div>

                {/* Trust & Guarantee */}
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold text-xs">🔒</span>
                    <span>256-bit Razorpay secured payment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-600 font-bold text-xs">🛡️</span>
                    <span>100% money back guarantee</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Safety & Quality Trust Words while Searching */
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Safety & Quality Standards
                  </span>
                  <span className="text-emerald-700 bg-emerald-50 text-[11px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                    100% Guaranteed
                  </span>
                </div>

                <div className="space-y-2.5">
                  {VERIFICATION_CHECKS.map((check) => (
                    <div
                      key={check.label}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                    >
                      <span className="text-xs font-medium text-slate-700">
                        {check.label}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                        ✓ {check.status}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-orange-50/70 border border-orange-200/60 p-3 text-[11px] text-orange-900 flex items-center gap-2 mt-2">
                  <span className="text-sm">🔒</span>
                  <span>Partner contact details unlock immediately upon payment.</span>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Clean Bottom Booking Summary Card */}
      <footer className="relative z-20 max-w-5xl mx-auto w-full">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            <div className="size-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-lg shrink-0">
              📍
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">
                {serviceNames || "Service booking"}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {group.units.length} {group.units.length === 1 ? "visit" : "visits"} · Verified partner matching
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-slate-500 w-full sm:w-auto justify-between sm:justify-end">
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>100% money back guarantee</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-600 font-bold">✓</span>
              <span>Background checked</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
