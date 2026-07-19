"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HERO_SLIDES } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { HeaderSearchIcon } from "@/components/ui/AppIcons";
import { CategoryGrid } from "./CategoryGrid";

type Category = { slug: string; name: string; icon: string };

export function HeroBanner({ categories = [] }: { categories?: Category[] }) {
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const slide = HERO_SLIDES[active];

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/services?q=${encodeURIComponent(q)}` : "/services");
  }

  return (
    <section className="hero-banner">
      {/* Mobile & Tablet layout (classic banner) */}
      <div className="hero-banner-mobile">
        <div className="hero-banner-card hover-lift">
          <div className="hero-banner-text">
            <p className="hero-banner-eyebrow">Trusted pros · Same-day booking</p>
            <h2>
              {slide.title}
              <br />
              <span>{slide.highlight}</span>
            </h2>
          </div>
          <div className="hero-banner-visual">
            <div className="hero-phone">
              <img src="/logo-mark.png" alt="VSolve Logo" className="hero-phone-logo" />
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
      </div>

      {/* Desktop split layout (Urban Company style) */}
      <div className="hero-banner-desktop">
        <div className="hero-desktop-left">
          <div className="hero-premium-badge">
            ★ PREMIUM HOME SERVICES
          </div>
          
          <h1 className="hero-desktop-title-massive">
            Your Home,<br />
            <span className="text-purple">Elevated.</span>
          </h1>
          
          <p className="hero-desktop-subtitle">
            Experience professional excellence at your doorstep. From smart home installations to premium cleaning, we handle it all.
          </p>
          
          <form className="hero-desktop-search" onSubmit={handleSearch}>
            <span className="search-icon"><HeaderSearchIcon /></span>
            <input 
              type="search" 
              placeholder='Search for "Smart Lock" or "Deep Clean"' 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="search-submit-btn">Search</button>
          </form>

          <div className="hero-desktop-trust-unified">
            <div className="trust-unified-top">
              <span className="unified-label">Trending:</span>
              <Link href="/services/smart-locks" className="unified-pill">🔒 Smart Locks</Link>
              <Link href="/services/plumber" className="unified-pill">🔧 Plumbers</Link>
              <Link href="/services/cleaning" className="unified-pill">🧹 Cleaning</Link>
            </div>
            <div className="trust-unified-bottom">
              <div className="unified-avatars">
                <div className="avatar-group">
                  <img src="/avatar-1.svg" alt="" />
                  <img src="/avatar-2.svg" alt="" />
                  <img src="/avatar-3.svg" alt="" />
                </div>
                <span>5M+ Customers</span>
              </div>
              <div className="unified-divider"></div>
              <div className="unified-features">
                <span>✓ Verified pros</span>
                <span>⚡ Same-day service</span>
                <span>★ 4.8+ rated</span>
              </div>
            </div>
          </div>
        </div>
        <div className="hero-desktop-right">
          <div className="hero-floating-images">
            <div className="floating-img floating-img-1">
              <img src="/cleaner_illustration.jpg" alt="Professional Service" />
            </div>
            <div className="floating-img floating-img-2">
              <img src="/ac_illustration.jpg" alt="Smart Home" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
