import type { Metadata } from "next";

import { WorkItemsBoard } from "@/features/m2-work-items/view/work-items-board";

export const metadata: Metadata = {
  title: "Work items",
  robots: { index: false, follow: false },
};

export default function WorkItemsPage() {
  return (
    <div className="mt-6">
      <WorkItemsBoard />
    </div>
  );
}
