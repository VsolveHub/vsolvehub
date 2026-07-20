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
import { Button } from "@/components/ui/Button";
import { Card, CardTitle, Stack } from "@/components/ui/primitives";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

const PANEL_TITLE = "text-base font-bold text-gray-900";

export function HelpSection() {
  return (
    <Stack gap="md">
      <Card className="p-5">
        <h2 className={`mb-3 ${PANEL_TITLE}`}>Contact us</h2>
        <div className="divide-y divide-gray-100">
          {HELP_CONTACT.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="flex items-center justify-between py-3 text-sm transition-colors hover:text-[var(--color-brand)]"
            >
              <span className="font-medium text-gray-600">{item.label}</span>
              <span className="font-semibold text-gray-900">{item.value}</span>
            </a>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className={`mb-3 ${PANEL_TITLE}`}>Frequently asked questions</h2>
        <div className="space-y-4">
          {HELP_FAQ.map((item) => (
            <div key={item.q}>
              <p className="text-sm font-bold text-gray-900">{item.q}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-500">{item.a}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col items-start gap-3 border-[var(--color-brand)]/20 bg-[var(--color-brand-light)] p-5">
        <p className="text-sm font-semibold text-gray-800">
          Need urgent help with an active booking?
        </p>
        <Link
          href="/profile/bookings"
          className="inline-flex items-center justify-center rounded-[10px] bg-[var(--color-brand)] px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-blue-900"
        >
          View my bookings
        </Link>
      </Card>
    </Stack>
  );
}

export function PlansSection() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Stack gap="md">
        <p className="text-sm text-gray-500">
          Subscriptions and repeat service plans. Pause or cancel anytime.
        </p>
        {SERVICE_PLANS.map((plan) => (
          <Card key={plan.id} className="p-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{plan.name}</CardTitle>
              <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-green-700">
                {plan.status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                ["Frequency", plan.frequency],
                ["Next visit", plan.nextVisit],
                ["Price", `${formatPrice(plan.pricePaise)}/visit`],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    {label}
                  </span>
                  <span className="mt-0.5 text-sm font-bold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
        <Link
          href="/services?category=home-services"
          className="inline-flex w-full items-center justify-center rounded-[10px] border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50"
        >
          Browse plans &amp; packages
        </Link>
      </Stack>

      <div className="relative overflow-hidden rounded-3xl shadow-md">
        <img
          src="/basic_home_cleaning_hd.jpg"
          alt="Premium home services"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-brand-dark)]/95 via-[var(--color-brand-dark)]/50 to-transparent" />
        <div className="relative flex h-full min-h-[320px] flex-col justify-end p-6 text-white">
          <h3 className="text-xl font-black">V Solve Plus Membership</h3>
          <p className="mt-2 text-sm text-white/80">
            Unlock exclusive 15% discounts and unlimited priority bookings on all your recurring plans.
          </p>
          <Link
            href="/profile/membership"
            className="mt-4 w-max rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[var(--color-brand)] transition-transform hover:scale-105"
          >
            Explore benefits
          </Link>
        </div>
      </div>
    </div>
  );
}

export function WalletSection() {
  return (
    <Stack gap="md">
      <section className="rounded-3xl bg-gradient-to-br from-[var(--color-brand)] to-[var(--color-brand-dark)] p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white/70">Available balance</span>
          <span className="text-xl">💳</span>
        </div>
        <p className="mt-2 text-4xl font-black">{formatPrice(WALLET_BALANCE_PAISE)}</p>
        <button
          type="button"
          className="mt-5 rounded-xl bg-white/15 px-5 py-2.5 text-sm font-bold backdrop-blur-md transition-colors hover:bg-white/25"
        >
          Add money +
        </button>
      </section>

      <section>
        <h2 className={`mb-3 ${PANEL_TITLE}`}>Recent transactions</h2>
        <Card className="divide-y divide-gray-100 p-0">
          {WALLET_TRANSACTIONS.map((tx) => {
            const credit = tx.type === "credit";
            return (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                      credit ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                    }`}
                  >
                    {credit ? "↓" : "↑"}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{tx.label}</p>
                    <p className="text-xs text-gray-400">{tx.date}</p>
                  </div>
                </div>
                <span className={`text-sm font-black ${credit ? "text-green-600" : "text-gray-900"}`}>
                  {credit ? "+" : "-"}
                  {formatPrice(Math.abs(tx.amountPaise))}
                </span>
              </div>
            );
          })}
        </Card>
      </section>
    </Stack>
  );
}

export function MembershipSection() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-brand-dark)] to-[var(--color-brand)] p-7 text-white shadow-lg">
        <span className="inline-block rounded-full bg-[var(--color-brand-accent)] px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white shadow">
          V Solve Hub Plus
        </span>
        <h2 className="mt-4 text-2xl font-black">Unlock exclusive benefits</h2>
        <p className="mt-1 text-sm text-white/70">₹299/month · Cancel anytime</p>

        <ul className="mt-6 space-y-3">
          {MEMBERSHIP_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm font-medium">
              <span aria-hidden>✨</span>
              {benefit}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="mt-7 w-full rounded-xl bg-white py-3 text-sm font-black text-[var(--color-brand)] transition-transform hover:scale-[1.02]"
        >
          Join Plus membership
        </button>
      </section>

      <div className="relative overflow-hidden rounded-3xl shadow-md">
        <img
          src="/basic_home_cleaning_hd.jpg"
          alt="V Solve Plus"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <p className="absolute bottom-0 p-6 text-lg font-bold text-white">
          Experience true luxury home services.
        </p>
      </div>
    </div>
  );
}

export function RatingSection({ bookingCount }: { bookingCount: number }) {
  const rating = getCustomerRating(bookingCount);

  return (
    <Stack gap="md">
      <section className="flex flex-col items-center rounded-3xl bg-white p-8 text-center shadow-sm">
        <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl">
          ⭐
        </span>
        <h2 className="text-5xl font-black text-gray-900">{rating.score.toFixed(2)}</h2>
        <p className="mt-2 text-sm text-gray-500">Your rating as a customer on V Solve Hub</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Reviews given
          </span>
          <span className="mt-1 block text-2xl font-black text-gray-900">{rating.reviewsGiven}</span>
        </Card>
        <Card className="p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Compliments received
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {rating.compliments.map((c) => (
              <span
                key={c}
                className="rounded-full bg-[var(--color-brand-light)] px-3 py-1 text-xs font-bold text-[var(--color-brand)]"
              >
                {c}
              </span>
            ))}
          </div>
        </Card>
      </section>

      <Card className="p-5">
        <h2 className={`mb-3 ${PANEL_TITLE}`}>Tips to keep a high rating</h2>
        <ul className="space-y-3">
          {[
            ["🕒", "Be available at the booked slot time"],
            ["🔑", "Provide clear site access and requirements"],
            ["📝", "Rate professionals after each completed job"],
          ].map(([icon, text]) => (
            <li key={text} className="flex items-center gap-3 text-sm text-gray-700">
              <span aria-hidden>{icon}</span>
              <p>{text}</p>
            </li>
          ))}
        </ul>
      </Card>
    </Stack>
  );
}

export function PaymentsSection() {
  return (
    <Stack gap="md">
      <p className="text-sm text-gray-500">Saved methods for faster checkout.</p>
      {PAYMENT_METHODS.map((method) => (
        <Card key={method.id} className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{method.label}</CardTitle>
              <p className="mt-0.5 text-sm text-gray-500">{method.detail}</p>
            </div>
            {method.isDefault && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-600">
                Default
              </span>
            )}
          </div>
        </Card>
      ))}
      <Button variant="secondary" block>
        + Add payment method
      </Button>
    </Stack>
  );
}

export function SettingsSection() {
  return <ProfileSettingsForm />;
}

export function AboutSection() {
  return (
    <Stack gap="md">
      <Card className="flex flex-col items-center p-6 text-center">
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-brand)] text-2xl font-black text-white">
          V
        </span>
        <h2 className={PANEL_TITLE}>V Solve Hub</h2>
        <p className="mt-1 text-sm text-gray-500">{ABOUT_INFO.tagline}</p>
      </Card>

      <Card className="p-5">
        <p className="text-sm leading-relaxed text-gray-600">{ABOUT_INFO.description}</p>
      </Card>

      <Card className="p-5">
        <h2 className={`mb-3 ${PANEL_TITLE}`}>Legal &amp; policies</h2>
        <div className="divide-y divide-gray-100">
          {ABOUT_INFO.links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="flex items-center justify-between py-3 text-sm font-medium text-gray-700 transition-colors hover:text-[var(--color-brand)]"
            >
              <span>{link.label}</span>
              <span>→</span>
            </a>
          ))}
        </div>
      </Card>

      <p className="text-center text-xs text-gray-400">Version {ABOUT_INFO.version}</p>
    </Stack>
  );
}
