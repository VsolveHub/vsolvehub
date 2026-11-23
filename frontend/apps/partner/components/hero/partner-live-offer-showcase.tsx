"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Zap, Navigation, Clock, MapPin, Signal, Wifi, BatteryFull, Star, Briefcase, Wallet, Bell, User, Home as HomeIcon, type LucideIcon } from "lucide-react";
import { inr } from "@/lib/format";

type DemoOffer = {
  icon: LucideIcon;
  title: string;
  area: string;
  fare: number;
  surge: number;
  travelKm: number;
  etaMin: number;
  durationMin: number;
  drop: string;
};

const OFFERS: DemoOffer[] = [
  {
    icon: Sparkles,
    title: "AC Deep Cleaning · 2 Units",
    area: "Kukatpally, Hyderabad",
    fare: 850,
    surge: 1.2,
    travelKm: 7.2,
    etaMin: 16,
    durationMin: 55,
    drop: "Flat 402, Sunshine Apartments, KPHB",
  },
  {
    icon: Zap,
    title: "Electrical Repair · On-site",
    area: "Gachibowli, Hyderabad",
    fare: 1450,
    surge: 1,
    travelKm: 4.2,
    etaMin: 11,
    durationMin: 50,
    drop: "24, Green Valley Estate, Phase 3",
  },
  {
    icon: Navigation,
    title: "Airport Drop · Sedan",
    area: "Jubilee Hills, Hyderabad",
    fare: 640,
    surge: 1.4,
    travelKm: 3.1,
    etaMin: 6,
    durationMin: 38,
    drop: "RGIA Terminal 1, Shamshabad",
  },
];

const OFFER_WINDOW = 30;

