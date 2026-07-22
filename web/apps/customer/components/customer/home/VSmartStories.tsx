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
  }, [activeStoryIdx, activeSlideIdx, stories]);

  const activeStory = activeStoryIdx !== null && stories ? stories[activeStoryIdx] : null;

  function handleNext() {
    if (!activeStory || !stories) return;
    if (activeSlideIdx < activeStory.slides.length - 1) {
      setActiveSlideIdx((prev) => prev + 1);
    } else if (activeStoryIdx !== null && activeStoryIdx < stories.length - 1) {
      setActiveStoryIdx((prev) => prev + 1);
      setActiveSlideIdx(0);
    } else {
      setActiveStoryIdx(null);
    }
  }

  function handlePrev() {
    if (!activeStory || !stories) return;
    if (activeSlideIdx > 0) {
      setActiveSlideIdx((prev) => prev - 1);
    } else if (activeStoryIdx !== null && activeStoryIdx > 0) {
      const prevIdx = activeStoryIdx - 1;
      setActiveStoryIdx(prevIdx);
      setActiveSlideIdx(stories[prevIdx].slides.length - 1);
    }
  }

  return (
    <div className="w-full" aria-label="Smart stories">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-black text-[#0b1c30] tracking-tight">V Smart Stories</h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Quick updates and curated inspiration for your home.</p>
        </div>
        <span className="text-[10px] font-bold text-amber-800 flex items-center gap-1.5 bg-amber-100 px-3 py-1 rounded-full border border-amber-200 animate-pulse shrink-0">
          🪙 Rewards inside
        </span>
      </div>

      <div className="flex overflow-x-auto gap-4 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory hide-scrollbar">
        {stories?.map((group, idx) => (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            key={group.id}
            type="button"
            className="relative w-[140px] h-[200px] rounded-3xl shrink-0 snap-start overflow-hidden shadow-md flex flex-col items-center justify-center p-4 text-center focus:outline-none ring-2 ring-transparent focus:ring-[#ea580c] transition-shadow cursor-pointer"
            style={{ 
              backgroundImage: group.iconBg.startsWith('url') ? group.iconBg : `url('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=400&auto=format&fit=crop')`, 
              backgroundSize: "cover", 
              backgroundPosition: "center" 
            }}
            onClick={() => {
              setActiveStoryIdx(idx);
              setActiveSlideIdx(0);
            }}
          >
            <div className="absolute inset-0 bg-black/50 hover:bg-black/40 transition-colors" />
            
            <div className="relative z-10 flex flex-col items-center gap-3 w-full mt-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.5)]">
                <FlaticonIcon name={group.icon} size={28} color="#000" />
              </div>
              <div className="flex flex-col gap-1 mt-2">
                <span className="text-[13px] font-black text-white leading-tight">{group.title}</span>
                <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">Tap to view</span>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {activeStory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-0 md:p-4" 
            onClick={() => setActiveStoryIdx(null)}
          >
            {/* Desktop Prev Button (Hidden on Mobile) */}
            <button
              type="button"
              className="hidden md:flex fixed left-6 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md items-center justify-center cursor-pointer transition-all border border-white/30 shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              aria-label="Previous story"
            >
              <span className="text-2xl font-black">‹</span>
            </button>

            {/* Desktop Next Button (Hidden on Mobile) */}
            <button
              type="button"
              className="hidden md:flex fixed right-6 top-1/2 -translate-y-1/2 z-40 w-12 h-12 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-md items-center justify-center cursor-pointer transition-all border border-white/30 shadow-lg"
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              aria-label="Next story"
            >
              <span className="text-2xl font-black">›</span>
            </button>

            {/* Main Story Container: Full Screen on Mobile, Centered Modal on Desktop */}
            <motion.div 
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="relative w-full h-full md:h-[85vh] md:max-w-sm md:max-h-[680px] rounded-none md:rounded-[32px] overflow-hidden shadow-2xl flex flex-col bg-black" 
              onClick={(e) => e.stopPropagation()} 
            >
              <div 
                className="absolute inset-0 z-0"
                style={{ 
                  backgroundImage: activeStory.slides[activeSlideIdx].imageBg.startsWith('url') 
                    ? activeStory.slides[activeSlideIdx].imageBg 
                    : activeStory.iconBg.startsWith('url') 
                      ? activeStory.iconBg 
                      : `url('https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop')`,
                  backgroundSize: "cover",
                  backgroundPosition: "center"
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 z-0 pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white z-0 pointer-events-none" />

              {/* Instagram-style Tap Zones for Direct Mobile & Desktop Click Navigation */}
              <div
                className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer"
                onClick={handlePrev}
                aria-label="Previous slide"
              />
              <div
                className="absolute inset-y-0 right-0 w-2/3 z-20 cursor-pointer"
                onClick={handleNext}
                aria-label="Next slide"
              />

              {/* Top progress bars */}
              <div className="absolute top-4 left-4 right-4 flex gap-1 z-30 pointer-events-none">
                {activeStory.slides.map((_: any, sIdx: number) => (
                  <div key={sIdx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: sIdx < activeSlideIdx ? "100%" : "0%" }}
                      animate={{ width: sIdx < activeSlideIdx ? "100%" : sIdx === activeSlideIdx ? "100%" : "0%" }}
                      transition={{ duration: sIdx === activeSlideIdx ? 4.5 : 0, ease: "linear" }}
                      className="h-full bg-white rounded-full"
                    />
                  </div>
                ))}
              </div>

              {/* Header info */}
              <div className="absolute top-8 left-4 right-4 flex items-center gap-3 z-30 pointer-events-none">
                <div className="w-9 h-9 rounded-full flex items-center justify-center shadow-md bg-amber-400">
                  <FlaticonIcon name={activeStory.icon} size={18} color="#000" />
                </div>
                <span className="text-[15px] font-black text-white drop-shadow-md">{activeStory.title}</span>
                <button
                  type="button"
                  className="ml-auto w-8 h-8 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 transition-colors backdrop-blur-md pointer-events-auto cursor-pointer"
                  onClick={() => setActiveStoryIdx(null)}
                  aria-label="Close stories"
                >
                  &times;
                </button>
              </div>

              {/* Main content body */}
              <div className="flex-1 flex flex-col justify-end p-6 pb-24 z-10 pointer-events-none">
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={activeSlideIdx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h3 className="text-2xl font-black text-[#0b1c30] leading-tight mb-2">{activeStory.slides[activeSlideIdx].title}</h3>
                    <p className="text-sm text-slate-700 font-medium leading-relaxed">{activeStory.slides[activeSlideIdx].desc}</p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer action link */}
              <div className="absolute bottom-0 left-0 w-full p-5 z-30 bg-white border-t border-slate-100">
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="button"
                  className="w-full py-3.5 bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-white rounded-xl text-sm font-bold shadow-md shadow-orange-500/20 cursor-pointer"
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
