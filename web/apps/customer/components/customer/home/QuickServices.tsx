import Link from "next/link";
import type { CSSProperties } from "react";
import { QUICK_SERVICES } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";

export function QuickServices() {
  return (
    <section className="home-section quick-services">
      <div className="section-header-row">
        <h2 className="home-section-title">Quick Services</h2>
        <Link href="/services" className="section-link">
          View all →
        </Link>
      </div>

      <div className="quick-services__grid">
        {QUICK_SERVICES.map((item) => {
          const isMore = item.id === "all";

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`quick-tile${isMore ? " quick-tile--more" : ""}`}
              style={{ "--tile-color": item.color } as CSSProperties}
            >
              <span className="quick-tile__icon" aria-hidden>
                <ServiceIcon name={item.icon} size={22} color={item.color} />
              </span>
              <span className="quick-tile__label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}