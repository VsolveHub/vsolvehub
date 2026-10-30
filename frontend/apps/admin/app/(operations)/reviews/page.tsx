import type { Metadata } from "next";
import Link from "next/link";
import { Button, PageHeader } from "@vsolve/ui";
import { Users } from "lucide-react";
import { ReviewsWorkspace } from "@/features/partner-review/view/reviews-workspace";

export const metadata: Metadata = { title: "Partner applications" };

/**
 * Partner application review.
 *
 * Queue and detail side by side on a wide screen, stacked on a narrow one. The
 * selected id lives in component state rather than the URL for now: a reviewer's
 * queue position is not something to share or bookmark, and putting an
 * application id in a shareable link is a small invitation to pass one around
 * outside the audited reveal flow.
 */
export default function ReviewsPage() {
  return (
    <div className="-my-6 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col">
      <div className="shrink-0 px-4 py-6 sm:px-0 flex flex-wrap justify-between items-start gap-4">
        <PageHeader
          title="Partner applications"
          description="Verify partner KYC documents, inspect capabilities and trade coverage, request corrections, or approve partners to take work."
        />
        <div className="flex items-center gap-2">
          <Link href="/operations/partners">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>All partners directory</span>
            </Button>
          </Link>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-0">
        <ReviewsWorkspace />
      </div>
    </div>
  );
}

