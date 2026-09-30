import type { Metadata } from "next";

import { VendorPlansWorkspace } from "@/features/vendor-plans/view/vendor-plans-workspace";

export const metadata: Metadata = {
  title: "Vendor subscription plans",
  robots: { index: false, follow: false },
};

export default function VendorPlansOperationsPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Vendor subscription plans</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Configure partner listing plans and extra details per catalog service. Premium
        featured placement stays an add-on on the plan that publishes it.
      </p>
      <VendorPlansWorkspace />
    </>
  );
}
