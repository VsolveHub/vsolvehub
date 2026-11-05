"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProgressiveImage } from "@vsolve/ui";

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
  const rawSlides = orderedMedia(media);
  const slides: StayMedia[] =
    rawSlides.length > 0
      ? rawSlides
      : [
          {
            id: "fallback-stay-image",
            url: "/catalog/tiles/apartments.png",
            caption: title,
            display_order: 0,
          } as StayMedia,
        ];
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
        <ProgressiveImage
          src={current.url}
          alt={caption}
          containerClassName="size-full"
          className="size-full object-cover"
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
            <div className="absolute bottom-3 right-3 rounded-full bg-navy-900/80 px-2.5 py-1 text-xs font-semibold text-white shadow-xs backdrop-blur-sm">
              {index + 1} / {slides.length}
            </div>
          </>
        ) : null}
      </div>

      {slides.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto py-1">
          {slides.map((item, idx) => (
            <button
              key={item.id ?? idx}
              type="button"
              onClick={() => setIndex(idx)}
              aria-label={`Show photo ${idx + 1}`}
              className={`relative aspect-[16/10] w-16 shrink-0 overflow-hidden rounded-control border transition ${
                idx === index
                  ? "border-action ring-2 ring-action/40"
                  : "border-line opacity-70 hover:opacity-100"
              }`}
            >
              <ProgressiveImage
                src={item.url}
                alt=""
                containerClassName="size-full"
                className="size-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
