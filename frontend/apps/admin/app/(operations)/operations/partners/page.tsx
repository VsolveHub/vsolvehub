import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Button } from "@vsolve/ui";

import { PartnersWorkspace } from "@/features/partners/view/partners-workspace";

export const metadata: Metadata = { title: "All partners" };

export default function PartnersPage() {
  return (
    <div className="-my-6 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="shrink-0 px-4 py-6 sm:px-0 flex justify-between items-start">
        <PageHeader
          title="Partners"
          description="Find a Partner and read their record — application details, skills, coverage and history."
        />
        <Link href="/operations/partners/import">
          <Button>Import Partners</Button>
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-0">
        <PartnersWorkspace />
      </div>
    </div>
  );
}
