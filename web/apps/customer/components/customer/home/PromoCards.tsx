"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PROMO_CARDS } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";

type PromoCardData = (typeof PROMO_CARDS)[number];

const PROMO_SLIDES: PromoCardData[][] = [
  PROMO_CARDS.slice(0, 2),
  PROMO_CARDS.slice(2, 4),
];

function PromoCard({ card }: { card: PromoCardData }) {
  return (
    <Link
      href={card.href}
      className="promo-card"
      style={{ background: card.bg }}
    >
      <div className="promo-card-content">
        <h3>{card.title}</h3>
        <span className="promo-cta" style={{ background: card.btnColor }}>
          {card.cta}
        </span>
      </div>
      <span className="promo-icon-wrap">
        <ServiceIcon name={card.icon} size={40} color={card.btnColor} />
      </span>
    </Link>
  );
}

export function PromoCards() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % PROMO_SLIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="promo-carousel" aria-label="Promotions">
      <div
        className="promo-carousel-track"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {PROMO_SLIDES.map((slide) => (
          <div key={slide.map((c) => c.id).join("-")} className="promo-scroll promo-scroll-pair">
            {slide.map((card) => (
              <PromoCard key={card.id} card={card} />
            ))}
          </div>
        ))}
      </div>
      <div className="promo-carousel-dots">
        {PROMO_SLIDES.map((slide, i) => (
          <button
            key={slide.map((c) => c.id).join("-")}
            type="button"
            className={`hero-dot ${i === active ? "active" : ""}`}
            onClick={() => setActive(i)}
            aria-label={`Show promo slide ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
