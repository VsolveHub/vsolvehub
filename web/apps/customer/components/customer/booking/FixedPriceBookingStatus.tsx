"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Booking } from "@/lib/booking/types";
import { api } from "@/lib/query/api";
import { qk } from "@/lib/query/keys";
import { formatPrice } from "@/lib/format";
import { formatDuration } from "@/lib/bookings/commercials";

const STEPS = [
  { statuses: ["ASSIGNED"], label: "Professional assigned", icon: "user" },
  { statuses: ["PROVIDER_ARRIVING"], label: "On the way", icon: "route" },
  { statuses: ["STARTED"], label: "Service in progress", icon: "clock" },
  { statuses: ["COMPLETED"], label: "Completed", icon: "check" },
] as const;

function ClockIcon({ kind }: { kind: string }) {
  if (kind === "check") {
    return <path d="m7 12 3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />;
  }
  if (kind === "clock") {
    return (
      <>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (kind === "route") {
    return <path d="M5 17c5 0 3-10 9-10h4m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />;
  }
  return (
    <>
      <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M6 19c.7-4 2.7-6 6-6s5.3 2 6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  );
}

function formatClock(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.abs(milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

export function FixedPriceBookingStatus({ booking }: { booking: Booking }) {
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [extensionMinutes, setExtensionMinutes] = useState(30);

  useEffect(() => {
    if (booking.status !== "STARTED" || !booking.startConfirmedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [booking.status, booking.startConfirmedAt]);

  const totalDuration = (booking.durationMinutes ?? 60) + (booking.extensionMinutes ?? 0);
  const remainingMs = useMemo(() => {
    if (!booking.startConfirmedAt) return totalDuration * 60_000;
    const endAt = new Date(booking.startConfirmedAt).getTime() + totalDuration * 60_000;
    return endAt - now;
  }, [booking.startConfirmedAt, totalDuration, now]);

  const extend = useMutation({
    mutationFn: () => api.extendBooking(booking.bookingRef, extensionMinutes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.booking(booking.bookingRef) }),
  });

  const currentStep = Math.max(
    0,
    STEPS.findIndex((step) => step.statuses.includes(booking.status as never)),
  );
  const provider = booking.provider ?? booking.vendor;
  const isWorking = booking.status === "STARTED" && Boolean(booking.startConfirmedAt);
  const isExceeded = isWorking && remainingMs < 0;
  const statusLabel = STEPS[currentStep]?.label ?? "Booking confirmed";

  return (
    <main className="min-h-screen bg-slate-50">
      <section className="relative overflow-hidden border-b border-orange-100 bg-gradient-to-br from-[#fffaf5] via-[#fff7ed] to-[#ffedd5] px-4 pb-12 pt-7 sm:pt-9">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-orange-200/40 blur-3xl" />
        <div className="relative mx-auto flex max-w-5xl flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#c2410c]">
                Booking {booking.bookingRef}
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                <span className="h-2 w-2 rounded-full bg-[#ea580c]" aria-hidden="true" />
                {statusLabel}
              </span>
            </div>
            <h1 className="mt-1 font-heading text-2xl font-extrabold text-[#0b1c30] sm:text-3xl">
              {booking.service.name}
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-600">
              Follow service progress, share the start code and review every charge in one place.
            </p>
          </div>
          <Link
            href="/profile/bookings"
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-orange-200 bg-white px-5 py-2 text-sm font-bold text-[#0b1c30] shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
          >
            All bookings
          </Link>
        </div>
      </section>

      <div className="relative mx-auto -mt-6 max-w-5xl px-4 pb-10">
        <div className="grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
          <section className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="grid grid-cols-4 gap-2" aria-label="Booking progress">
                {STEPS.map((step, index) => {
                  const active = index <= currentStep;
                  return (
                    <div key={step.label} className="text-center">
                      <div
                        className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl ${
                          active ? "bg-[#0b1c30] text-white" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                          <ClockIcon kind={step.icon} />
                        </svg>
                      </div>
                      <p className={`mt-2 text-[11px] font-bold ${active ? "text-[#0b1c30]" : "text-slate-400"}`}>
                        {step.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className={`overflow-hidden rounded-3xl border p-6 sm:p-8 ${
                isExceeded
                  ? "border-amber-200 bg-amber-50"
                  : "border-blue-200 bg-gradient-to-br from-[#0b1c30] to-[#173a67] text-white"
              }`}
            >
              <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
                <div>
                  <p className={`text-xs font-black uppercase tracking-[0.16em] ${isExceeded ? "text-amber-700" : "text-blue-200"}`}>
                    {isExceeded ? "Work exceeded by" : isWorking ? "Service time remaining" : "Booked service time"}
                  </p>
                  <p className={`mt-2 font-mono text-4xl font-black tracking-tight sm:text-5xl ${isExceeded ? "text-amber-950" : "text-white"}`}>
                    {isWorking ? formatClock(remainingMs) : formatDuration(totalDuration)}
                  </p>
                  <p className={`mt-2 text-sm ${isExceeded ? "text-amber-800" : "text-blue-100"}`}>
                    {isWorking
                      ? "The clock started when your professional confirmed the start OTP."
                      : "The countdown begins only after your start OTP is confirmed."}
                  </p>
                </div>
                {booking.startOtp ? (
                  <div className="rounded-2xl bg-white/10 p-4 text-center ring-1 ring-white/20">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Start OTP</p>
                    <p className="mt-1 text-2xl font-black tracking-[0.28em] text-white">{booking.startOtp}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {isWorking ? (
              <div className="rounded-3xl border border-orange-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h2 className="font-heading text-lg font-extrabold text-[#0b1c30]">Need more time?</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Extend only with your approval. The extra charge is shown before confirmation.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {[30, 60, 90, 120].map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() => setExtensionMinutes(minutes)}
                        className={`min-h-11 cursor-pointer rounded-xl border px-3 text-sm font-black transition ${
                          extensionMinutes === minutes
                            ? "border-[#ea580c] bg-[#fff7ed] text-[#c2410c]"
                            : "border-slate-200 text-slate-600 hover:border-orange-200"
                        }`}
                      >
                        +{minutes}m
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => extend.mutate()}
                  disabled={extend.isPending}
                  className="mt-4 min-h-12 w-full cursor-pointer rounded-xl bg-[#ea580c] px-5 text-sm font-black text-white transition hover:bg-[#c2410c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {extend.isPending ? "Confirming extension…" : `Review and extend by ${extensionMinutes} minutes`}
                </button>
                {extend.error instanceof Error ? (
                  <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{extend.error.message}</p>
                ) : null}
              </div>
            ) : null}
          </section>

          <aside className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Professional</p>
              <h2 className="mt-2 text-lg font-extrabold text-[#0b1c30]">{provider?.name ?? "Being assigned"}</h2>
              {provider ? (
                <p className="mt-1 text-sm font-semibold text-slate-500">★ {provider.rating.toFixed(1)} verified professional</p>
              ) : null}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {provider?.phone ? (
                  <a href={`tel:${provider.phone}`} className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
                    Call
                  </a>
                ) : null}
                <Link href="/profile/messages" className="flex min-h-11 items-center justify-center rounded-xl bg-[#0b1c30] text-sm font-bold text-white">
                  Message
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">Price summary</p>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between"><dt>Service time</dt><dd className="font-bold">{formatDuration(totalDuration)}</dd></div>
                <div className="flex justify-between"><dt>Service charge</dt><dd className="font-bold">{formatPrice(booking.baseChargePaise ?? booking.quotedAmount)}</dd></div>
                <div className="flex justify-between"><dt>Platform fee</dt><dd className="font-bold">{formatPrice(booking.platformFeePaise ?? 0)}</dd></div>
                <div className="flex justify-between"><dt>GST on platform fee</dt><dd className="font-bold">{formatPrice(booking.taxPaise ?? 0)}</dd></div>
                <div className="border-t border-dashed border-slate-200 pt-3 flex justify-between text-base">
                  <dt className="font-extrabold text-[#0b1c30]">Total</dt>
                  <dd className="font-black text-[#ea580c]">{formatPrice(booking.finalAmountPaise ?? booking.quotedAmount)}</dd>
                </div>
              </dl>
              <Link href={`/booking/invoice/${booking.bookingRef}`} className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-blue-200 text-sm font-bold text-blue-800">
                View detailed invoice
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
