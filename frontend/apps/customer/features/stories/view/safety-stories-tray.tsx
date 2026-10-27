"use client";

import { useCallback, useEffect, useState } from "react";
import { Play, ShieldCheck } from "lucide-react";

import type { SafetyStoryItem } from "../queries";
import { SafetyStoryViewer } from "./safety-story-viewer";

export type SafetyStoriesTrayProps = {
  initialStories?: SafetyStoryItem[];
};

const VIEWED_STORAGE_KEY = "vsolve_viewed_stories";

export function SafetyStoriesTray({ initialStories = [] }: SafetyStoriesTrayProps) {
  const [stories, setStories] = useState<SafetyStoryItem[]>(initialStories);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Load viewed stories from localStorage once mounted
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEWED_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setViewedIds(new Set(parsed));
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  // Filter out any story that expires on the client clock
  useEffect(() => {
    const filterActive = () => {
      const now = Date.now();
      const active = initialStories.filter(
        (story) => new Date(story.expires_at).getTime() > now,
      );
      setStories(active);
    };

    filterActive();
    // Re-check expiration every 30 seconds
    const interval = setInterval(filterActive, 30_000);
    return () => clearInterval(interval);
  }, [initialStories]);

  const handleOpenStory = (index: number) => {
    setSelectedIndex(index);
    setViewerOpen(true);
  };

  const handleCloseViewer = useCallback(() => {
    setViewerOpen(false);
  }, []);

  const handleStoryViewed = useCallback((storyId: string) => {
    setViewedIds((prev) => {
      if (prev.has(storyId)) return prev;
      const next = new Set(prev).add(storyId);
      try {
        localStorage.setItem(VIEWED_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // Ignore localStorage error
      }
      return next;
    });
  }, []);

  if (!stories || stories.length === 0) {
    return null;
  }

  return (
    <>
      <section
        aria-label="Safety Stories"
        className="w-full my-3 md:my-5"
      >
        <div className="flex items-center justify-between mb-3 px-0.5">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-full bg-[#fdf3ec] text-[#f87000] border border-[#ffc4a0]/40 shadow-2xs">
              <ShieldCheck className="size-4" />
            </span>
            <h2 className="text-base sm:text-lg font-extrabold text-navy-900 tracking-tight">
              Safety Stories
            </h2>
            <span className="inline-block text-[10px] sm:text-[11px] font-extrabold text-[#a94900] bg-[#fdf3ec] px-2.5 py-0.5 rounded-full border border-[#ffc4a0]/50 tracking-wide uppercase">
              24h Updates
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleOpenStory(0)}
            className="text-xs font-bold text-[#f87000] hover:text-[#fb8130] transition-colors"
          >
            Watch all &rarr;
          </button>
        </div>

        {/* Horizontal Story Thumbnail Strip */}
        <div className="flex items-start gap-4 sm:gap-5 overflow-x-auto pb-2 pt-1 px-0.5 scrollbar-none scroll-smooth">
          {stories.map((story, index) => {
            const isViewed = viewedIds.has(story.id);

            return (
              <button
                key={story.id}
                type="button"
                onClick={() => handleOpenStory(index)}
                className="group flex flex-col items-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-full text-left"
                aria-label={`Watch story: ${story.title || "Safety update"}`}
              >
                {/* Circular Thumbnail with VSolve Branded Gradient Ring */}
                <div
                  className={`relative p-[2.5px] rounded-full transition-transform duration-200 group-hover:scale-105 active:scale-95 ${
                    isViewed
                      ? "bg-[#d3ccc0]"
                      : "bg-gradient-to-tr from-[#f87000] via-[#fb8130] to-[#00246b] shadow-xs shadow-orange-500/20"
                  }`}
                >
                  <div className="p-[2px] rounded-full bg-white">
                    <div className="relative size-16 sm:size-20 rounded-full overflow-hidden bg-navy-100 flex items-center justify-center">
                      {story.media_type === "IMAGE" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={story.media_url}
                          alt=""
                          loading="lazy"
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                      ) : (
                        <div className="relative size-full bg-navy-900 flex items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={story.media_url}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover opacity-80"
                          />
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                            <Play className="size-5 text-white fill-white" />
                          </div>
                        </div>
                      )}

                      {/* Video indicator badge */}
                      {story.media_type === "VIDEO" && (
                        <div className="absolute bottom-0 right-0 bg-[#00112e]/90 rounded-full p-1 text-white border border-white/20">
                          <Play className="size-2.5 fill-white text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Story Title */}
                <span
                  className={`w-16 sm:w-20 text-[11px] sm:text-xs text-center line-clamp-1 leading-tight font-extrabold tracking-tight transition-colors mt-1.5 ${
                    isViewed
                      ? "text-text-secondary"
                      : "text-navy-900 group-hover:text-[#f87000]"
                  }`}
                >
                  {story.title || "Safety"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Interactive Story Viewer Modal */}
      <SafetyStoryViewer
        isOpen={viewerOpen}
        stories={stories}
        initialIndex={selectedIndex}
        onClose={handleCloseViewer}
        onStoryViewed={handleStoryViewed}
      />
    </>
  );
}
