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
    <div className="plans-split-layout">
      <div className="plans-split-left">
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
      </div>
      <div className="plans-split-right">
        <div className="plans-promo-card">
          <img src="/basic_home_cleaning_hd.jpg" alt="Premium Home Services" className="plans-promo-image" />
          <div className="plans-promo-content">
            <h3>V Solve Plus Membership</h3>
            <p>Unlock exclusive 15% discounts and unlimited priority bookings on all your recurring plans.</p>
            <Link href="/profile/membership" className="plans-promo-btn">Explore Benefits</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WalletSection() {
  return (
    <div className="profile-panel-stack">
      <section className="wallet-premium-card">
        <div className="wallet-premium-header">
          <span className="wallet-label">Available Balance</span>
          <span className="wallet-icon">💳</span>
        </div>
        <p className="wallet-amount">{formatPrice(WALLET_BALANCE_PAISE)}</p>
        <button type="button" className="wallet-add-btn">
          Add Money +
        </button>
      </section>

      <section className="wallet-tx-section">
        <h2 className="wallet-tx-title">Recent Transactions</h2>
        <div className="wallet-tx-list">
          {WALLET_TRANSACTIONS.map((tx) => (
            <div key={tx.id} className="wallet-tx-item">
              <div className="wallet-tx-info">
                <div className={`wallet-tx-icon ${tx.type === "credit" ? "credit" : "debit"}`}>
                  {tx.type === "credit" ? "↓" : "↑"}
                </div>
                <div>
                  <p className="wallet-tx-label">{tx.label}</p>
                  <p className="wallet-tx-date">{tx.date}</p>
                </div>
              </div>
              <span className={`wallet-tx-amount ${tx.type === "credit" ? "credit" : "debit"}`}>
                {tx.type === "credit" ? "+" : "-"}
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
    <div className="membership-split-layout">
      <div className="membership-left">
        <section className="membership-premium-card">
          <div className="membership-badge-glow">V SOLVE HUB PLUS</div>
          <h2 className="membership-title">Unlock Exclusive Benefits</h2>
          <p className="membership-subtitle">₹299/month · Cancel anytime</p>
          
          <ul className="membership-benefits-list">
            {MEMBERSHIP_BENEFITS.map((benefit) => (
              <li key={benefit}>
                <span className="membership-check">✨</span>
                {benefit}
              </li>
            ))}
          </ul>
          
          <button type="button" className="membership-join-btn">
            Join Plus Membership
          </button>
        </section>
      </div>
      <div className="membership-right">
        <div className="membership-promo-image-wrapper">
          <img src="/basic_home_cleaning_hd.jpg" alt="V Solve Plus" className="membership-promo-image" />
          <div className="membership-image-overlay">
            <p>Experience true luxury home services.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RatingSection({ bookingCount }: { bookingCount: number }) {
  const rating = getCustomerRating(bookingCount);

  return (
    <div className="profile-panel-stack">
      <section className="rating-premium-card">
        <div className="rating-glow-wrapper">
          <span className="rating-star-icon">⭐</span>
        </div>
        <h2 className="rating-score">{rating.score.toFixed(2)}</h2>
        <p className="rating-subtitle">Your rating as a customer on V Solve Hub</p>
      </section>

      <section className="rating-stats-grid">
        <div className="rating-stat-card">
          <span className="stat-label">Reviews given</span>
          <span className="stat-value">{rating.reviewsGiven}</span>
        </div>
        <div className="rating-stat-card">
          <span className="stat-label">Compliments received</span>
          <div className="stat-pill-list">
            {rating.compliments.map(c => (
              <span key={c} className="stat-pill">{c}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="rating-tips-card">
        <h2 className="rating-tips-title">Tips to keep a high rating</h2>
        <ul className="rating-tips-list">
          <li>
            <span className="tip-icon">🕒</span>
            <p>Be available at the booked slot time</p>
          </li>
          <li>
            <span className="tip-icon">🔑</span>
            <p>Provide clear site access and requirements</p>
          </li>
          <li>
            <span className="tip-icon">📝</span>
            <p>Rate professionals after each completed job</p>
          </li>
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
