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
const DispatchRecoveryWorkspace = dynamic(
  () =>
    import("@/features/dispatch-recovery/view/dispatch-recovery-workspace").then(
      (m) => m.DispatchRecoveryWorkspace,
    ),
  { loading: TabLoading },
);
const AssistedCheckoutForm = dynamic(
  () => import("@/features/assisted-checkout/view/assisted-checkout-form").then((m) => m.AssistedCheckoutForm),
  { loading: TabLoading },
);
const ManualOfferForm = dynamic(
  () => import("@/features/manual-offer/view/manual-offer-form").then((m) => m.ManualOfferForm),
  { loading: TabLoading },
);
const CompatibilityRulesWorkspace = dynamic(
  () =>
    import("@/features/compatibility-rules/view/compatibility-rules-workspace").then(
      (m) => m.CompatibilityRulesWorkspace,
    ),
  { loading: TabLoading },
);

type HomeTab = "bookings" | "money" | "dispatch" | "book" | "offers" | "rules";

/** Exported so links elsewhere in the console name a tab that exists. */
export const HOME_SERVICE_TABS: readonly WorkspaceTab<HomeTab>[] = [
  { key: "bookings", label: "Bookings", render: () => <HomeBookings /> },
  { key: "money", label: "Money", render: () => <MoneyTab service="home-services" /> },
  { key: "dispatch", label: "Dispatch", render: () => <DispatchRecoveryWorkspace /> },
  {
    key: "book",
    label: "Book for a customer",
    render: () => (
      <div className="max-w-3xl">
        <AssistedCheckoutForm />
      </div>
    ),
  },
  {
    key: "offers",
    label: "Manual offers",
    render: () => (
      <div className="max-w-3xl">
        <ManualOfferForm />
      </div>
    ),
  },
  { key: "rules", label: "Service rules", render: () => <CompatibilityRulesWorkspace /> },
];

/** Fixed-price home-service visits: find any visit, fix dispatch, book for a customer, money. */
export function HomeServicesWorkspace() {
  return (
    <ServiceWorkspace
      title="Home services"
      description="Fixed-price visits: find any booking and act on it, fix dispatch, book on a customer's behalf, and see what the visits earned."
      tabs={HOME_SERVICE_TABS}
    />
  );
}
