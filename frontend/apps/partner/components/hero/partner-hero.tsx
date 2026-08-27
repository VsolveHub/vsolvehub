"use client";

import { useState, useEffect, useRef } from "react";
import {
  Phone,
  MapPin,
  Navigation,
  Clock,
  Sparkles,
  Zap,
  Wifi,
  Signal,
  BatteryFull,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";

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
const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

function StatPill({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-2">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate text-[11px] font-bold text-ink-900">{value}</p>
      </div>
    </div>
  );
}

export function PartnerHero() {
  const router = useRouter();
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
  const pct = (left / OFFER_WINDOW) * 100;
  const ringColor = left <= 10 ? "#dc2626" : "#5b50e6";

  return (
    <section
      ref={heroRef}
      className="relative flex items-center overflow-x-clip bg-ink-900 py-14 text-white lg:min-h-[540px] lg:py-8"
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
              cooldown and the session all live — a second OTP entry point on a
              marketing page is a second thing to keep correct. */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              router.push("/apply");
            }}
            className="vsh-hero-slideup flex w-full max-w-[440px] flex-col gap-2"
            style={{ animationDelay: "320ms" }}
          >
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <label htmlFor="hero-phone" className="sr-only">
                  Mobile number
                </label>
                <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  id="hero-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="Mobile number"
                  required
                  className="h-[52px] w-full rounded-[10px] bg-white pl-[44px] pr-4 font-sans text-ink-900 transition-all placeholder:text-gray-400 focus:shadow-[0_0_12px_rgba(249,115,22,0.3)] focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50"
                />
              </div>
              <button
                type="submit"
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] bg-accent-500 px-6 font-semibold text-white transition-all hover:-translate-y-[1px] hover:bg-accent-600 md:w-auto"
              >
                Start signup
              </button>
            </div>

            <p
              className="vsh-hero-slideup text-[13px] text-white/50"
              style={{ animationDelay: "400ms" }}
            >
              We&apos;ll send an OTP. Signup takes 5 minutes.
            </p>
          </form>
        </div>

        {/* Phone visual column — a live preview of the real job-offer screen */}
        <div
          className="vsh-hero-slideup flex w-full justify-center lg:w-[45%] lg:justify-center"
          style={{ animationDelay: "480ms" }}
        >
          {/* Float wrapper: idle bob only, kept separate so it never fights the frame tilt */}
          <div className="vsh-phone-float">
            <div
              aria-hidden="true"
              className="relative aspect-[300/620] w-[256px] shrink-0 rounded-[46px] border-[10px] border-[#14122e] bg-[#14122e] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.55),0_12px_24px_-10px_rgba(0,0,0,0.5)] [transform:rotate(4deg)] sm:w-[264px] lg:w-[272px]"
            >
              {/* Dynamic island */}
              <div className="absolute left-1/2 top-2 z-30 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[#14122e]" />

              {/* Screen */}
              <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[36px] bg-surface-muted">
                {/* Status bar */}
                <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-ink-900/80">
                  <span className="tabular-nums">9:41</span>
                  <span className="flex items-center gap-1.5">
                    <Signal className="h-3 w-3" />
                    <Wifi className="h-3 w-3" />
                    <BatteryFull className="h-3.5 w-3.5" />
                  </span>
                </div>

                {/* App header */}
                <div className="flex items-center justify-between px-4 pb-2 pt-1">
                  <div className="flex items-center gap-2.5">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white">
                      S
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-500">Welcome back</p>
                      <p className="text-[13px] font-bold text-ink-900">Suresh V.</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-ink-900 shadow-sm">
                    <Star className="h-3 w-3 fill-accent-400 text-accent-400" /> 4.9
                  </span>
                </div>

                {/* Offer body */}
                <div className="flex flex-1 flex-col px-4 pb-5 pt-1">
                  {/* Status + countdown */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-700">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> NEW JOB OFFER
                    </span>
                    <div className="relative h-10 w-10">
                      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
                        <circle cx="20" cy="20" r={RING_R} fill="none" stroke="#e8e6f0" strokeWidth="4" />
                        <circle
                          cx="20"
                          cy="20"
                          r={RING_R}
                          fill="none"
                          stroke={ringColor}
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={RING_C}
                          strokeDashoffset={RING_C - (pct / 100) * RING_C}
                          style={{ transition: "stroke-dashoffset 300ms linear, stroke 300ms ease" }}
                        />
                      </svg>
                      <span className="absolute inset-0 grid place-items-center text-xs font-bold tabular-nums text-ink-900">
                        {left}
                      </span>
                    </div>
                  </div>

                  {/* Offer card */}
                  <div
                    key={index}
                    className="vsh-slideup overflow-hidden rounded-3xl border border-border bg-white shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-2 bg-gradient-to-br from-brand-600 to-brand-900 p-4 text-white">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold leading-tight">{offer.title}</p>
                          <p className="truncate text-[10px] text-white/70">{offer.area}</p>
                        </div>
                      </div>
                      {offer.surge > 1 && (
                        <span className="shrink-0 rounded-full bg-accent-500 px-2 py-0.5 text-[10px] font-bold text-ink-900">
                          {offer.surge}× surge
                        </span>
                      )}
                    </div>

                    <div className="p-4">
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">You earn</p>
                          <p className="text-[22px] font-bold leading-none tabular-nums text-ink-900">
                            {inr(offer.fare)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Duration</p>
                          <p className="text-[13px] font-bold text-ink-900">~{offer.durationMin}m</p>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        <StatPill icon={Navigation} label="Travel" value={`${offer.travelKm} km`} />
                        <StatPill icon={Clock} label="Arrive in" value={`${offer.etaMin} min`} />
                      </div>

                      <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-muted p-2.5">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        <p className="text-[11px] leading-snug text-gray-600">{offer.drop}</p>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-auto grid grid-cols-3 gap-2.5 pt-4">
                    <div className="rounded-xl border border-border bg-white py-3 text-center text-xs font-semibold text-gray-600">
                      Decline
                    </div>
                    <div className="col-span-2 rounded-xl bg-green-600 py-3 text-center text-xs font-bold text-white shadow-lg">
                      Accept · {inr(offer.fare)}
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
