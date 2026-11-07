import type { Metadata } from "next";

import { CommercialPolicyWorkspace } from "@/features/commercial-policy/view/commercial-policy-workspace";
import { RentalPlatformFeeForm } from "@/features/moderation/rental-platform-fee";

export const metadata: Metadata = {
  title: "Commission and tax",
  robots: { index: false, follow: false },
};

/** Every fee the platform charges, on one page, so a pricing change has one place to look. */
export default function CommercialPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-900">Commission and tax</h1>
        <p className="mt-1 text-sm text-text-secondary">What the platform charges, by service.</p>
      </header>

      <section aria-labelledby="crew-project-fees" className="flex flex-col gap-4">
        <div>
          <h2 id="crew-project-fees" className="text-lg font-bold text-navy-900">
            Crew and project jobs
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Every change is a new version with a Finance approval reference.
          </p>
        </div>
        <CommercialPolicyWorkspace />
      </section>

      <section aria-labelledby="rental-fees" className="flex flex-col gap-4">
        <h2 id="rental-fees" className="text-lg font-bold text-navy-900">
          Rentals
        </h2>
        <RentalPlatformFeeForm />
      </section>
    </div>
  );
}
