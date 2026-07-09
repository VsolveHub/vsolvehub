const TRUST_ITEMS = [
  { icon: "✓", label: "Verified pros" },
  { icon: "⚡", label: "Same-day service" },
  { icon: "🔒", label: "Secure payments" },
  { icon: "★", label: "4.8+ rated" },
] as const;

export function HomeTrustStrip() {
  return (
    <div className="home-trust-strip" aria-label="Why trust V Solve Hub">
      {TRUST_ITEMS.map((item) => (
        <span key={item.label} className="home-trust-badge">
          <span aria-hidden>{item.icon}</span>
          {item.label}
        </span>
      ))}
    </div>
  );
}
