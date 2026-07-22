"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

export function VSmartStories({ stories }: { stories: any[] }) {
  const router = useRouter();
  const [activeStoryIdx, setActiveStoryIdx] = useState<number | null>(null);
  const [activeSlideIdx, setActiveSlideIdx] = useState<number>(0);

  useEffect(() => {
    if (activeStoryIdx === null || !stories || stories.length === 0) return;
    const story = stories[activeStoryIdx]!;
    const timer = setTimeout(() => {
      if (activeSlideIdx < story.slides.length - 1) {
        setActiveSlideIdx((prev) => prev + 1);
      } else {
        if (activeStoryIdx < stories.length - 1) {
          setActiveStoryIdx((prev) => prev! + 1);
          setActiveSlideIdx(0);
        } else {
          setActiveStoryIdx(null);
        }
      }
    }, 4500);
    return () => clearTimeout(timer);
  }, [activeStoryIdx, activeSlideIdx]);

  const activeStory = activeStoryIdx !== null && stories ? stories[activeStoryIdx] : null;

  return (
    <div className="w-full" aria-label="Smart stories">
      {/* Section header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-gray-900">V Smart Stories</h2>
          <p className="mt-1 text-sm text-gray-500">Quick updates and curated inspiration for your home.</p>
        </div>
        <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-[11px] font-bold text-yellow-700">
          🪙 Rewards inside
        </span>
      </div>

      {/* Story cards — tall, full bleed images */}
      <div className="flex overflow-x-auto gap-4 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory hide-scrollbar">
        {stories?.map((group, idx) => (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            key={group.id}
            type="button"
            onClick={() => {
              setActiveStoryIdx(idx);
              setActiveSlideIdx(0);
            }}
            className="relative shrink-0 snap-start overflow-hidden rounded-3xl focus:outline-none"
            style={{ width: "220px", height: "280px" }}
          >
            {/* Background image */}
            <div
              className="absolute inset-0"
              style={{
                background: group.iconBg?.startsWith("url")
                  ? group.iconBg
                  : `url('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

            {/* Bottom content — icon + title */}
            <div className="absolute bottom-0 left-0 right-0 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-yellow-400 shadow-lg">
                <FlaticonIcon name={group.icon} size={20} color="#000" />
              </div>
              <p className="text-base font-black leading-tight text-white">{group.title}</p>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Full-screen story viewer */}
      <AnimatePresence>
        {activeStory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setActiveStoryIdx(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm h-[80vh] max-h-[600px] rounded-[32px] overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="absolute inset-0 z-0"
                style={{
                  background: activeStory.slides[activeSlideIdx].imageBg?.startsWith("url")
                    ? activeStory.slides[activeSlideIdx].imageBg
                    : activeStory.iconBg?.startsWith("url")
                      ? activeStory.iconBg
                      : `url('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-white z-0" />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white z-0" />

              {/* Progress bars */}
              <div className="absolute top-4 left-4 right-4 flex gap-1 z-20">
                {activeStory.slides.map((_: any, sIdx: number) => (
                  <div key={sIdx} className="h-1 flex-1 bg-black/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: sIdx < activeSlideIdx ? "100%" : "0%" }}
                      animate={{ width: sIdx < activeSlideIdx ? "100%" : sIdx === activeSlideIdx ? "100%" : "0%" }}
                      transition={{ duration: sIdx === activeSlideIdx ? 4.5 : 0, ease: "linear" }}
                      className="h-full bg-black/60 rounded-full"
                    />
                  </div>
                ))}
              </div>

              {/* Header info */}
              <div className="absolute top-8 left-4 right-4 flex items-center gap-3 z-20">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-md bg-yellow-400">
                  <FlaticonIcon name={activeStory.icon} size={18} color="#000" />
                </div>
                <span className="text-[15px] font-black text-white drop-shadow-md">{activeStory.title}</span>
                <button
                  type="button"
                  className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors backdrop-blur-md"
                  onClick={() => setActiveStoryIdx(null)}
                  aria-label="Close stories"
                >
                  &times;
                </button>
              </div>

              {/* Main content */}
              <div className="flex-1 flex flex-col justify-end p-8 pb-24 z-10">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSlideIdx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h3 className="text-2xl font-black text-gray-900 leading-tight mb-3">
                      {activeStory.slides[activeSlideIdx].title}
                    </h3>
                    <p className="text-sm text-gray-700 font-medium leading-relaxed">
                      {activeStory.slides[activeSlideIdx].desc}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer CTA */}
              <div className="absolute bottom-0 left-0 w-full p-6 z-20 bg-white">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  className="w-full py-4 bg-yellow-400 text-gray-900 rounded-2xl text-[15px] font-black shadow-lg"
                  onClick={() => {
                    setActiveStoryIdx(null);
                    router.push(activeStory.ctaHref);
                  }}
                >
                  {activeStory.ctaText} →
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
