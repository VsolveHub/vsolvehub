import Link from "next/link";
import { ServiceIcon } from "@/components/ui/ServiceIcons";
import type { IconName } from "@/components/ui/ServiceIcons";

export function HomeSpotlight() {
  return (
    <div className="home-featured">
      <div className="section-header-row">
        <h2 className="home-section-title">Featured for You</h2>
      </div>
      
      <div className="home-featured-grid">
        {/* Left Column: Large Primary Feature Card */}
        <Link
          href="/services?category=home-services"
          className="featured-main-card"
        >
          <div className="featured-card-badge">🏠 POPULAR</div>
          <div className="featured-card-body">
            <h3>Home Services On Demand</h3>
            <p>Certified electricians, plumbers, carpenters, cleaners, &amp; AC technicians at your door in 30 minutes.</p>
            <span className="featured-card-cta">Book now &rarr;</span>
          </div>
          <div className="featured-card-visual">
            <ServiceIcon name={"house" as IconName} size={110} className="featured-illust" />
          </div>
        </Link>

        {/* Right Column: Vertical Stack of Secondary Cards */}
        <div className="featured-side-stack">
          {/* Top Card: Salon at Home */}
          <Link
            href="/services?category=beauty-wellness"
            className="featured-side-card beauty-theme"
          >
            <div className="side-card-text">
              <h3>Salon at Home</h3>
              <p>Top beauty, salon &amp; spa services</p>
              <span className="side-card-cta">Explore &rarr;</span>
            </div>
            <div className="side-card-icon">
              <ServiceIcon name={"beauty" as IconName} size={48} />
            </div>
          </Link>

          {/* Bottom Card: V Coins & Rewards */}
          <Link
            href="/profile/rating"
            className="featured-side-card rewards-theme"
          >
            <div className="side-card-text">
              <h3>V Coins &amp; Rewards</h3>
              <p>Earn coins, redeem free home visits</p>
              <span className="side-card-cta">Check wallet &rarr;</span>
            </div>
            <div className="side-card-icon rewards-icon">
              <span>🪙</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
