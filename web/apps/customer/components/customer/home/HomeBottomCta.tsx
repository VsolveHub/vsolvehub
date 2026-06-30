import Link from "next/link";

export function HomeBottomCta() {
  return (
    <section className="home-bottom-cta">
      <h2>Ready to get started?</h2>
      <p>Browse 850+ doorstep services across Hyderabad &amp; Telangana.</p>
      <div className="home-bottom-cta-actions">
        <Link href="/services" className="btn btn-primary">
          Explore services
        </Link>
        <Link href="/booking/otp?redirect=/profile/bookings" className="btn btn-secondary">
          Track a booking
        </Link>
      </div>
    </section>
  );
}
