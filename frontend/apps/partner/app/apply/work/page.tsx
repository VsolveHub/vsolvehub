import type { Metadata } from "next";

import { getWorkCatalog } from "@/features/catalog/queries";
import { ApplicationEditor } from "@/features/application/view/application-editor";
import { WorkStep } from "@/features/application/view/work-step";

export const metadata: Metadata = { title: "Your work" };

/**
 * Bookable services come from the public catalog, so they are read during server
 * rendering and handed down as props — they are identical for every applicant
 * and need no session.
 *
 * Trades are no longer derived here. `WorkStep` reads them from
 * `GET /api/v1/partner/skills/`, which is authenticated reference data and
 * belongs on the client alongside the applicant's own answers.
 */
export default async function WorkPage() {
  const { mainCategories, services } = await getWorkCatalog();

  return (
    <ApplicationEditor
      title="Your work"
      description="Pick the trades you are qualified for and the jobs you are willing to take."
    >
      <WorkStep mainCategories={mainCategories} services={services} />
    </ApplicationEditor>
  );
}
