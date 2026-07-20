import Link from "next/link";
import { formatPrice } from "@/lib/format";

type Props = {
  bookings: number;
  saved: number;
  addresses: number;
};

export function ProfileStatsBanner({ bookings, saved, addresses }: Props) {
  const stats = [
    { value: bookings, label: "Bookings" },
    { value: saved, label: "Saved" },
    { value: addresses, label: "Addresses" },
  ];
  return (
    <div className="grid grid-cols-3 divide-x divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col items-center py-4">
          <span className="text-2xl font-black text-gray-900">{s.value}</span>
          <span className="text-xs font-medium text-gray-500">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ProfileBookingsSummary({ count, totalPaise }: { count: number; totalPaise: number }) {
  if (count === 0) return null;
  return (
    <p className="text-sm text-gray-500">
      {count} booking{count !== 1 ? "s" : ""} · {formatPrice(totalPaise)} total spent
    </p>
  );
}

export function ProfileSavedSummary({ count }: { count: number }) {
  return (
    <p className="text-sm text-gray-500">
      {count === 0
        ? "Save services you book often for quick access."
        : `${count} saved service${count !== 1 ? "s" : ""} ready to book.`}
    </p>
  );
}

export function ProfileAddressesSummary({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-2xl">🏡</div>
      <p className="text-sm text-gray-600">
        {count === 0 ? (
          "Add a home or site address for faster booking."
        ) : (
          <span className="font-bold text-gray-900">
            {count} saved address{count !== 1 ? "es" : ""}
          </span>
        )}
      </p>
    </div>
  );
}

export function ProfileEmptyHelp({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] p-5">
      <p className="text-sm font-semibold text-gray-800">{message}</p>
      <Link
        href={href}
        className="inline-flex items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-900"
      >
        {cta}
      </Link>
    </div>
  );
}
