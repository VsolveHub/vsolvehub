"use client";

import { useEffect, useState } from "react";
import { Clock, ShieldCheck, X } from "lucide-react";

import type { OpsSafetyStory } from "../queries";

export type StoryPreviewModalProps = {
  isOpen: boolean;
  story: OpsSafetyStory | null;
  onClose: () => void;
};

export function StoryPreviewModal({ isOpen, story, onClose }: StoryPreviewModalProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen || !story) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => (prev >= 100 ? 0 : prev + 2));
    }, 100);
    return () => clearInterval(interval);
  }, [isOpen, story]);

  if (!isOpen || !story) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Story preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#000817]/80 backdrop-blur-sm p-4 select-none"
    >
      <div className="relative w-full max-w-[390px] h-[680px] rounded-[2.5rem] bg-[#00112e] overflow-hidden shadow-2xl border-4 border-navy-800/80 flex flex-col justify-between">
        {/* Top Vignette Gradient */}
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#000817]/90 via-[#00112e]/50 to-transparent pointer-events-none z-10" />

        {/* Top Progress Bar */}
        <div className="relative z-20 flex gap-1 px-4 pt-4">
          <div className="h-1 flex-1 bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#f87000] transition-all duration-75 ease-linear rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Top Story Header */}
        <div className="relative z-20 flex items-center justify-between px-4 py-2 text-white">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-[#f87000] text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="size-4.5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-white text-xs font-extrabold tracking-tight leading-none">
                  VSolve Safety
                </span>
                <span className="inline-flex items-center gap-1 bg-white/15 backdrop-blur-xs text-white/90 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  <Clock className="size-2.5" />
                  {story.is_active ? "Live" : story.is_published ? "Expired" : "Draft"}
                </span>
              </div>
              <span className="text-white/70 text-[11px] font-medium truncate max-w-[170px] mt-0.5">
                {story.title || "Safety Standard"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white/90 hover:text-white transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Media */}
        <div className="absolute inset-0 z-0 bg-navy-950 flex items-center justify-center">
          {story.media_type === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={story.media_url}
              alt={story.title}
              className="size-full object-cover"
            />
          ) : (
            <video
              src={story.media_url}
              playsInline
              autoPlay
              muted
              loop
              className="size-full object-cover"
            />
          )}
        </div>

        {/* Bottom Caption & VSolve Signature Trust Badge */}
        <div className="relative z-20 p-5 bg-gradient-to-t from-[#000817] via-[#00112e]/90 to-transparent flex flex-col gap-2 pt-10 text-white">
          <h3 className="font-extrabold text-lg leading-snug drop-shadow-sm tracking-tight">
            {story.title || "Safety Update"}
          </h3>
          {story.caption && (
            <p className="text-white/90 text-xs md:text-sm font-normal leading-relaxed line-clamp-3 drop-shadow-sm">
              {story.caption}
            </p>
          )}

          {/* VSolve Exact Verified Pro Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#f87000]/30 bg-[#fdf3ec] px-3.5 py-1.5 text-xs font-bold text-navy-900 shadow-sm mt-1 self-start">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#f87000] text-white">
              <svg viewBox="0 0 20 20" fill="currentColor" className="size-2.5">
                <path
                  fillRule="evenodd"
                  d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <span className="text-[#a94900] font-extrabold text-[11px] uppercase tracking-wide">
              ID-Verified Professional Standard
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
