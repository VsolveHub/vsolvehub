"use client";

import { useEffect, useState } from "react";
import { HERO_SLIDES } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";

export function HeroBanner() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const slide = HERO_SLIDES[active];

  return (
    <section className="hero-banner">
      <div className="hero-banner-card">
        <div className="hero-banner-text">
          <h2>
            {slide.title}
            <br />
            <span>{slide.highlight}</span>
          </h2>
        </div>
        <div className="hero-banner-visual">
          <div className="hero-phone">
            <span className="hero-phone-logo">V</span>
          </div>
          <div className="hero-orbit">
            {slide.icons.map((icon, i) => (
              <span key={i} className="hero-orbit-icon" style={{ "--i": i } as Record<string, number>}>
                <ServiceIcon name={icon} size={16} color="#ffffff" />
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="hero-dots">
        {HERO_SLIDES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`hero-dot ${i === active ? "active" : ""}`}
            onClick={() => setActive(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
