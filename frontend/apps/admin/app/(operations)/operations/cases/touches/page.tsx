import type { Metadata } from "next";

import { CasesTabs } from "@/features/m2-cases/view/cases-tabs";
import { TouchConsole } from "@/features/m2-cases/view/touch-console";


export const metadata: Metadata = {
  title: "Touches",
  robots: { index: false, follow: false },
};

/**
 * Operations touches per request (`M2-FE-711`, `GAP-033`, `PLN-07`).
 *
 * The measurement that decides whether the recovery design this whole workspace implements is
 * affordable. It is rendered as a measurement: `within_budget` has three states and gets three
 * renders, and the null one — the owner has set no budget — says exactly that rather than
 * dressing an unset value as a pass or a breach.
 */
export default function TouchesPage() {
  return (
    <>

      <CasesTabs />

      <div className="mt-6">
        <TouchConsole />
      </div>
    </>
  );
}
