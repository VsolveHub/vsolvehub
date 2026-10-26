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
    setCurrentIndex((prev) => {
      if (prev < stories.length - 1) {
        setProgress(0);
        return prev + 1;
      }
      onClose();
      return prev;
    });
  }, [stories.length, onClose]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev > 0) {
        setProgress(0);
        return prev - 1;
      }
      setProgress(0);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
      return 0;
    });
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
        setProgress((prev) => {
          const nextVal = prev + stepIncrement;
          if (nextVal >= 100) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current);
              progressIntervalRef.current = null;
            }
            handleNext();
            return 100;
          }
          return nextVal;
        });
      }, stepMs);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isOpen, currentStory, isPaused, handleNext]);

  const handleVideoTimeUpdate = () => {
    if (isPaused || !videoRef.current) return;
    const { currentTime, duration } = videoRef.current;
    if (duration > 0) {
      setProgress((currentTime / duration) * 100);
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#000817]/90 backdrop-blur-md select-none touch-none overflow-hidden"
    >
      {/* Background ambient lighting for desktop */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-15 blur-3xl pointer-events-none hidden md:block"
        style={{ backgroundImage: `url(${currentStory.media_url})` }}
      />

      {/* Main Story Container: Full-bleed on mobile, refined floating device card on desktop */}
      <div
        className="relative w-full h-full md:w-[420px] md:h-[88vh] md:max-h-[820px] md:rounded-[2.25rem] overflow-hidden bg-[#00112e] flex flex-col justify-between shadow-2xl border-0 md:border md:border-white/15"
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
      >
        {/* Top Vignette Gradient Overlay */}
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-[#000817]/90 via-[#00112e]/50 to-transparent pointer-events-none z-20" />

        {/* Progress Bars (VSolve orange fill on active story) */}
        <div className="relative z-30 flex items-center gap-1.5 px-3.5 pt-4 pb-1">
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
                className="h-1 flex-1 bg-white/25 rounded-full overflow-hidden"
              >
                <div
                  className={`h-full transition-all duration-75 ease-linear rounded-full ${
                    isCurrent ? "bg-[#f87000]" : "bg-white"
                  }`}
                  style={{ width: `${barFill}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Header Bar */}
        <div className="relative z-30 flex items-center justify-between px-4 py-2">
          {/* Brand/Shield Seal */}
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
                  {formatExpiration(currentStory.expires_at)}
                </span>
              </div>
              <span className="text-white/70 text-[11px] font-medium truncate max-w-[170px] mt-0.5">
                {currentStory.title || "Safety Standard"}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            className="flex items-center gap-1"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Play/Pause */}
            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              aria-label={isPaused ? "Resume story" : "Pause story"}
              className="p-1.5 text-white/80 hover:text-white rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-xs transition-colors"
            >
              {isPaused ? <Play className="size-4 fill-white" /> : <Pause className="size-4" />}
            </button>

            {/* Sound Mute/Unmute */}
            {currentStory.media_type === "VIDEO" && (
              <button
                type="button"
                onClick={() => setIsMuted((prev) => !prev)}
                aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                className="p-1.5 text-white/80 hover:text-white rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-xs transition-colors"
              >
                {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close story viewer"
              className="p-1.5 text-white/80 hover:text-white rounded-full bg-black/20 hover:bg-black/40 backdrop-blur-xs transition-colors ml-0.5"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Media Container with Branded Fallback Poster */}
        <div className="relative flex-1 w-full h-full flex items-center justify-center overflow-hidden bg-navy-950">
          {imageError ? (
            /* Branded VSolve Safety Poster when image fails to load */
            <div className="size-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-[#001a4e] via-[#00112e] to-[#000817] text-center relative overflow-hidden">
              <Shield className="size-32 text-[#f87000]/15 absolute -right-6 -bottom-6" />
              <div className="size-16 rounded-full bg-[#f87000]/15 border border-[#f87000]/30 flex items-center justify-center text-[#f87000] mb-4 shadow-sm">
                <ShieldCheck className="size-9" />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#f87000] mb-1">
                VSolve Verified Standard
              </span>
              <h4 className="text-white text-xl font-extrabold max-w-xs leading-snug">
                {currentStory.title}
              </h4>
            </div>
          ) : currentStory.media_type === "IMAGE" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentStory.media_url}
              alt={currentStory.title}
              onError={() => setImageError(true)}
              className="size-full object-cover select-none pointer-events-none"
            />
          ) : (
            <video
              ref={videoRef}
              src={currentStory.media_url}
              playsInline
              autoPlay
              muted={isMuted}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={handleVideoEnded}
              className="size-full object-cover select-none"
            />
          )}

          {/* Left/Right Tap Zones */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-0 inset-y-0 w-1/3 z-10 cursor-pointer"
            aria-label="Previous story"
          />
          <div
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-0 inset-y-0 w-2/3 z-10 cursor-pointer"
            aria-label="Next story"
          />
        </div>

        {/* Bottom Caption & VSolve Signature Trust Badge */}
        <div className="relative z-30 p-5 bg-gradient-to-t from-[#000817] via-[#00112e]/90 to-transparent flex flex-col gap-2 pt-10">
          {currentStory.title && (
            <h3 className="text-white font-extrabold text-lg md:text-xl leading-snug drop-shadow-sm tracking-tight">
              {currentStory.title}
            </h3>
          )}
          {currentStory.caption && (
            <p className="text-white/90 text-xs md:text-sm font-normal leading-relaxed line-clamp-3 drop-shadow-sm">
              {currentStory.caption}
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

      {/* Desktop side navigation arrows */}
      <div className="hidden md:flex absolute inset-x-8 top-1/2 -translate-y-1/2 justify-between pointer-events-none">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          aria-label="Previous story button"
          className="pointer-events-auto p-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white disabled:opacity-20 transition-all backdrop-blur-md border border-white/10 shadow-lg"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          aria-label="Next story button"
          className="pointer-events-auto p-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all backdrop-blur-md border border-white/10 shadow-lg"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>
    </div>
  );
}
