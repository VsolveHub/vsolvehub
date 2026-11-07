import type { Metadata } from "next";
import { PageHeader } from "@vsolve/ui";

import { CustomerDirectory } from "@/features/customers/view/customer-directory";

export const metadata: Metadata = { title: "Customers", robots: { index: false, follow: false } };

export default function CustomersPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <PageHeader
        title="Customers"
        description="Find a customer by mobile number or name, then see their bookings, money and cases."
      />
      <CustomerDirectory />
    </div>
  );
}
