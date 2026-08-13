"use client";

import { isFreelyEditable, isVendorVisible } from "@vsolve/query";
import { buttonStyles } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { RequestAccessPanel } from "@/features/access/view/request-access-panel";
import { toArchetype, toRequestHeader, toServerAttachmentRows, toTimelineEvents } from "../adapters";
import {
  isAlreadyRemoved,
  useRemoveAttachment,
  useRequirement,
  useRequirementTimeline,
} from "../queries";
import { MaterialEditNotice, type MaterialEditStance } from "./material-edit-notice";
import { RequestAttachments } from "./request-attachments";
import { RequestDetail } from "./request-detail";
import { titleForSlug } from "./my-requests-screen";

/**
 * One request, wired — `M2-FE-214`, `M2-FE-215`, `M2-FE-211`.
 *
 * Two reads that fail independently, as `RequestDetail` was built to expect. A
 * timeline that will not load must not be able to hide that the request closed
 * and a refund is owed, so the header and the record each carry their own
 * pending state, their own error and their own retry.
 *
 * ## Where `M2-FE-211` lives, and why it lives here
 *
 * The edit-consequence notice needs one thing: whether professionals have seen
 * this version. That is a fact about server state, which is why the task was
 * blocked until contract 1.21.0 and why it belongs on the page that reads the
 * requirement rather than inside a form that does not.
 *
 * The stance is read from `status` through the two predicates in
 * `@vsolve/query`, never from a status comparison written here — one copy of
 * "which states mean a vendor has seen it", tested on its own.
 */

export interface RequestDetailScreenProps {
  requirementId: string;
}

function stanceFor(status: string): MaterialEditStance {
  if (isFreelyEditable(status)) return "free";
  if (isVendorVisible(status)) return "vendor_visible";
  // Closed, or a status this build does not know. Both mean the same thing for
  // this notice: there is nothing useful to say about editing it, so it says
  // nothing rather than guessing which of the two it is.
  return "closed";
}

export function RequestDetailScreen({ requirementId }: RequestDetailScreenProps) {
  const router = useRouter();
  const requirementQuery = useRequirement(requirementId);
  const timelineQuery = useRequirementTimeline(requirementId);
  const removeAttachment = useRemoveAttachment();

  const draft = requirementQuery.data ?? null;
  const timeline = timelineQuery.data;

  // `toRequestHeader` rather than `toRequestRow`: the detail endpoint answers
  // with the record, not the tracking projection, so the deadline and the quote
  // count are absent and are rendered as absent. The reasoning is on the
  // adapter, where the next person to wonder why the countdown is missing will
  // be looking.
  const request = draft === null ? null : toRequestHeader(draft, titleForSlug(draft.category_slug));

  const supportAction = (
    <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
      Talk to us about this
    </Link>
  );

  return (
    <div>
      <RequestDetail
        request={request}
        isRequestPending={requirementQuery.isPending}
        requestError={requirementQuery.error}
        events={timeline === undefined ? [] : toTimelineEvents(timeline)}
        isTimelinePending={timelineQuery.isPending}
        timelineError={timelineQuery.error}
        onRetryRequest={() => void requirementQuery.refetch()}
        onRetryTimeline={() => void timelineQuery.refetch()}
        supportAction={supportAction}
      />

      {draft !== null ? (
        <div className="mx-auto w-full max-w-2xl px-4 pb-10">
          {/* Wave A2. The A3 unlock or the A5 visit tracker, chosen from the
              server's inferred archetype — never both, and nothing at all for a
              lifecycle this build has no screens for. It sits directly under the
              state notice because "what is happening" and "what it costs" are
              the same question to somebody who just opened this page. */}
          <div className="mb-6">
            <RequestAccessPanel
              requirementId={requirementId}
              archetype={toArchetype(draft)}
              quotesHref={`/requests/${requirementId}/quotes`}
              bookVisitsHref={`/requests/${requirementId}/book-visits`}
              supportAction={supportAction}
            />
          </div>

          {/* The removal affordance the server keeps open in every status, for
              the one case it keeps it open for: a file the malware scan
              rejected. See `RequestAttachments`. */}
          <RequestAttachments
            rows={toServerAttachmentRows(draft.attachments)}
            isDraft={isFreelyEditable(draft.status)}
            onRemove={(attachmentId) =>
              removeAttachment.mutate({ requirementId, attachmentId })
            }
            isRemoving={removeAttachment.isPending}
            // Already gone is the outcome that was asked for, so it is not shown
            // as a failure — the refetch that follows drops the row.
            removeError={
              removeAttachment.error !== null && !isAlreadyRemoved(removeAttachment.error)
                ? removeAttachment.error
                : null
            }
          />

          <MaterialEditNotice
            stance={stanceFor(draft.status)}
            // Only the free path has a command behind it. `PATCH` refuses a
            // requirement that has left DRAFT with `m2_requirement_locked`, so
            // `onConfirmEdit` is deliberately not supplied and the notice
            // renders its explanation and the support route instead of a
            // confirmation that would collect an answer and then fail.
            onEditFreely={
              isFreelyEditable(draft.status)
                ? () => router.push(`/requests/new/${draft.category_slug}`)
                : undefined
            }
            supportAction={supportAction}
          />
        </div>
      ) : null}
    </div>
  );
}
