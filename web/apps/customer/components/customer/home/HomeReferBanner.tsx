import Link from "next/link";

export function HomeReferBanner() {
  return (
    <section className="home-refer-banner" aria-label="Refer and earn">
      <div>
        <h2>Refer &amp; earn ₹100</h2>
        <p>Invite friends — you both get wallet credit on their first booking.</p>
      </div>
      <Link href="/profile" className="home-refer-btn">
        Refer now
      </Link>
    </section>
  );
}
