"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Pause,
  Play,
  Shield,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

import type { SafetyStoryItem } from "../queries";

export type SafetyStoryViewerProps = {
  isOpen: boolean;
  stories: SafetyStoryItem[];
  initialIndex?: number;
  onClose: () => void;
  onStoryViewed?: (storyId: string) => void;
};

const DEFAULT_IMAGE_DURATION_MS = 5000;

function formatExpiration(expiresAtIso: string): string {
  try {
    const expiresAt = new Date(expiresAtIso).getTime();
    const now = Date.now();
    const diffHours = Math.max(0, Math.round((expiresAt - now) / (1000 * 60 * 60)));
    if (diffHours <= 1) {
      const diffMins = Math.max(1, Math.round((expiresAt - now) / (1000 * 60)));
      return `${diffMins}m left`;
    }
    return `${diffHours}h left`;
  } catch {
    return "Expires today";
  }
}

export function SafetyStoryViewer({
  isOpen,
  stories,
  initialIndex = 0,
  onClose,
  onStoryViewed,
}: SafetyStoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0); // 0 to 100
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [imageError, setImageError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isHoldingRef = useRef(false);
  const currentIndexRef = useRef(initialIndex);
  const progressRef = useRef(0);

  const currentStory = stories[currentIndex];

  // Lock body scroll while viewer is open to avoid double scrollbars
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Sync index when initialIndex changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const validIndex = Math.min(Math.max(0, initialIndex), stories.length - 1);
      setCurrentIndex(validIndex);
      currentIndexRef.current = validIndex;
      progressRef.current = 0;
      setProgress(0);
      setIsPaused(false);
      setImageError(false);
    }
  }, [isOpen, initialIndex, stories.length]);

  // Mark current story as viewed
  useEffect(() => {
    if (isOpen && currentStory) {
      onStoryViewed?.(currentStory.id);
      setImageError(false);
    }
  }, [isOpen, currentStory, onStoryViewed]);

  const handleNext = useCallback(() => {
    if (currentIndexRef.current < stories.length - 1) {
      progressRef.current = 0;
      setProgress(0);
      setCurrentIndex((prev) => {
        const next = Math.min(stories.length - 1, prev + 1);
        currentIndexRef.current = next;
        return next;
      });
    } else {
      onClose();
    }
  }, [stories.length, onClose]);

  const handlePrev = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
    if (currentIndexRef.current > 0) {
      setCurrentIndex((prev) => {
        const next = Math.max(0, prev - 1);
        currentIndexRef.current = next;
        return next;
      });
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  // Video playback management
  useEffect(() => {
    if (!isOpen || !currentStory) return;

    if (currentStory.media_type === "VIDEO") {
      const video = videoRef.current;
      if (!video) return;

      if (isPaused) {
        video.pause();
      } else {
        const playPromise = video.play();
        if (playPromise !== undefined && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            setIsMuted(true);
          });
        }
      }
    }
  }, [isOpen, currentStory, isPaused]);

  // Image progress timer
  useEffect(() => {
    if (!isOpen || !currentStory) return;

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    if (isPaused) return;

    if (currentStory.media_type === "IMAGE") {
      const stepMs = 50;
      const totalSteps = DEFAULT_IMAGE_DURATION_MS / stepMs;
      const stepIncrement = 100 / totalSteps;

      progressIntervalRef.current = setInterval(() => {
        const nextVal = progressRef.current + stepIncrement;
        if (nextVal >= 100) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          progressRef.current = 100;
          setProgress(100);
          handleNext();
        } else {
          progressRef.current = nextVal;
          setProgress(nextVal);
        }
      }, stepMs);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isOpen, currentStory, isPaused, handleNext]);

  const handleVideoTimeUpdate = () => {
    if (isPaused || !videoRef.current) return;
    const { currentTime, duration } = videoRef.current;
    if (duration > 0) {
      const p = (currentTime / duration) * 100;
      progressRef.current = p;
      setProgress(p);
    }
  };

  const handleVideoEnded = () => {
    handleNext();
  };

  const handlePressStart = () => {
    isHoldingRef.current = true;
    setIsPaused(true);
  };

  const handlePressEnd = () => {
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      setIsPaused(false);
    }
  };

  if (!isOpen || stories.length === 0 || !currentStory) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Safety Stories Viewer"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md select-none touch-none overflow-hidden"
    >
      {/* Background ambient lighting for desktop */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25 blur-3xl pointer-events-none hidden md:block scale-110"
        style={{ backgroundImage: `url(${currentStory.media_url})` }}
      />

      {/* Main Story Container: Full-bleed on mobile, refined floating device card on desktop */}
      <div
        className="relative w-full h-full md:w-[420px] md:h-[88vh] md:max-h-[820px] md:rounded-[2rem] overflow-hidden bg-black flex flex-col justify-between shadow-2xl border-0 md:border md:border-white/10"
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        {/* Full-bleed Media Layer */}
        <div className="absolute inset-0 size-full flex items-center justify-center overflow-hidden bg-black">
          {imageError ? (
            /* Branded VSolve Safety Poster when image fails to load */
            <div className="size-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-navy-950 via-navy-900 to-black text-center relative overflow-hidden">
              <Shield className="size-32 text-action/15 absolute -right-6 -bottom-6" />
              <div className="size-16 rounded-full bg-action/15 border border-action/30 flex items-center justify-center text-action mb-4 shadow-sm">
                <ShieldCheck className="size-9" />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-action mb-1">
                VSolve Verified Standard
              </span>
              <h4 className="text-white text-xl font-extrabold max-w-xs leading-snug">
                {currentStory.title}
              </h4>
            </div>
          ) : currentStory.media_type === "IMAGE" ? (
            <>
              {/* Ambient blurred backdrop for letterboxed areas */}
              <div
                className="absolute inset-0 bg-cover bg-center blur-2xl scale-110 opacity-40 select-none pointer-events-none"
                style={{ backgroundImage: `url(${currentStory.media_url})` }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentStory.media_url}
                alt={currentStory.title}
                onError={() => setImageError(true)}
                className="relative size-full object-contain select-none pointer-events-none z-10"
              />
            </>
          ) : (
            <video
              ref={videoRef}
              src={currentStory.media_url}
              playsInline
              autoPlay
              muted={isMuted}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={handleVideoEnded}
              className="size-full object-contain select-none z-10"
            />
          )}

          {/* Left/Right Tap Zones */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-0 inset-y-0 w-1/3 z-20 cursor-pointer"
            aria-label="Previous story"
          />
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-0 inset-y-0 w-2/3 z-20 cursor-pointer"
            aria-label="Next story"
          />
        </div>

        {/* Top Vignette Gradient Overlay & Header Controls */}
        <div className="absolute inset-x-0 top-0 z-30 pt-4 pb-12 px-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none flex flex-col gap-2.5">
          {/* Progress Bars */}
          <div className="flex items-center gap-1.5 w-full">
            {stories.map((story, idx) => {
              let barFill = 0;
              const isCurrent = idx === currentIndex;
              if (idx < currentIndex) {
                barFill = 100;
              } else if (isCurrent) {
                barFill = progress;
              } else {
                barFill = 0;
              }

              return (
                <div
                  key={story.id}
                  className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden"
                >
                  <div
                    className="h-full transition-all duration-75 ease-linear rounded-full bg-white"
                    style={{ width: `${barFill}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Header Bar */}
          <div className="flex items-center justify-between pointer-events-auto">
            {/* Brand/Shield Seal */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-full bg-gradient-to-br from-action to-[#ea580c] text-white flex items-center justify-center shadow-md shrink-0 border border-white/20">
                <ShieldCheck className="size-4.5" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white text-xs font-bold tracking-tight leading-none drop-shadow-sm">
                    VSolve Safety
                  </span>
                  <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/15">
                    <Clock className="size-2.5" />
                    {formatExpiration(currentStory.expires_at)}
                  </span>
                </div>
                <span className="text-white/70 text-[10px] font-medium tracking-wide uppercase drop-shadow-sm mt-0.5">
                  Verified Update
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div
              className="flex items-center gap-1.5 shrink-0"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* Play/Pause */}
              <button
                type="button"
                onClick={() => setIsPaused((prev) => !prev)}
                aria-label={isPaused ? "Resume story" : "Pause story"}
                className="size-8 flex items-center justify-center text-white/90 hover:text-white rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/15 transition-all cursor-pointer"
              >
                {isPaused ? <Play className="size-3.5 fill-white" /> : <Pause className="size-3.5" />}
              </button>

              {/* Sound Mute/Unmute */}
              {currentStory.media_type === "VIDEO" && (
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                  className="size-8 flex items-center justify-center text-white/90 hover:text-white rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/15 transition-all cursor-pointer"
                >
                  {isMuted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                </button>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close story viewer"
                className="size-8 flex items-center justify-center text-white/90 hover:text-white rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/15 transition-all cursor-pointer"
              >
                <X className="size-4" strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Floating Caption Overlay with Smooth Scrim */}
        <div className="absolute inset-x-0 bottom-0 z-30 p-5 pb-8 sm:pb-6 pt-24 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none flex flex-col gap-2">
          <div className="pointer-events-auto flex flex-col gap-2">
            {currentStory.title && (
              <h3 className="text-white font-extrabold text-xl sm:text-2xl leading-snug drop-shadow-md tracking-tight capitalize">
                {currentStory.title}
              </h3>
            )}
            {currentStory.caption && (
              <p className="text-white/90 text-xs sm:text-sm font-normal leading-relaxed line-clamp-3 drop-shadow-sm">
                {currentStory.caption}
              </p>
            )}

            {/* VSolve Verified Standard Pill */}
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md px-3.5 py-1.5 text-[11px] font-semibold text-white border border-white/20 shadow-xs mt-1 self-start">
              <ShieldCheck className="size-3.5 text-action" />
              <span>ID-Verified Professional Standard</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop side navigation arrows */}
      <div className="hidden md:flex absolute inset-x-8 top-1/2 -translate-y-1/2 justify-between pointer-events-none z-40 max-w-2xl mx-auto w-full">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          aria-label="Previous story button"
          className="pointer-events-auto size-11 rounded-full bg-white/15 hover:bg-white/25 text-white disabled:opacity-0 transition-all backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 cursor-pointer"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next story button"
          className="pointer-events-auto size-11 rounded-full bg-white/15 hover:bg-white/25 text-white transition-all backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 cursor-pointer"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
