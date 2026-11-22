"use client";

import type { ServiceDetail } from "../queries";
import { RemoteImage } from "@/components/remote-image";

function cleanStep(title: string, text: string) {
  const cleanTitle = title.replace(/Service guarantee activation/i, "Service completion sign-off");
  const cleanText = text.replace(
    /The workmanship is covered for 30 days from the day the visit is completed\./i,
    "Testing and review before the professional marks the visit completed.",
  );
  return { title: cleanTitle, text: cleanText };
}

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
 * - Desktop (>= md): Image-Hero 2+3 Bento Mosaic (large visual showcase with hover zoom and clean badges).
 */
export function ProcessSteps({ steps }: { steps: ProcessStepItem[] }) {
  const ordered = [...steps].sort((left, right) => left.display_order - right.display_order);

  if (ordered.length === 0) return null;

  // Split into Top 2 and Bottom 3 (or remainder) for the 2+3 Bento Mosaic
  const topSteps = ordered.slice(0, 2);
  const bottomSteps = ordered.slice(2);

  return (
    <>
      {/* =================================================================
          DESKTOP: Image-Hero 2+3 Bento Mosaic (md and up)
          ================================================================= */}
      <div className="mt-6 hidden md:block space-y-4">
        {/* Top Row: 2 Large Cards */}
        {topSteps.length > 0 && (
          <div
            className={`grid gap-4 ${
              topSteps.length === 1 ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {topSteps.map((step, index) => {
              const { title: stepTitle, text: stepText } = cleanStep(step.title, step.text);
              const customImage = step.image_url?.trim();
              const imageSrc =
                customImage && customImage.length > 0
                  ? customImage
                  : DEFAULT_PROCESS_STEP_IMAGES[index % DEFAULT_PROCESS_STEP_IMAGES.length];

              return (
                <div
                  key={step.id}
                  className="group relative h-[220px] lg:h-[240px] overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-900 shadow-2xs transition-all duration-300 hover:shadow-md"
                >
                  <RemoteImage
                    src={imageSrc}
                    alt={stepTitle || `Step ${index + 1}`}
                    fill
                    sizes="(max-width: 1280px) 50vw, 500px"
                    className="object-cover object-[50%_25%] transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  {/* Bottom Gradient Scrim */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
                  />
                  {/* Step Number Badge */}
                  <div className="absolute top-3.5 left-3.5 flex size-7 items-center justify-center rounded-full bg-white text-xs font-black text-[#00112e] shadow-md ring-2 ring-white/50">
                    {index + 1}
                  </div>
                  {/* Bottom Text Overlay */}
                  <div className="absolute inset-x-5 bottom-4 z-10 text-white">
                    <h3 className="text-base lg:text-[17px] font-extrabold tracking-tight text-white leading-tight">
                      {stepTitle}
                    </h3>
                    {stepText ? (
                      <p className="mt-1 text-xs lg:text-[13px] leading-snug text-white/90 line-clamp-2 max-w-xl">
                        {stepText}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Row: 3 Medium Cards */}
        {bottomSteps.length > 0 && (
          <div
            className={`grid gap-4 ${
              bottomSteps.length === 3
                ? "grid-cols-3"
                : bottomSteps.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
            }`}
          >
            {bottomSteps.map((step, idx) => {
              const actualIndex = idx + 2;
              const { title: stepTitle, text: stepText } = cleanStep(step.title, step.text);
              const customImage = step.image_url?.trim();
              const imageSrc =
                customImage && customImage.length > 0
                  ? customImage
                  : DEFAULT_PROCESS_STEP_IMAGES[actualIndex % DEFAULT_PROCESS_STEP_IMAGES.length];

              return (
                <div
                  key={step.id}
                  className="group relative h-[190px] lg:h-[205px] overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-900 shadow-2xs transition-all duration-300 hover:shadow-md"
                >
                  <RemoteImage
                    src={imageSrc}
                    alt={stepTitle || `Step ${actualIndex + 1}`}
                    fill
                    sizes="(max-width: 1280px) 33vw, 340px"
                    className="object-cover object-[50%_25%] transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  {/* Bottom Gradient Scrim */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent"
                  />
                  {/* Step Number Badge */}
                  <div className="absolute top-3 left-3 flex size-7 items-center justify-center rounded-full bg-white text-xs font-black text-[#00112e] shadow-md ring-2 ring-white/50">
                    {actualIndex + 1}
                  </div>
                  {/* Bottom Text Overlay */}
                  <div className="absolute inset-x-4 bottom-3.5 z-10 text-white">
                    <h3 className="text-sm lg:text-[15px] font-extrabold tracking-tight text-white leading-tight">
                      {stepTitle}
                    </h3>
                    {stepText ? (
                      <p className="mt-1 text-xs leading-snug text-white/90 line-clamp-1">
                        {stepText}
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* =================================================================
          MOBILE: Vertical timeline (< md) - preserved exactly as before
          ================================================================= */}
      <div className="mt-5 block md:hidden">
        {ordered.map((step, index) => {
          const last = index === ordered.length - 1;
          const { title: stepTitle, text: stepText } = cleanStep(step.title, step.text);
          const customImage = step.image_url?.trim();
          const imageSrc =
            customImage && customImage.length > 0
              ? customImage
              : DEFAULT_PROCESS_STEP_IMAGES[index % DEFAULT_PROCESS_STEP_IMAGES.length];

          return (
            <div key={step.id} className={`relative flex gap-3.5 ${last ? "pb-2" : "pb-7"}`}>
              {/* Connector line between steps */}
              {!last ? (
                <div
                  aria-hidden="true"
                  className="absolute left-[15px] top-[34px] bottom-0 w-[2px] bg-[#E2E8F0]"
                />
              ) : null}

              {/* Circular Step Number Badge */}
              <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-[#F8FAFC] text-navy-900 shadow-2xs">
                <span className="text-[13px] font-extrabold">{index + 1}</span>
              </div>

              {/* Step Content */}
              <div className="min-w-0 flex-1 pt-0.5">
                {stepTitle ? (
                  <h3 className="text-[15px] font-bold text-navy-900 leading-snug">
                    {stepTitle}
                  </h3>
                ) : null}

                {stepText ? (
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                    {stepText}
                  </p>
                ) : null}

                {/* Single Image Slot per Step (16:9) */}
                <div className="mt-3 relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-[#F8FAFC]">
                  <RemoteImage
                    src={imageSrc}
                    alt={stepTitle || `Step ${index + 1} visual guide`}
                    fill
                    sizes="(max-width: 640px) 100vw, 400px"
                    className="object-cover object-[50%_25%]"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
