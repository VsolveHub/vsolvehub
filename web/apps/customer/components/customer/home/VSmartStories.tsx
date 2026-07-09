"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type StorySlide = {
  title: string;
  desc: string;
  imageBg: string;
};

type StoryGroup = {
  id: string;
  title: string;
  icon: string;
  iconBg: string;
  borderGlow: string;
  ctaText: string;
  ctaHref: string;
  slides: StorySlide[];
};

const STORY_DATA: StoryGroup[] = [
  {
    id: "salon",
    title: "Salon Glow",
    icon: "beauty",
    iconBg: "linear-gradient(135deg, #ec4899, #db2777)",
    borderGlow: "from-pink-500 to-rose-600",
    ctaText: "Book Salon At Home",
    ctaHref: "/services?category=beauty-wellness",
    slides: [
      {
        title: "Salon At Your Doorstep",
        desc: "Skip the waiting room. Top-rated artists and stylists arrive in 60 mins.",
        imageBg: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
      },
      {
        title: "Wedding & Party Packages",
        desc: "Stunning makeovers, facials, and hair design. 100% hygienic, single-use products.",
        imageBg: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
      },
    ],
  },
  {
    id: "ac-repair",
    title: "AC Jet Care",
    icon: "ac-unit",
    iconBg: "linear-gradient(135deg, #0ea5e9, #2563eb)",
    borderGlow: "from-sky-400 to-blue-600",
    ctaText: "Book AC Clean",
    ctaHref: "/services?q=ac",
    slides: [
      {
        title: "Jet-Pump AC Cleaning",
        desc: "Enhance cooling efficiency by 40% and lower electricity bills instantly.",
        imageBg: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
      },
      {
        title: "Certified Pro Dispatch",
        desc: "Standard 30-day service warranty. Fast diagnosis and genuine spares.",
        imageBg: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
      },
    ],
  },
  {
    id: "premium-stay",
    title: "Luxury Stays",
    icon: "house",
    iconBg: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
    borderGlow: "from-purple-500 to-indigo-600",
    ctaText: "Explore PGs & Stays",
    ctaHref: "/accommodation",
    slides: [
      {
        title: "Premium PGs & Rooms",
        desc: "Cozy rooms with zero broker fees. Wi-Fi, food, AC, and daily housekeeping.",
        imageBg: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
      },
      {
        title: "Instant Visit Booking",
        desc: "Schedule a physical visit or unlock contact info immediately to book your spot.",
        imageBg: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)",
      },
    ],
  },
  {
    id: "v-coins",
    title: "Rewards",
    icon: "diamond",
    iconBg: "linear-gradient(135deg, #eab308, #ca8a04)",
    borderGlow: "from-yellow-400 to-amber-600",
    ctaText: "View Rewards",
    ctaHref: "/profile/rating",
    slides: [
      {
        title: "V Coins & Free Stays",
        desc: "Earn V Coins on every booking. Use them to redeem free services and stay discounts.",
        imageBg: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
      },
      {
        title: "Refer and Earn ₹100",
        desc: "Invite your friends to book. Get ₹100 cash in wallet instantly on completion.",
        imageBg: "linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)",
      },
    ],
  },
];

export function VSmartStories() {
  const router = useRouter();
  const [activeStoryIdx, setActiveStoryIdx] = useState<number | null>(null);
  const [activeSlideIdx, setActiveSlideIdx] = useState<number>(0);

  useEffect(() => {
    if (activeStoryIdx === null) return;
    const story = STORY_DATA[activeStoryIdx]!;
    const timer = setTimeout(() => {
      if (activeSlideIdx < story.slides.length - 1) {
        setActiveSlideIdx((prev) => prev + 1);
      } else {
        // Go to next story group
        if (activeStoryIdx < STORY_DATA.length - 1) {
          setActiveStoryIdx((prev) => prev! + 1);
          setActiveSlideIdx(0);
        } else {
          // Wrap up / Close modal
          setActiveStoryIdx(null);
        }
      }
    }, 4500);

    return () => clearTimeout(timer);
  }, [activeStoryIdx, activeSlideIdx]);

  const activeStory = activeStoryIdx !== null ? STORY_DATA[activeStoryIdx] : null;

  return (
    <div className="smart-stories" aria-label="Smart stories">
      <div className="section-header-row">
        <h2 className="home-section-title">V Smart Stories</h2>
        <span className="text-[11px] font-bold text-yellow-600 flex items-center gap-1 bg-yellow-50 px-2 py-0.5 rounded-full border border-yellow-100 animate-pulse">
          🪙 Rewards inside
        </span>
      </div>

      <div className="stories-card-scroll">
        {STORY_DATA.map((group, idx) => (
          <button
            key={group.id}
            type="button"
            className="story-bento-card"
            style={{ background: group.iconBg }}
            onClick={() => {
              setActiveStoryIdx(idx);
              setActiveSlideIdx(0);
            }}
          >
            <div className="story-bento-overlay"></div>
            <div className="story-bento-icon">
              <FlaticonIcon name={group.icon} size={28} color="#fff" />
            </div>
            <div className="story-bento-content">
              <span className="story-bento-title">{group.title}</span>
              <span className="story-bento-action">Tap to view</span>
            </div>
          </button>
        ))}
      </div>

      {activeStory && (
        <div className="story-player-overlay" onClick={() => setActiveStoryIdx(null)}>
          <div className="story-player-card" onClick={(e) => e.stopPropagation()} style={{ background: activeStory.slides[activeSlideIdx].imageBg }}>
            {/* Top progress bars */}
            <div className="story-progress-bar">
              {activeStory.slides.map((_, sIdx) => {
                let fillWidth = "0%";
                if (sIdx < activeSlideIdx) fillWidth = "100%";
                else if (sIdx === activeSlideIdx) fillWidth = "100%"; // styled using css transitions

                return (
                  <div key={sIdx} className="story-progress-segment">
                    <div
                      className={`story-progress-fill ${sIdx === activeSlideIdx ? "story-progress-fill--active" : ""}`}
                      style={sIdx < activeSlideIdx ? { width: "100%" } : undefined}
                    />
                  </div>
                );
              })}
            </div>

            {/* Header info */}
            <div className="story-player-header">
              <div className="story-player-avatar" style={{ background: activeStory.iconBg }}>
                <FlaticonIcon name={activeStory.icon} size={14} color="#fff" />
              </div>
              <span className="story-player-author">{activeStory.title}</span>
              <button
                type="button"
                className="story-player-close"
                onClick={() => setActiveStoryIdx(null)}
                aria-label="Close stories"
              >
                &times;
              </button>
            </div>

            {/* Main content body */}
            <div className="story-player-body">
              <div className="story-slide-content">
                <h3 className="story-slide-title">{activeStory.slides[activeSlideIdx].title}</h3>
                <p className="story-slide-desc">{activeStory.slides[activeSlideIdx].desc}</p>
              </div>
            </div>

            {/* Footer action link */}
            <div className="story-player-footer">
              <button
                type="button"
                className="story-cta-btn"
                onClick={() => {
                  setActiveStoryIdx(null);
                  router.push(activeStory.ctaHref);
                }}
              >
                {activeStory.ctaText} →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
