import type { Metadata } from "next";

import { ListingStepGuard } from "@/features/application/view/listing-step-guard";
import { ApplicationEditor } from "@/features/application/view/application-editor";
import { WorkStep } from "@/features/application/view/work-step";
import { getWorkCatalog } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Your trades" };

export default async function WorkPage() {
  const { mainCategories, services } = await getWorkCatalog();

  return (
    <ListingStepGuard redirectTo="/apply/about">
    <ApplicationEditor
      title="apply.work.pageTitle"
      description="apply.work.pageDescription"
    >
      <WorkStep mainCategories={mainCategories} services={services} />
    </ApplicationEditor>
    </ListingStepGuard>
  );
}
