"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, MapPin, Navigation, Clock, Sparkles, Zap, Wifi, Signal, BatteryFull, Star, Briefcase, Wallet, Bell, User, Home as HomeIcon, type LucideIcon } from "lucide-react";

import { useRouter } from "next/navigation";
import Link from "next/link";

import { useCurrentSession } from "@vsolve/query";
import { getApiClient } from "@/lib/api/browser";
import { inr } from "@/lib/format";

/**
 * Marketing preview of the real in-app "New job offer" screen partners see
 * (mirrors app/dashboard/_live/OfferScreen.tsx). Static demo data only.
 */
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

const OFFER_WINDOW = 30; // seconds — matches the real offer countdown

function capNationalPhoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}


export function PartnerHero() {
  const router = useRouter();
  const session = useCurrentSession(getApiClient());
  const activeUser = session.data?.user ?? null;
  const activePhoneDigits = activeUser?.phone_number
    ? activeUser.phone_number.replace(/\D/g, "").slice(-10)
    : null;

  const [phone, setPhone] = useState("");
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(OFFER_WINDOW);
  const [isPaused, setIsPaused] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  // Pause the loop when the hero scrolls out of view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsPaused(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    if (heroRef.current) observer.observe(heroRef.current);
    return () => observer.disconnect();
  }, []);

  // Tick the countdown; advance to the next offer when it runs out.
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
    }, 300); // ~9s per offer — visibly live without dragging
    return () => clearInterval(id);
  }, [isPaused]);

  const offer = OFFERS[index]!;
  const Icon = offer.icon;

  return (
    <section
      id="hero"
      ref={heroRef}
      className="relative flex items-center overflow-x-clip bg-[#00112e] pt-24 pb-14 sm:pt-32 sm:pb-20 text-white lg:min-h-[580px]"
    >
      {/* Background layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="vsh-aurora-drift absolute right-0 top-0 h-[800px] w-[800px] -translate-y-1/4 translate-x-1/4 opacity-60 mix-blend-screen">
          <div className="absolute inset-0 rounded-full bg-[var(--color-aurora-1)] opacity-20 blur-[100px]" />
          <div className="absolute inset-20 rounded-full bg-[var(--color-aurora-2)] opacity-10 blur-[120px]" />
        </div>
        <div
          className="absolute inset-0 h-full w-full opacity-[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-12 px-5 lg:flex-row lg:gap-8">
        {/* Text column */}
        <div className="z-10 flex w-full flex-col gap-6 lg:w-[55%]">
          <div className="flex flex-col gap-6">
            <span
              className="vsh-hero-slideup text-[13px] font-semibold uppercase tracking-[0.08em] text-accent-400"
              style={{ animationDelay: "0ms" }}
            >
              Free to join
            </span>
            <h1 className="flex flex-col text-4xl font-[800] leading-[1.05] tracking-[-0.02em] lg:text-[64px]">
              <span className="vsh-hero-slideup text-white" style={{ animationDelay: "80ms" }}>
                Your skill. Their doorstep.
              </span>
              <span className="vsh-hero-slideup text-accent-500" style={{ animationDelay: "160ms" }}>
                Paid instantly.
              </span>
            </h1>
            <p
              className="vsh-hero-slideup max-w-[440px] text-[17px] leading-[1.6] text-white/72"
              style={{ animationDelay: "240ms" }}
            >
              Join 5,000+ professionals across Telangana. Get local jobs and weekly payouts.
            </p>
          </div>

          {/* Sends people to the real signup rather than authenticating here.
              Login is one screen, inside `/apply`, where the code, the resend
              cooldown and the session all live. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const rawPhone = capNationalPhoneDigits(phone);
              if (rawPhone.length >= 10) {
                // If already signed in with this exact phone, go directly to their dashboard
                if (activePhoneDigits && activePhoneDigits === rawPhone) {
                  router.push("/home");
                  return;
                }
                // If signed in with a DIFFERENT number, take to login to switch accounts
                if (activePhoneDigits && activePhoneDigits !== rawPhone) {
                  router.push(`/login?phone=${encodeURIComponent(rawPhone)}&switch=true`);
                  return;
                }
                // If not signed in, take to login to verify OTP and prefill the phone
                router.push(`/login?phone=${encodeURIComponent(rawPhone)}`);
              } else {
                router.push(activePhoneDigits ? "/home" : "/login");
              }
            }}
            className="vsh-hero-slideup flex w-full max-w-[460px] flex-col gap-2"
            style={{ animationDelay: "320ms" }}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <label htmlFor="hero-phone" className="sr-only">
                  Mobile number
                </label>
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-sm font-bold text-gray-500">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <span>+91</span>
                </div>
                <input
                  id="hero-phone"
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="tel-national"
                  placeholder="Enter 10-digit number"
                  value={phone}
                  onChange={(event) => setPhone(capNationalPhoneDigits(event.target.value))}
                  className="h-[52px] w-full rounded-control border border-warm-300 bg-white pl-[72px] pr-4 font-sans text-base font-semibold text-ink-900 transition-all placeholder:text-gray-400 focus:border-signal-500 focus:outline-none focus:ring-2 focus:ring-signal-500 disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-control bg-action px-6 text-base font-bold text-action-text shadow-md transition-all hover:bg-action-hover active:bg-action-active sm:w-auto shrink-0"
              >
                Apply Now
              </button>
            </div>

            <div className="flex items-center gap-2 text-[13px] text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-success-text" />
              <span>We&apos;ll send an OTP. Signup takes only 5 minutes.</span>
            </div>

            {/* Already registered sign-in shortcut */}
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2.5 text-xs text-white">
              <span className="text-white/80">Already registered as a Partner?</span>
              {/*
                "Sign In", not "Click Here to Sign In". The label is read on its
                own out of context by a screen reader's link list, where "Click
                Here" names nothing — and most people meeting this hero are on a
                phone, not clicking. `min-h-11` makes it a real tap target; the
                pill keeps its size because the text was already centred.
              */}
              <Link
                href="/login"
                className="inline-flex min-h-11 items-center rounded-full bg-white px-3.5 py-1 text-xs font-extrabold text-[#00112e] shadow-sm hover:bg-amber-300 transition-all hover:scale-105 active:scale-95"
              >
                <span>Sign In</span>
              </Link>
            </div>
          </form>
        </div>

        {/* Phone visual column — real post-login partner workspace preview */}
        <div
          className="vsh-hero-slideup flex w-full justify-center lg:w-[45%] lg:justify-center"
          style={{ animationDelay: "480ms" }}
        >
          {/* Float wrapper: idle bob only, kept separate so it never fights the frame tilt */}
          <div className="vsh-phone-float">
            <div
              aria-hidden="true"
              className="relative aspect-[300/640] w-[270px] shrink-0 rounded-[48px] border-[10px] border-[#14122e] bg-[#14122e] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.55),0_12px_24px_-10px_rgba(0,0,0,0.5)] [transform:rotate(3deg)] sm:w-[285px] lg:w-[295px]"
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

                  {/* Presence Status Toggle */}
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

                {/* Real In-App Bottom Tab Bar */}
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
    </section>
  );
}
