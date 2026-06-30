import Link from "next/link";
import { HOME_SPOTLIGHTS } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";

export function HomeSpotlight() {
  return (
    <section className="home-section">
      <div className="section-header-row">
        <h2 className="home-section-title">Featured for you</h2>
      </div>
      <div className="home-spotlight-stack">
        {HOME_SPOTLIGHTS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="home-spotlight-card"
            style={{ background: item.bg }}
          >
            <div className="home-spotlight-text">
              <h3>{item.title}</h3>
              <p>{item.subtitle}</p>
              <span className="home-spotlight-cta" style={{ color: item.color }}>
                {item.cta} →
              </span>
            </div>
            <span className="home-spotlight-icon">
              <ServiceIcon name={item.icon} size={36} color={item.color} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
