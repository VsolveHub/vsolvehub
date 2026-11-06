import type { Metadata } from "next";
import Link from "next/link";

import { CustomerRecord } from "@/features/customers/view/customer-record";

export const metadata: Metadata = { title: "Customer", robots: { index: false, follow: false } };

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <Link href="/operations/customers" className="text-sm font-semibold text-text-link hover:underline">
        ← All customers
      </Link>
      <CustomerRecord customerId={customerId} />
    </div>
  );
}
