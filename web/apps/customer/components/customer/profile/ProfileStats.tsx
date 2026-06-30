import Link from "next/link";
import { formatPrice } from "@/lib/format";

type Props = {
  bookings: number;
  saved: number;
  addresses: number;
};

export function ProfileStatsBanner({ bookings, saved, addresses }: Props) {
  return (
    <div className="profile-stats-banner">
      <div className="profile-stat">
        <span className="profile-stat-value">{bookings}</span>
        <span className="profile-stat-label">Bookings</span>
      </div>
      <div className="profile-stat">
        <span className="profile-stat-value">{saved}</span>
        <span className="profile-stat-label">Saved</span>
      </div>
      <div className="profile-stat">
        <span className="profile-stat-value">{addresses}</span>
        <span className="profile-stat-label">Addresses</span>
      </div>
    </div>
  );
}

export function ProfileBookingsSummary({ count, totalPaise }: { count: number; totalPaise: number }) {
  if (count === 0) return null;
  return (
    <p className="profile-panel-intro">
      {count} booking{count !== 1 ? "s" : ""} · {formatPrice(totalPaise)} total spent
    </p>
  );
}

export function ProfileSavedSummary({ count }: { count: number }) {
  return (
    <p className="profile-panel-intro">
      {count === 0
        ? "Save services you book often for quick access."
        : `${count} saved service${count !== 1 ? "s" : ""} ready to book.`}
    </p>
  );
}

export function ProfileAddressesSummary({ count }: { count: number }) {
  return (
    <p className="profile-panel-intro">
      {count === 0
        ? "Add a home or site address for faster booking."
        : `${count} saved address${count !== 1 ? "es" : ""} on your account.`}
    </p>
  );
}

export function ProfileEmptyHelp({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="profile-panel profile-panel-highlight">
      <p className="profile-panel-text">{message}</p>
      <Link href={href} className="btn btn-primary btn-sm">
        {cta}
      </Link>
    </div>
  );
}
