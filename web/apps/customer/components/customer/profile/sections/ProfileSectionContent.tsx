import Link from "next/link";
import { formatPrice } from "@/lib/format";
import {
  ABOUT_INFO,
  getCustomerRating,
  HELP_CONTACT,
  HELP_FAQ,
  MEMBERSHIP_BENEFITS,
  PAYMENT_METHODS,
  SERVICE_PLANS,
  WALLET_BALANCE_PAISE,
  WALLET_TRANSACTIONS,
} from "@/lib/profile/section-data";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export function HelpSection() {
  return (
    <div className="profile-panel-stack">
      <section className="profile-panel">
        <h2 className="profile-panel-title">Contact us</h2>
        <div className="profile-info-list">
          {HELP_CONTACT.map((item) => (
            <a key={item.label} href={item.href} className="profile-info-row profile-info-link">
              <span className="profile-info-label">{item.label}</span>
              <span className="profile-info-value">{item.value}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="profile-panel">
        <h2 className="profile-panel-title">Frequently asked questions</h2>
        <div className="profile-faq-list">
          {HELP_FAQ.map((item) => (
            <div key={item.q} className="profile-faq-item">
              <p className="profile-faq-q">{item.q}</p>
              <p className="profile-faq-a">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="profile-panel profile-panel-highlight">
        <p className="profile-panel-text">Need urgent help with an active booking?</p>
        <Link href="/profile/bookings" className="btn btn-primary btn-sm">
          View my bookings
        </Link>
      </section>
    </div>
  );
}

export function PlansSection() {
  return (
    <div className="profile-panel-stack">
      <p className="profile-panel-intro">
        Subscriptions and repeat service plans. Pause or cancel anytime.
      </p>
      {SERVICE_PLANS.map((plan) => (
        <article key={plan.id} className="profile-panel">
          <div className="profile-panel-row">
            <h2 className="profile-panel-title">{plan.name}</h2>
            <span className="profile-badge profile-badge-active">{plan.status}</span>
          </div>
          <div className="profile-meta-grid">
            <div>
              <span className="profile-meta-label">Frequency</span>
              <span className="profile-meta-value">{plan.frequency}</span>
            </div>
            <div>
              <span className="profile-meta-label">Next visit</span>
              <span className="profile-meta-value">{plan.nextVisit}</span>
            </div>
            <div>
              <span className="profile-meta-label">Price</span>
              <span className="profile-meta-value">{formatPrice(plan.pricePaise)}/visit</span>
            </div>
          </div>
        </article>
      ))}
      <Link href="/services?category=home-services" className="btn btn-secondary btn-block">
        Browse plans &amp; packages
      </Link>
    </div>
  );
}

export function WalletSection() {
  return (
    <div className="profile-panel-stack">
      <section className="profile-panel profile-wallet-balance">
        <span className="profile-meta-label">Available balance</span>
        <p className="profile-wallet-amount">{formatPrice(WALLET_BALANCE_PAISE)}</p>
        <button type="button" className="btn btn-primary btn-sm">
          Add money
        </button>
      </section>

      <section className="profile-panel">
        <h2 className="profile-panel-title">Recent transactions</h2>
        <div className="profile-tx-list">
          {WALLET_TRANSACTIONS.map((tx) => (
            <div key={tx.id} className="profile-tx-row">
              <div>
                <p className="profile-tx-label">{tx.label}</p>
                <p className="profile-tx-date">{tx.date}</p>
              </div>
              <span className={tx.type === "credit" ? "profile-tx-credit" : "profile-tx-debit"}>
                {tx.type === "credit" ? "+" : ""}
                {formatPrice(Math.abs(tx.amountPaise))}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MembershipSection() {
  return (
    <div className="profile-panel-stack">
      <section className="profile-panel profile-membership-hero">
        <span className="profile-membership-badge">V SOLVE HUB PLUS</span>
        <h2 className="profile-panel-title">Unlock exclusive benefits</h2>
        <p className="profile-panel-text">₹299/month · Cancel anytime</p>
      </section>

      <section className="profile-panel">
        <h2 className="profile-panel-title">What you get</h2>
        <ul className="profile-check-list">
          {MEMBERSHIP_BENEFITS.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
      </section>

      <button type="button" className="btn btn-primary btn-block">
        Join Plus membership
      </button>
    </div>
  );
}

export function RatingSection({ bookingCount }: { bookingCount: number }) {
  const rating = getCustomerRating(bookingCount);

  return (
    <div className="profile-panel-stack">
      <section className="profile-panel profile-rating-hero">
        <span className="profile-rating-big">★ {rating.score.toFixed(2)}</span>
        <p className="profile-panel-text">Your rating as a customer on V Solve Hub</p>
      </section>

      <section className="profile-panel">
        <div className="profile-meta-grid">
          <div>
            <span className="profile-meta-label">Reviews given</span>
            <span className="profile-meta-value">{rating.reviewsGiven}</span>
          </div>
          <div>
            <span className="profile-meta-label">Compliments</span>
            <span className="profile-meta-value">{rating.compliments.join(", ")}</span>
          </div>
        </div>
      </section>

      <section className="profile-panel">
        <h2 className="profile-panel-title">Tips to keep a high rating</h2>
        <ul className="profile-bullet-list">
          <li>Be available at the booked slot time</li>
          <li>Provide clear site access and requirements</li>
          <li>Rate professionals after each completed job</li>
        </ul>
      </section>
    </div>
  );
}

export function PaymentsSection() {
  return (
    <div className="profile-panel-stack">
      <p className="profile-panel-intro">Saved methods for faster checkout.</p>
      {PAYMENT_METHODS.map((method) => (
        <article key={method.id} className="profile-panel">
          <div className="profile-panel-row">
            <div>
              <h2 className="profile-panel-title">{method.label}</h2>
              <p className="profile-panel-text">{method.detail}</p>
            </div>
            {method.isDefault && <span className="profile-badge">Default</span>}
          </div>
        </article>
      ))}
      <button type="button" className="btn btn-secondary btn-block">
        + Add payment method
      </button>
    </div>
  );
}

export function SettingsSection() {
  return <ProfileSettingsForm />;
}

export function AboutSection() {
  return (
    <div className="profile-panel-stack">
      <section className="profile-panel profile-about-hero">
        <span className="profile-brand-icon profile-brand-icon-lg">V</span>
        <h2 className="profile-panel-title">V Solve Hub</h2>
        <p className="profile-panel-text">{ABOUT_INFO.tagline}</p>
      </section>

      <section className="profile-panel">
        <p className="profile-panel-text">{ABOUT_INFO.description}</p>
      </section>

      <section className="profile-panel">
        <h2 className="profile-panel-title">Legal &amp; policies</h2>
        <div className="profile-info-list">
          {ABOUT_INFO.links.map((link) => (
            <a key={link.label} href={link.href} className="profile-info-row profile-info-link">
              <span>{link.label}</span>
              <span>→</span>
            </a>
          ))}
        </div>
      </section>

      <p className="profile-version">Version {ABOUT_INFO.version}</p>
    </div>
  );
}
