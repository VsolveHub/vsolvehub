import { WHY_CHOOSE } from "@/lib/catalog/display-catalog";
import { ServiceIcon } from "@/components/ui/ServiceIcons";

export function WhyChoose() {
  return (
    <section className="home-section">
      <h2 className="home-section-title why-title">Why Choose V Solve Hub?</h2>
      <div className="why-choose-scroll">
        {WHY_CHOOSE.map((item) => (
          <div key={item.label} className="why-choose-card">
            <span className="why-icon">
              <ServiceIcon name={item.icon} size={28} color={item.color} />
            </span>
            <span className="why-label">{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
