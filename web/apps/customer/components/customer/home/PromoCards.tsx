"use client";

import Link from "next/link";
import Image from "next/image";
import { PROMO_CARDS } from "@/lib/catalog/display-catalog";

type PromoCardData = (typeof PROMO_CARDS)[number];

function PromoCard({ card }: { card: PromoCardData }) {
  // @ts-ignore - added fields locally in catalog
  const badge = card.badge;
  // @ts-ignore
  const image = card.image;
  // @ts-ignore
  const subtitle = card.subtitle;

  return (
    <Link href={card.href} className="spotlight-card">
      <Image
        src={image || "/ac_illustration.jpg"}
        alt={card.title}
        width={440}
        height={260}
        className="spotlight-bg-img"
      />
      <div className="spotlight-gradient-overlay" />
      
      {badge && (
        <span className={`spotlight-badge ${badge.color}`}>
          {badge.text}
        </span>
      )}

      <div className="spotlight-content-bottom">
        <h3 className="spotlight-title-large">{card.title}</h3>
        <p className="spotlight-subtitle">{subtitle || "Premium services at your home"}</p>
        <span className="spotlight-book-btn">Book now</span>
      </div>
    </Link>
  );
}

export function PromoCards() {
  return (
    <section className="spotlight-section">
      <div className="section-header-row">
        <h2 className="home-section-title">In the spotlight</h2>
      </div>
      <div className="spotlight-scroll">
        {PROMO_CARDS.map((card) => (
          <PromoCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
