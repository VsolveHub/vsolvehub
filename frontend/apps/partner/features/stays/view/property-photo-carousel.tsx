"use client";

import { useT } from "@vsolve/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

export type PropertyPhotoSlide = {
  id: string;
  url: string;
  caption?: string;
};

type PropertyPhotoCarouselProps = {
  slides: PropertyPhotoSlide[];
  label: string;
  /** Fill a parent framed area (listed property card). */
  fill?: boolean;
  /** Show the thumbnail strip under the main slide. */
  showThumbs?: boolean;
  emptyLabel?: string;
  className?: string;
  overlay?: ReactNode;
};

export function PropertyPhotoCarousel({
  slides,
  label,
  fill = false,
  showThumbs = false,
  emptyLabel,
  className,
  overlay,
}: PropertyPhotoCarouselProps) {
  const t = useT();
  const emptyText = emptyLabel ?? t("stays.carousel.noPhoto");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex((current) => {
      if (slides.length === 0) return 0;
      return Math.min(current, slides.length - 1);
    });
  }, [slides.length]);

  const go = useCallback(
    (delta: number) => {
      if (slides.length < 2) return;
      setIndex((current) => (current + delta + slides.length) % slides.length);
    },
    [slides.length],
  );

  if (slides.length === 0) {
    return (
      <div
        className={`relative flex items-center justify-center bg-surface-sunken text-sm text-text-muted ${
          fill ? "size-full min-h-[160px]" : "aspect-[16/10] rounded-card border border-line"
        } ${className ?? ""}`}
        role="img"
        aria-label={`${label} — ${emptyText}`}
      >
        {emptyText}
        {overlay}
      </div>
    );
  }

  const safeIndex = Math.min(index, slides.length - 1);
  const current = slides[safeIndex]!;
  const alt = current.caption?.trim() || label;

  const stage = (
    <div
      className={`relative overflow-hidden bg-surface-sunken outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        fill
          ? "size-full min-h-[160px]"
          : "aspect-[16/10] rounded-card border border-line"
      }`}
      role="region"
      aria-roledescription="carousel"
      aria-label={t("stays.carousel.photosAriaLabel", { label })}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          go(-1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          go(1);
        }
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.url} alt={alt} className="size-full object-cover" />

      {slides.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={t("stays.carousel.previous")}
            className="absolute left-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/90 text-navy-900 shadow-xs backdrop-blur-sm transition hover:bg-surface"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={t("stays.carousel.next")}
            className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/90 text-navy-900 shadow-xs backdrop-blur-sm transition hover:bg-surface"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <div className="absolute bottom-2 left-2 rounded-control border border-line bg-surface/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary backdrop-blur-sm">
            {safeIndex + 1} / {slides.length}
          </div>
        </>
      ) : null}

      {overlay}
    </div>
  );

  if (!showThumbs || slides.length < 2) {
    return <div className={`${fill ? "size-full" : ""} ${className ?? ""}`}>{stage}</div>;
  }

  return (
    <div className={`flex flex-col gap-2 ${fill ? "size-full" : ""} ${className ?? ""}`}>
      {stage}
      <div className="flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label={t("stays.carousel.thumbnails")}>
        {slides.map((slide, i) => {
          const selected = i === safeIndex;
          return (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={t("stays.carousel.showPhoto", { n: i + 1 })}
              onClick={() => setIndex(i)}
              className={`relative h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-control border transition ${
                selected
                  ? "border-action ring-2 ring-action/30"
                  : "border-line opacity-80 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={slide.url} alt="" className="size-full object-cover" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
