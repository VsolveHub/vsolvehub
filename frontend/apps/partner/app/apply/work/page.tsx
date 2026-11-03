import type { Metadata } from "next";

import { ListingStepGuard } from "@/features/application/view/listing-step-guard";
import { ApplicationEditor } from "@/features/application/view/application-editor";
import { AreasStep } from "@/features/application/view/areas-step";
import { WorkStep } from "@/features/application/view/work-step";
import { getWorkCatalog } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Your work" };

/**
 * Trades, job types and service areas on one screen. The server validates them together — a
 * job type must be open in one of the chosen areas — so saving them apart only invited a refusal
 * on the second screen about a choice made on the first.
 */
export default async function WorkPage() {
  const { mainCategories, services } = await getWorkCatalog();

  return (
    <ListingStepGuard redirectTo="/apply/about">
      <ApplicationEditor title="apply.work.pageTitle" description="apply.work.pageDescription">
        <div className="flex flex-col gap-8">
          <WorkStep mainCategories={mainCategories} services={services} />
          <AreasStep />
        </div>
      </ApplicationEditor>
    </ListingStepGuard>
  );
}
