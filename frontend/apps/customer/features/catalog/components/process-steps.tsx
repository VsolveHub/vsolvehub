"use client";

import { useState } from "react";
import type { ServiceDetail } from "../queries";
import { formatGuaranteePolicy } from "@/lib/guarantee-presentation";
import { RemoteImage } from "@/components/remote-image";

export type ProcessStepItem = ServiceDetail["policies"][number] & {
  image_url?: string | null;
};

const DEFAULT_PROCESS_STEP_IMAGES = [
  "/process-steps/step-1-inspection.webp",
  "/process-steps/step-2-approval.webp",
  "/process-steps/step-3-setup.webp",
  "/process-steps/step-4-execution.webp",
  "/process-steps/step-5-handover.webp",
] as const;

/**
 * How the visit actually runs, in order.
 *
 * - Mobile (< md): vertical timeline with numbered badges, connector stem, and 16:9 image per step.
 * - Desktop (>= md): interactive Spotlight Hero + Thumbnail Filmstrip with smooth step transitions.
 */
export function ProcessSteps({ steps }: { steps: ProcessStepItem[] }) {
  const ordered = [...steps].sort((left, right) => left.display_order - right.display_order);
  const [activeIndex, setActiveIndex] = useState(0);

  if (ordered.length === 0) return null;

  const safeIndex = Math.min(activeIndex, ordered.length - 1);
  const activeStep = ordered[safeIndex]!;
  const activeTitle = formatGuaranteePolicy(activeStep.title) ?? activeStep.title;
  const activeText = formatGuaranteePolicy(activeStep.text) ?? activeStep.text;
  const activeCustomImage = activeStep.image_url?.trim();
  const activeImageSrc =
    activeCustomImage && activeCustomImage.length > 0
      ? activeCustomImage
      : DEFAULT_PROCESS_STEP_IMAGES[safeIndex % DEFAULT_PROCESS_STEP_IMAGES.length];

  const filmstripColsClass =
    ordered.length >= 5
      ? "grid-cols-5"
      : ordered.length === 4
        ? "grid-cols-4"
        : ordered.length === 3
          ? "grid-cols-3"
          : ordered.length === 2
            ? "grid-cols-2"
            : "grid-cols-1";

  return (
    <>
      {/* =================================================================
          DESKTOP: Spotlight Hero + Thumbnail Filmstrip (md and up)
          ================================================================= */}
      <div className="mt-5 hidden md:block">
        <style>{`
          @keyframes spotlightImgIn {
            from { opacity: 0.25; transform: scale(1.03); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes spotlightCapIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .spotlight-img-anim {
            animation: spotlightImgIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          .spotlight-cap-anim {
            animation: spotlightCapIn 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          @media (prefers-reduced-motion: reduce) {
            .spotlight-img-anim,
            .spotlight-cap-anim {
              animation: none !important;
            }
          }
        `}</style>

        {/* Main Spotlight Stage */}
        <div className="relative h-[300px] lg:h-[340px] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-900 shadow-sm">
          <div key={activeStep.id} className="spotlight-img-anim relative size-full">
            <RemoteImage
              src={activeImageSrc}
              alt={activeTitle || `Step ${safeIndex + 1} procedure`}
              fill
              sizes="(max-width: 1280px) 90vw, 900px"
              className="object-cover object-[50%_25%]"
            />
          </div>

          {/* Bottom Gradient Scrim */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
          />

          {/* Top-right Prev / Next Step Controls */}
          {ordered.length > 1 ? (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous step"
                onClick={() => setActiveIndex((safeIndex - 1 + ordered.length) % ordered.length)}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xs transition-all hover:bg-black/70 active:scale-95"
              >
                <span aria-hidden="true" className="text-sm font-bold">←</span>
              </button>
              <button
                type="button"
                aria-label="Next step"
                onClick={() => setActiveIndex((safeIndex + 1) % ordered.length)}
                className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-xs transition-all hover:bg-black/70 active:scale-95"
              >
                <span aria-hidden="true" className="text-sm font-bold">→</span>
              </button>
            </div>
          ) : null}

          {/* Animated Step Caption Overlay */}
          <div
            key={`cap-${activeStep.id}`}
            className="spotlight-cap-anim absolute inset-x-6 bottom-5 z-10"
          >
            <span className="inline-flex items-center rounded-full bg-[#EA580C] px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide text-white shadow-xs">
              Step {safeIndex + 1} of {ordered.length}
            </span>
            {activeTitle ? (
              <h3 className="mt-2 text-xl lg:text-2xl font-extrabold tracking-tight text-white">
                {activeTitle}
              </h3>
            ) : null}
            {activeText ? (
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/90 line-clamp-2">
                {activeText}
              </p>
            ) : null}
          </div>
        </div>

        {/* 5-Thumbnail Filmstrip */}
        <div
          role="tablist"
          aria-label="Process steps"
          className={`mt-3.5 grid gap-3 ${filmstripColsClass}`}
        >
          {ordered.map((step, index) => {
            const isActive = index === safeIndex;
            const stepTitle = formatGuaranteePolicy(step.title) ?? step.title;
            const customImage = step.image_url?.trim();
            const imageSrc =
              customImage && customImage.length > 0
                ? customImage
                : DEFAULT_PROCESS_STEP_IMAGES[index % DEFAULT_PROCESS_STEP_IMAGES.length];

            return (
              <button
                key={step.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveIndex(index)}
                className={`group/thumb cursor-pointer rounded-xl border p-1.5 text-left transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action ${
                  isActive
                    ? "border-[#EA580C] bg-[#FFF8F3] ring-2 ring-[#EA580C]/20 -translate-y-0.5 shadow-sm"
                    : "border-slate-200 bg-white opacity-75 hover:opacity-100 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xs"
                }`}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-slate-100">
                  <RemoteImage
                    src={imageSrc}
                    alt=""
                    fill
                    sizes="200px"
                    className="object-cover object-[50%_25%] transition-transform duration-300 group-hover/thumb:scale-105"
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold transition-colors ${
                      isActive ? "bg-[#EA580C] text-white" : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span
                    className={`truncate text-xs font-bold ${
                      isActive ? "text-navy-900" : "text-slate-700"
                    }`}
                  >
                    {stepTitle || `Step ${index + 1}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* =================================================================
          MOBILE: Vertical Timeline (< md, unchanged)
          ================================================================= */}
      <ol className="mt-6 md:hidden">
        {ordered.map((step, index) => {
          const last = index === ordered.length - 1;
          const stepTitle = formatGuaranteePolicy(step.title) ?? step.title;
          const stepText = formatGuaranteePolicy(step.text) ?? step.text;
          const customImage = step.image_url?.trim();
          const imageSrc =
            customImage && customImage.length > 0
              ? customImage
              : DEFAULT_PROCESS_STEP_IMAGES[index % DEFAULT_PROCESS_STEP_IMAGES.length];

          return (
            <li key={step.id} className="relative flex gap-4 sm:gap-5 pb-8 last:pb-2">
              {last ? null : (
                <span
                  aria-hidden="true"
                  className="absolute left-[15px] top-8 bottom-0 w-[1.5px] bg-[#E2E8F0]"
                />
              )}

              <span
                aria-hidden="true"
                className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-[#F8FAFC] text-[13px] font-extrabold text-navy-900 shadow-2xs"
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1 pt-0.5">
                {stepTitle ? (
                  <h3 className="text-[1.05rem] font-bold text-navy-900 leading-snug tracking-tight">
                    {stepTitle}
                  </h3>
                ) : null}

                {stepText ? (
                  <p className="mt-1.5 text-[0.92rem] leading-relaxed text-text-secondary">
                    {stepText}
                  </p>
                ) : null}

                <div className="mt-3.5 w-full aspect-[16/9] sm:aspect-[16/8] max-h-[250px] rounded-2xl overflow-hidden border border-slate-200/90 bg-[#F8FAFC] relative shadow-2xs">
                  <RemoteImage
                    src={imageSrc}
                    alt={stepTitle || `Step ${index + 1} procedure`}
                    fill
                    sizes="(max-width: 768px) 100vw, 640px"
                    className="object-cover object-[50%_25%]"
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
