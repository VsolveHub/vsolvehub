"use client";

import dynamic from "next/dynamic";

import { ServiceWorkspace, TabLoading, type WorkspaceTab } from "@/features/money/service-workspace";

// Each tab's code is fetched only when that tab is opened, so the page loads with the Bookings
// list alone instead of six screens' worth of JavaScript.
const HomeBookings = dynamic(() => import("./home-bookings").then((m) => m.HomeBookings), {
  loading: TabLoading,
});
const MoneyTab = dynamic(() => import("@/features/money/money-tab").then((m) => m.MoneyTab), {
  loading: TabLoading,
});
const AssistedCheckoutForm = dynamic(
  () => import("@/features/assisted-checkout/view/assisted-checkout-form").then((m) => m.AssistedCheckoutForm),
  { loading: TabLoading },
);
const CompatibilityRulesWorkspace = dynamic(
  () =>
    import("@/features/compatibility-rules/view/compatibility-rules-workspace").then(
      (m) => m.CompatibilityRulesWorkspace,
    ),
  { loading: TabLoading },
);

type HomeTab = "bookings" | "money" | "book" | "rules";

/** Exported so links elsewhere in the console name a tab that exists. */
export const HOME_SERVICE_TABS: readonly WorkspaceTab<HomeTab>[] = [
  { key: "bookings", label: "Bookings", render: () => <HomeBookings /> },
  { key: "money", label: "Money", render: () => <MoneyTab service="home-services" /> },
  {
    key: "book",
    label: "Book for a customer",
    render: () => (
      <div className="max-w-3xl">
        <AssistedCheckoutForm />
      </div>
    ),
  },
  { key: "rules", label: "Service rules", render: () => <CompatibilityRulesWorkspace /> },
];

/**
 * Fixed-price home-service visits: find any visit and act on it (dispatch, offers, cancel and
 * refund live on the visit itself), book for a customer, money and service rules.
 */
export function HomeServicesWorkspace() {
  return (
    <ServiceWorkspace
      title="Home services"
      description="Fixed-price visits: find any booking and act on it, book on a customer's behalf, and see what the visits earned."
      tabs={HOME_SERVICE_TABS}
    />
  );
}
