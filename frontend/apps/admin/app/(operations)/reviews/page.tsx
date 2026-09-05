import { ReviewsWorkspace } from "@/features/partner-review/view/reviews-workspace";

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
    <>

      <ReviewsWorkspace />
    </>
  );
}
