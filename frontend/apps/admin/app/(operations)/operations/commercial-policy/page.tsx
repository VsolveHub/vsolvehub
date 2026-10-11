import type { Metadata } from "next";

import { CommercialPolicyWorkspace } from "@/features/commercial-policy/view/commercial-policy-workspace";

export const metadata: Metadata = {
  title: "Commission and tax",
  robots: { index: false, follow: false },
};

export default function CommercialPolicyPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-900">Commission and tax</h1>
        <p className="mt-1 text-sm text-text-secondary">
          How workforce and project jobs are charged. Every change is a new version with a Finance
          approval reference.
        </p>
      </header>
      <CommercialPolicyWorkspace />
    </div>
  );
}
