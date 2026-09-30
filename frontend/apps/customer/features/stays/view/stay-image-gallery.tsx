"use client";

import { useCallback, useEffect, useState } from "react";
import { Building, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";

import type { StayProperty } from "../model";

type StayMedia = StayProperty["media"][number];

function orderedMedia(media: StayMedia[]): StayMedia[] {
  return [...media]
    .filter((item) => Boolean(item.url))
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

interface StayImageGalleryProps {
  media: StayMedia[];
  title: string;
  className?: string;
}

export function StayImageGallery({ media, title, className }: StayImageGalleryProps) {
  const slides = orderedMedia(media);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
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
        className={`grid aspect-[16/10] place-items-center overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-sunken ${className ?? ""}`}
        role="img"
        aria-label={`${title} — no photos yet`}
      >
        <div className="flex flex-col items-center gap-2 px-6 text-center">
          <span className="grid size-12 place-items-center rounded-full border border-line bg-surface text-text-muted">
            <ImageOff className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-text-secondary">Photos coming soon</p>
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <Building className="size-3.5" aria-hidden />
            Verified stay listing
          </p>
        </div>
      </div>
    );
  }

  const current = slides[Math.min(index, slides.length - 1)]!;
  const caption = current.caption?.trim() || title;

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div
        className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-sunken outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        role="region"
        aria-roledescription="carousel"
        aria-label={`${title} photos`}
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
        <img
          src={current.url}
          alt={caption}
          className="h-full w-full object-cover"
        />

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="absolute left-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/90 text-text shadow-xs backdrop-blur-sm transition hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface/90 text-text shadow-xs backdrop-blur-sm transition hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
            <div className="absolute bottom-3 right-3 rounded-control border border-line bg-surface/90 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-text-secondary backdrop-blur-sm">
              {index + 1} / {slides.length}
            </div>
          </>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-0.5" role="tablist" aria-label="Photo thumbnails">
          {slides.map((item, i) => {
            const selected = i === index;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Show photo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`relative h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-control border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  selected
                    ? "border-action ring-2 ring-action/30"
                    : "border-line opacity-80 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
