"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Gift,
  Sparkles,
  Snowflake,
  Wrench,
  Check,
} from "lucide-react";

import { RemoteImage } from "@/components/remote-image";
import { Logo } from "@vsolve/ui";
import type { HeroSlide } from "./hero-slides";
import { DiwaliSceneSvg } from "./diwali-scene-svg";

interface HeroCarouselProps {
  slides: HeroSlide[];
  variant?: "desktop" | "mobile" | "both";
}

const DESKTOP_INTERVAL_MS = 5500;
const MOBILE_INTERVAL_MS = 5000;
const TICK_MS = 50;

export function HeroCarousel({ slides, variant = "both" }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mobileIndex, setMobileIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  const desktopHoverRef = useRef(false);
  const desktopFocusRef = useRef(false);
  const mobileHoldingRef = useRef(false);
  const mobileHoverRef = useRef(false);
  const elapsedRef = useRef(0);
  const mobileElapsedRef = useRef(0);

  const mobileScrollContainerRef = useRef<HTMLDivElement>(null);
  const isReducedMotionRef = useRef(false);

  const totalSlides = slides.length;
  const currentSlide = slides[currentIndex] ?? slides[0];

  // Helper to switch desktop slide with short text fade
  const goToDesktopSlide = useCallback(
    (index: number) => {
      if (totalSlides === 0) return;
      const nextIndex = (index + totalSlides) % totalSlides;
      elapsedRef.current = 0;
      setProgressPercent(0);

      if (isReducedMotionRef.current) {
        setCurrentIndex(nextIndex);
        return;
      }

      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(nextIndex);
        setIsTransitioning(false);
      }, 220);
    },
    [totalSlides]
  );

  // Helper to scroll mobile carousel
  const goToMobileSlide = useCallback((index: number) => {
    const container = mobileScrollContainerRef.current;
    if (!container || !container.children[0]) return;
    const firstSlide = container.children[0] as HTMLElement;
    const step = firstSlide.offsetWidth + 10;
    container.scrollTo({
      left: index * step,
      behavior: isReducedMotionRef.current ? "auto" : "smooth",
    });
  }, []);

  // Sync mobile scroll position to active dot
  const handleMobileScroll = useCallback(() => {
    const container = mobileScrollContainerRef.current;
    if (!container || !container.children[0]) return;
    const firstSlide = container.children[0] as HTMLElement;
    const step = firstSlide.offsetWidth + 10;
    const computedIndex = Math.max(
      0,
      Math.min(totalSlides - 1, Math.round(container.scrollLeft / step))
    );
    if (computedIndex !== mobileIndex) {
      setMobileIndex(computedIndex);
      mobileElapsedRef.current = 0;
    }
  }, [mobileIndex, totalSlides]);

  // Check reduced motion once on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      isReducedMotionRef.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }
  }, []);

  // Desktop timer & progress bar tick
  useEffect(() => {
    if (totalSlides <= 1) return;

    const interval = setInterval(() => {
      if (isReducedMotionRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (desktopHoverRef.current || desktopFocusRef.current) return;

      elapsedRef.current += TICK_MS;
      const percent = Math.min(100, (elapsedRef.current / DESKTOP_INTERVAL_MS) * 100);
      setProgressPercent(percent);

      if (elapsedRef.current >= DESKTOP_INTERVAL_MS) {
        goToDesktopSlide(currentIndex + 1);
      }
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [currentIndex, goToDesktopSlide, totalSlides]);

  // Mobile autoplay timer
  useEffect(() => {
    if (totalSlides <= 1) return;

    const interval = setInterval(() => {
      if (isReducedMotionRef.current) return;
      if (typeof document !== "undefined" && document.hidden) return;
      if (mobileHoldingRef.current || mobileHoverRef.current) return;

      mobileElapsedRef.current += 100;
      if (mobileElapsedRef.current >= MOBILE_INTERVAL_MS) {
        mobileElapsedRef.current = 0;
        const nextIndex = mobileIndex >= totalSlides - 1 ? 0 : mobileIndex + 1;
        goToMobileSlide(nextIndex);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [goToMobileSlide, mobileIndex, totalSlides]);

  if (totalSlides === 0) return null;

  return (
    <>
      <style>{`
        @keyframes kenBurnsSlow {
          from {
            transform: scale(1);
          }
          to {
            transform: scale(1.06);
          }
        }
        .ken-burns-active {
          animation: kenBurnsSlow 6s ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .ken-burns-active {
            animation: none !important;
          }
        }
      `}</style>

      {/* ============================================================ */}
      {/* DESKTOP LAYOUT (768px and up)                                 */}
      {/* ============================================================ */}
      {variant !== "mobile" && (
        <div className="hidden md:block">
          <section
            className="relative min-h-[566px] w-full pt-4"
            aria-roledescription="carousel"
            aria-label="Featured services"
            onMouseEnter={() => {
              desktopHoverRef.current = true;
            }}
            onMouseLeave={() => {
              desktopHoverRef.current = false;
            }}
            onFocusCapture={() => {
              desktopFocusRef.current = true;
            }}
            onBlurCapture={() => {
              desktopFocusRef.current = false;
            }}
          >
            {/* Floating Vetted Badge (Rotates with active slide) */}
            <div className="absolute top-0 right-[10%] z-20 flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-bold text-navy-900 shadow-xs">
              <span className="flex size-5 items-center justify-center rounded-full bg-[#fdf3ec] text-[#F97316]">
                <Check className="size-3.5 stroke-[2.8]" />
              </span>
              <span
                className="transition-opacity duration-200"
                style={{ opacity: isTransitioning ? 0.5 : 1 }}
              >
                {currentSlide.badge}
              </span>
            </div>

            {/* Overlapping Main Container */}
            <div className="relative w-full h-[550px]">
              {/* Left Dark Card - Positioned exactly to red rectangle bounds */}
              <div className="absolute left-0 top-[125px] bottom-[30px] z-10 w-[440px] lg:w-[480px] max-w-[90vw]">
                <div className="h-full rounded-2xl bg-navy-900 p-8 lg:p-9 shadow-2xl flex flex-col justify-start">
                  <h1 className="text-[2.5rem] lg:text-[2.75rem] font-extrabold leading-[1.1] text-white tracking-tight">
                    Your Home ,
                    <br />
                    <span
                      className="inline-block transition-opacity duration-200"
                      style={{
                        color: "#F97316",
                        opacity: isTransitioning ? 0.4 : 1,
                      }}
                    >
                      {currentSlide.word}
                    </span>
                    <br />
                    Handled.
                  </h1>

                  <p
                    className="mt-5 text-[1rem] lg:text-[1.05rem] leading-relaxed transition-opacity duration-200"
                    style={{
                      color: "rgba(255, 255, 255, 0.85)",
                      opacity: isTransitioning ? 0.4 : 1,
                    }}
                  >
                    {currentSlide.description}
                  </p>

                  <div className="mt-6">
                    <Link
                      href={currentSlide.href}
                      className="inline-flex min-h-12 items-center gap-2 rounded-full px-8 text-[0.95rem] font-bold text-white shadow-sm transition hover:scale-[1.04]"
                      style={{ backgroundColor: "#F97316", color: "#ffffff" }}
                    >
                      Explore Services
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* Right Photo Stack (75% width pushed right) */}
              <div className="relative ml-auto h-[550px] w-3/4 overflow-hidden rounded-[1rem] bg-[#0A1A3A] shadow-inner">
                {slides.map((slide, idx) => {
                  const isActive = idx === currentIndex;
                  const isDiwali = slide.id === "festive-diwali" && !slide.desktopImage;

                  return (
                    <div
                      key={slide.id}
                      className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${isActive ? "opacity-100 z-[1]" : "opacity-0 pointer-events-none z-0"
                        }`}
                    >
                      <div className={`size-full relative ${isActive ? "ken-burns-active" : ""}`}>
                        {isDiwali ? (
                          <DiwaliSceneSvg className="absolute inset-0 size-full" />
                        ) : (
                          <RemoteImage
                            src={slide.desktopImage!}
                            alt={slide.alt}
                            fill
                            sizes="(min-width: 1280px) 912px, 75vw"
                            priority={idx === 0}
                            className="object-cover"
                            style={{
                              objectPosition: slide.imagePosition ?? "70% 50%",
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Subtle Dark Shade */}
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent z-[5]"
                  aria-hidden="true"
                />

                {/* 5. Brand Mark: Logo Plus Name */}
                <div className="absolute left-[200px] lg:left-[215px] bottom-6 z-30 hidden md:flex items-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] select-none pointer-events-none">
                  <Logo dark />
                </div>

                {/* Photo Controls: Arrows + Thumbnails (Solid White Background) */}
                <div className="absolute right-6 bottom-6 z-30 flex items-center gap-2">
                  {/* Previous Button */}
                  <button
                    type="button"
                    onClick={() => goToDesktopSlide(currentIndex - 1)}
                    aria-label="Previous slide"
                    className="size-8 rounded-full border border-line bg-white flex items-center justify-center text-navy-900 shadow-sm transition hover:bg-[#F4F1EA] cursor-pointer"
                  >
                    <ChevronLeft className="size-4 stroke-[2.4]" />
                  </button>

                  {/* Thumbnail Tiles */}
                  {slides.map((slide, idx) => {
                    const isActive = idx === currentIndex;
                    return (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => goToDesktopSlide(idx)}
                        aria-label={slide.badge}
                        aria-current={isActive ? "true" : "false"}
                        className={`h-[44px] w-[58px] rounded-[10px] bg-white flex items-center justify-center shadow-sm cursor-pointer transition ${isActive
                          ? "ring-2 ring-action text-action border border-transparent"
                          : "border border-line text-[#667085] hover:text-navy-900"
                          }`}
                      >
                        {slide.thumbIcon === "gift" && <Gift className="size-5 stroke-[2]" />}
                        {slide.thumbIcon === "sparkles" && (
                          <Sparkles className="size-5 stroke-[2]" />
                        )}
                        {slide.thumbIcon === "snowflake" && (
                          <Snowflake className="size-5 stroke-[2]" />
                        )}
                        {slide.thumbIcon === "wrench" && <Wrench className="size-5 stroke-[2]" />}
                      </button>
                    );
                  })}

                  {/* Next Button */}
                  <button
                    type="button"
                    onClick={() => goToDesktopSlide(currentIndex + 1)}
                    aria-label="Next slide"
                    className="size-8 rounded-full border border-line bg-white flex items-center justify-center text-navy-900 shadow-sm transition hover:bg-[#F4F1EA] cursor-pointer"
                  >
                    <ChevronRight className="size-4 stroke-[2.4]" />
                  </button>
                </div>

                {/* 3px Progress Bar on Bottom Edge */}
                <div className="absolute left-0 right-0 bottom-0 h-[3px] bg-navy-900/30 z-20 overflow-hidden">
                  <div
                    className="h-full bg-action"
                    style={{
                      width: `${progressPercent}%`,
                      transition: progressPercent === 0 ? "none" : "width 50ms linear",
                    }}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ============================================================ */}
      {/* MOBILE LAYOUT (Below 768px)                                   */}
      {/* ============================================================ */}
      {variant !== "desktop" && (
        <div className="block md:hidden">
          {/* Horizontal Swipe Carousel */}
          <div
            ref={mobileScrollContainerRef}
            onScroll={handleMobileScroll}
            onTouchStart={() => {
              mobileHoldingRef.current = true;
            }}
            onTouchEnd={() => {
              mobileHoldingRef.current = false;
            }}
            onMouseEnter={() => {
              mobileHoverRef.current = true;
            }}
            onMouseLeave={() => {
              mobileHoverRef.current = false;
            }}
            className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory scrollbar-none overscroll-x-contain pb-1 -mx-4 px-4"
            style={{ scrollbarWidth: "none" }}
            aria-roledescription="carousel"
            aria-label="Featured services"
          >
            {slides.map((slide, idx) => {
              const isDiwali = slide.id === "festive-diwali" && !slide.mobileImage;
              return (
                <Link
                  key={slide.id}
                  href={slide.href}
                  className="relative shrink-0 w-[calc(100%-34px)] h-[190px] rounded-[1.25rem] overflow-hidden snap-start block text-white bg-[#0A1A3A] shadow-md"
                >
                  {/* Image / Scene */}
                  {isDiwali ? (
                    <DiwaliSceneSvg className="absolute inset-0 size-full" />
                  ) : (
                    <RemoteImage
                      src={slide.mobileImage!}
                      alt=""
                      fill
                      sizes="100vw"
                      priority={idx === 0}
                      loading={idx === 0 ? "eager" : "lazy"}
                      className="object-cover"
                      style={{
                        objectPosition: slide.imagePosition ?? "70% 50%",
                      }}
                    />
                  )}

                  {/* 3-stop overlay gradient */}
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-navy-900/90 via-navy-900/50 to-navy-900/10 pointer-events-none"
                    aria-hidden="true"
                  />

                  {/* Top-left Orange Pill */}
                  <span className="absolute left-4 top-4 bg-[#F87000] text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full shadow-xs">
                    {slide.mobilePill}
                  </span>

                  {/* Bottom-left Headline */}
                  <h2 className="absolute left-4 bottom-4 max-w-[68%] text-white font-extrabold text-[1.3rem] leading-tight tracking-tight">
                    {slide.mobileHeadline}
                  </h2>
                </Link>
              );
            })}

            {/* 24px trailing peek spacer */}
            <div className="shrink-0 w-6" aria-hidden="true" />
          </div>

          {/* Carousel Dots */}
          <div className="flex justify-center items-center gap-1.5 mt-3.5 mb-2">
            {slides.map((slide, idx) => {
              const isActive = idx === mobileIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => goToMobileSlide(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  aria-current={isActive ? "true" : "false"}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${isActive ? "w-5 bg-action" : "w-1.5 bg-[#D0C9BE]"
                    }`}
                />
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