export function PartnerLiveOfferShowcase() {
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(OFFER_WINDOW);
  const [isPaused, setIsPaused] = useState(false);
  const showcaseRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsPaused(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    if (showcaseRef.current) observer.observe(showcaseRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isPaused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          setIndex((i) => (i + 1) % OFFERS.length);
          return OFFER_WINDOW;
        }
        return prev - 1;
      });
    }, 300);
    return () => clearInterval(id);
  }, [isPaused]);

  const offer = OFFERS[index]!;
  const Icon = offer.icon;

  return (
    <section ref={showcaseRef} className="relative overflow-hidden bg-surface py-20 border-b border-line">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Description */}
          <div className="lg:col-span-6 space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-signal-50 px-3.5 py-1 text-xs font-extrabold text-signal-700 border border-signal-200 shadow-xs">
              <Zap className="h-3.5 w-3.5" /> In-App Live Dispatch
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
              See How You Receive Jobs & Instant Payouts
            </h2>
            <p className="text-base text-text-secondary leading-relaxed">
              When a customer requests a service in your area, your phone rings with a live offer card showing the exact address, distance, estimated duration, and guaranteed fare before you accept.
            </p>
            
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 font-bold text-xs mt-0.5">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy-900">Zero Guesswork Pricing</h4>
                  <p className="text-xs text-text-secondary">Know exactly what you earn before accepting. Surge fares and travel allowances are calculated upfront.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 font-bold text-xs mt-0.5">
                  ✓
                </div>
                <div>
                  <h4 className="text-sm font-bold text-navy-900">Direct Navigation & Contact</h4>
                  <p className="text-xs text-text-secondary">One-tap turn-by-turn Google Maps routing to the customer doorstep and direct in-app masked calling.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Phone Live Dispatch Mockup */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="vsh-phone-float">
              <div
                aria-hidden="true"
                className="relative aspect-[300/640] w-[275px] shrink-0 rounded-[48px] border-[10px] border-[#14122e] bg-[#14122e] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.35),0_12px_24px_-10px_rgba(0,0,0,0.25)] sm:w-[290px]"
              >
                {/* Dynamic island */}
                <div className="absolute left-1/2 top-2.5 z-30 h-[20px] w-[80px] -translate-x-1/2 rounded-full bg-[#14122e]" />

                {/* Screen */}
                <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[38px] bg-slate-50 text-slate-900">
                  {/* Phone Status bar */}
                  <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[10px] font-semibold text-slate-700">
                    <span className="tabular-nums font-bold">9:41</span>
                    <span className="flex items-center gap-1.5">
                      <Signal className="h-3 w-3" />
                      <Wifi className="h-3 w-3" />
                      <BatteryFull className="h-3.5 w-3.5" />
                    </span>
                  </div>

                  {/* In-App Header */}
                  <div className="flex items-center justify-between bg-white px-3.5 py-2 border-b border-slate-100 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="grid h-7 w-7 place-items-center rounded-full bg-navy-900 text-[11px] font-bold text-white">
                        S
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-slate-500 leading-none">Partner</p>
                        <p className="text-[11px] font-extrabold text-navy-900 leading-tight">Suresh V.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 border border-emerald-200 text-[9px] font-extrabold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>ON DUTY</span>
                    </div>

                    <span className="flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 border border-amber-200">
                      <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> 4.9
                    </span>
                  </div>

                  {/* Dashboard Scrollable Area */}
                  <div className="flex flex-1 flex-col overflow-hidden px-3 pt-2 pb-1 gap-2">
                    {/* Today's Earnings Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-[#00112e] p-3 text-white shadow-md">
                      <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 bg-signal-500/15 rounded-full blur-xl" />
                      <div className="relative z-10 flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Today&apos;s Earnings</p>
                          <p className="text-[20px] font-black tracking-tight text-white tabular-nums leading-tight">
                            ₹3,450
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400 border border-white/10">
                            4 Jobs Done
                          </span>
                          <span className="text-[8px] text-slate-400">Weekly settlement</span>
                        </div>
                      </div>
                    </div>

                    {/* Live Job Offer Stack Card */}
                    <div className="flex flex-1 flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-md">
                      {/* Header + Timer */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                        <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500" /> LIVE OFFER
                        </span>
                        <div className="flex items-center gap-1 text-[10px] font-extrabold text-slate-800 tabular-nums">
                          <Clock className="h-3 w-3 text-signal-600" />
                          <span>{left}s left</span>
                        </div>
                      </div>

                      {/* Offer details */}
                      <div className="mt-2 flex items-start gap-2">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-signal-50 text-signal-700 border border-signal-200">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-slate-900 leading-tight">{offer.title}</p>
                          <p className="truncate text-[9px] text-slate-500 mt-0.5">{offer.area}</p>
                        </div>
                        <span className="shrink-0 text-right">
                          <span className="text-xs font-extrabold text-slate-900 tabular-nums block">{inr(offer.fare)}</span>
                          <span className="text-[8px] text-slate-500">~{offer.durationMin}m</span>
                        </span>
                      </div>

                      {/* Stats pills */}
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <div className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 border border-slate-100 text-[9px]">
                          <Navigation className="h-2.5 w-2.5 text-slate-400" />
                          <span className="font-bold text-slate-700">{offer.travelKm} km away</span>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 border border-slate-100 text-[9px]">
                          <Clock className="h-2.5 w-2.5 text-slate-400" />
                          <span className="font-bold text-slate-700">{offer.etaMin} min ETA</span>
                        </div>
                      </div>

                      {/* Location strip */}
                      <div className="mt-2 flex items-start gap-1 rounded-lg bg-slate-50 p-1.5 text-[8.5px] text-slate-600 border border-slate-100">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-signal-600" />
                        <p className="truncate">{offer.drop}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="mt-auto grid grid-cols-3 gap-1.5 pt-2">
                        <div className="rounded-xl border border-slate-200 bg-white py-1.5 text-center text-[10px] font-bold text-slate-600">
                          Decline
                        </div>
                        <div className="col-span-2 rounded-xl bg-emerald-600 py-1.5 text-center text-[10px] font-extrabold text-white shadow-md">
                          Accept · {inr(offer.fare)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Tab Bar */}
                  <div className="flex items-center justify-around border-t border-slate-200 bg-white px-2 py-2 shrink-0 shadow-xs">
                    <div className="flex flex-col items-center gap-0.5 text-signal-600">
                      <Briefcase className="h-3.5 w-3.5" />
                      <span className="text-[8px] font-bold">Work</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 text-slate-400">
                      <Wallet className="h-3.5 w-3.5" />
                      <span className="text-[8px] font-medium">Money</span>
                    </div>
                    <div className="-mt-4 flex h-8 w-8 items-center justify-center rounded-full bg-signal-500 text-[#00112e] shadow-md shadow-signal-500/40">
                      <HomeIcon className="h-4 w-4 fill-[#00112e]" />
                    </div>
                    <div className="flex flex-col items-center gap-0.5 text-slate-400">
                      <Bell className="h-3.5 w-3.5" />
                      <span className="text-[8px] font-medium">Alerts</span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 text-slate-400">
                      <User className="h-3.5 w-3.5" />
                      <span className="text-[8px] font-medium">Me</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
