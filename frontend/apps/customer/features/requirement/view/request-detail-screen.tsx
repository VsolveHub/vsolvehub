"use client";

import { isFreelyEditable } from "@vsolve/query";
import { buttonStyles, formatMoney } from "@vsolve/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useQuoteTeasers } from "@/features/access/queries";
import { RequestAccessPanel } from "@/features/access/view/request-access-panel";
import { useAddresses } from "@/features/addresses/queries";
import { useEngagements } from "@/features/engagement/queries";
import { toEngagementLists } from "@/features/engagement/adapters";
import {
  bookCrewFeeHref,
  engagementHref,
  engagementReceiptHref,
  requestQuotesHref,
} from "@/lib/routes";
import { toArchetype, toRequestHeader, toServerAttachmentRows, toTimelineEvents } from "../adapters";
import {
  isAlreadyRemoved,
  useRemoveAttachment,
  useRequirement,
  useRequirementTimeline,
} from "../queries";
import { TapRow, TapRowGroup } from "@/components/patterns";

import { RequestAttachments } from "./request-attachments";
import { RequestDetail } from "./request-detail";
import { titleForSlug } from "./my-requests-screen";
import { engagementDestination } from "../model/engagement-redirect";

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

/**
 * "Kondapur — 500084": enough to recognise the place, not the whole line.
 *
 * The rail is a summary beside a status, not a delivery label, and a full
 * Hyderabad address wraps to three lines in a 20rem column. Locality and pincode
 * are what somebody checks when they want to confirm it is the right site.
 */
function addressSummary(
  addresses: readonly { id: string; line1: string; locality: string; city: string; postal_code: string }[],
  addressId: string | null,
): string | null {
  if (addressId === null) return null;
  const address = addresses.find((candidate) => candidate.id === addressId);
  if (address === undefined) return null;
  const locality = address.locality || address.city;
  const place = [address.line1, locality].filter((part) => part.trim() !== "").join(", ");
  return place === "" ? address.postal_code : `${place} - ${address.postal_code}`;
}

/**
 * The start day, in the Customer's own locale.
 *
 * `requested_start` is a date-time built from the start of their chosen local
 * day, so only the day is meaningful — printing a time would present midnight as
 * an arrival time somebody agreed to.
 */
function formatStartDay(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatSentDay(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function budgetLabel(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise === null && maxPaise === null) return null;
  if (minPaise === null && maxPaise !== null) return `Up to ${formatMoney(maxPaise)}`;
  if (minPaise !== null && maxPaise === null) return `From ${formatMoney(minPaise)}`;
  if (minPaise === maxPaise) return formatMoney(minPaise!);
  return `${formatMoney(minPaise!)} - ${formatMoney(maxPaise!)}`;
}

/**
 * Whether two labels are the same words, ignoring case, hyphens and spacing.
 *
 * The heading and the service name come from different fields that describe one
 * thing, and they agree far more often than they differ — `category_slug`
 * de-slugged is usually the service name with the hyphens turned into spaces.
 * Comparing the letters is what lets the subtitle carry the service only when it
 * is genuinely telling the reader something the heading did not.
 */
function isSameWords(a: string, b: string): boolean {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalise(a) === normalise(b);
}

export function RequestDetailScreen({ requirementId }: RequestDetailScreenProps) {
  const router = useRouter();
  const requirementQuery = useRequirement(requirementId);
  const timelineQuery = useRequirementTimeline(requirementId);
  const removeAttachment = useRemoveAttachment();

  const draft = requirementQuery.data ?? null;
  useEffect(() => {
    const destination = engagementDestination(draft?.engagement_id ?? null);
    if (destination !== null) {
      router.replace(destination);
    }
  }, [draft?.engagement_id, router]);
  const teasersQuery = useQuoteTeasers(
    requirementId,
    draft !== null && !isFreelyEditable(draft.status),
  );
  const timeline = timelineQuery.data;
  const timelineEvents = timeline === undefined ? [] : toTimelineEvents(timeline);

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

  /**
   * The two request facts the A3 waiting rail shows beside the search.
   *
   * Resolved here because this is where the requirement is already read. The
   * address is an id on the record, so it is looked up in the address book the
   * session has usually already loaded; a request pointing at an address this
   * Customer can no longer see renders as absent rather than as a broken row.
   */
  const addresses = useAddresses(draft !== null);
  const requestFacts = {
    addressLine: addressSummary(addresses.data ?? [], draft?.address_id ?? null),
    startsOn: formatStartDay(draft?.service_by ?? null),
  };
  const budget = budgetLabel(draft?.budget_min_paise ?? null, draft?.budget_max_paise ?? null);
  const submittedAt =
    timelineEvents.find((event) => event.type === "REQUIREMENT_SUBMITTED")?.at ?? null;
  const sentDay = formatSentDay(submittedAt);

  /**
   * The line under the heading.
   *
   * Assembled here because this is the only layer holding the requirement
   * record — `RequestRowView` is the tracking projection and carries neither the
   * service name nor the address. Parts that are absent are dropped rather than
   * defaulted: a subtitle reading "· — ·" says less than a shorter one.
   */
  const subtitle =
    draft === null
      ? null
      : [
          // The heading is `titleForSlug(category_slug)` and the service name is
          // the same words with different punctuation — "Interior fit out
          // project" over "Interior fit-out project". Printing both put the
          // title twice, once as a heading and once as its own subtitle, so the
          // service name is dropped when it adds nothing.
          isSameWords(draft.service_name, titleForSlug(draft.category_slug))
            ? null
            : draft.service_name,
          sentDay === null ? null : `sent ${sentDay}`,
        ]
          .filter(Boolean)
          .join(" · ") || null;

  /**
   * The facts, as rows.
   *
   * Only two, and both are real: where the work is, and the day it was asked
   * for. There is deliberately no budget row — `Requirement` publishes no budget
   * field, and a row reading "Not set" for something the Customer was never
   * asked would be an invented fact dressed as a missing one. Attachments are
   * not a row either; `RequestAttachments` below renders them properly, and a
   * count above it would be the same fact said twice.
   */
  const facts =
    draft === null
      ? []
      : [
          requestFacts.addressLine === null
            ? null
            : { label: "Where", value: requestFacts.addressLine },
          requestFacts.startsOn === null
            ? null
            : { label: "Needed by", value: requestFacts.startsOn },
          budget === null ? null : { label: "Budget you gave", value: budget },
        ].filter((fact): fact is { label: string; value: string } => fact !== null);

  /**
   * The rail's rows: the two things a Customer opens rather than reads.
   *
   * "Change or cancel" appears only while the requirement is genuinely
   * editable. `PATCH` refuses one that has left DRAFT with
   * `m2_requirement_locked`, so offering the row afterwards would be offering a
   * door that answers 409 instead of a useful action.
   */
  const railRows =
    draft === null
      ? []
      : [
          requestFacts.addressLine === null
            ? null
            : {
                label: "Where the work is",
                value: requestFacts.addressLine,
                href: "/account/addresses",
              },
          requestFacts.startsOn === null
            ? null
            : { label: "When you need it", value: `By ${requestFacts.startsOn}` },
          isFreelyEditable(draft.status)
            ? {
                label: "Change or cancel this",
                value: "Sending is free — nothing charged yet",
                href: `/requests/new/${draft.category_slug}`,
              }
            : null,
        ].filter(
          (row): row is { label: string; value: string; href?: string } => row !== null,
        );

  return (
      <RequestDetail
        visualLifecycle={
          draft !== null &&
          draft.status !== "DRAFT" &&
          toArchetype(draft) === "A5_CUSTOM_PROJECT"
        }
        railTop={
          draft === null ? null : (
          <RequestAccessPanel
            slot="rail"
            requirementId={requirementId}
            archetype={toArchetype(draft)}
            quotesHref={requestQuotesHref(requirementId)}
            bookCrewFeeHref={bookCrewFeeHref(requirementId)}
            supportAction={supportAction}
            requestFacts={requestFacts}
            serviceName={draft.service_name}
          />
          )
        }
        railRecords={<BookingRecords requirementId={requirementId} />}
        request={request}
        headerAction={
          (teasersQuery.data?.teasers.length ?? 0) > 0 ? (
            <Link
              href={requestQuotesHref(requirementId)}
              className={buttonStyles({ variant: "outline", className: "w-full sm:w-auto" })}
            >
              Compare Quotes
            </Link>
          ) : undefined
        }
        subtitle={subtitle}
        facts={facts}
        railRows={railRows}
        attachments={
          draft === null ? null : (
            <div className="flex flex-col gap-6">
              {/* The removal affordance the server keeps open in every status,
                  for the one case it keeps it open for: a file the malware scan
                  rejected. See `RequestAttachments`. */}
              <RequestAttachments
                rows={toServerAttachmentRows(draft.attachments)}
                isDraft={isFreelyEditable(draft.status)}
                onRemove={(attachmentId) =>
                  removeAttachment.mutate({ requirementId, attachmentId })
                }
                isRemoving={removeAttachment.isPending}
                // Already gone is the outcome that was asked for, so it is not
                // shown as a failure — the refetch that follows drops the row.
                removeError={
                  removeAttachment.error !== null && !isAlreadyRemoved(removeAttachment.error)
                    ? removeAttachment.error
                    : null
                }
              />

            </div>
          )
        }
        isRequestPending={requirementQuery.isPending}
        requestError={requirementQuery.error}
        events={timelineEvents}
        isTimelinePending={timelineQuery.isPending}
        timelineError={timelineQuery.error}
        onRetryRequest={() => void requirementQuery.refetch()}
        onRetryTimeline={() => void timelineQuery.refetch()}
        supportAction={supportAction}
      >
      {draft !== null ? (
        // Wave A2, extended by A2R. The A3 money surface — the rate-card crew
        // panel or its quote-flow fallback — or the A5 visit tracker, chosen
        // from the server's inferred archetype, and nothing at all for a
        // lifecycle this build has no screens for.
        <RequestAccessPanel
          slot="main"
          requirementId={requirementId}
          archetype={toArchetype(draft)}
          quotesHref={requestQuotesHref(requirementId)}
          bookCrewFeeHref={bookCrewFeeHref(requirementId)}
          supportAction={supportAction}
          requestFacts={requestFacts}
          serviceName={draft.service_name}
        />
      ) : null}
      </RequestDetail>
  );
}

/**
 * What this request has turned into, and where the money record lives.
 *
 * ## Why it is here at all
 *
 * A request that has been accepted stops being only a request: there is an
 * engagement with stages and a funded total, and there is a receipt for what
 * was charged to reach it. Both had addresses and neither had a way in from the
 * one page a Customer actually opens — you got to your own receipt by knowing
 * the URL. This is that way in.
 *
 * ## Why it reads the list rather than the record
 *
 * `GET /engagements/` is one page the Customer has usually already loaded — the
 * Activity hub reads it — so finding this request's engagement in it costs a
 * cache hit rather than a request. The alternative would be a lookup endpoint
 * keyed on the requirement, which does not exist and would not be worth asking
 * for to render two links.
 *
 * ## Why the receipt link is not conditional
 *
 * Whether a receipt exists is on the engagement *detail*, not on the list row,
 * and fetching every engagement's detail to decide whether to show a link would
 * be a request per row to hide one. The receipt page answers honestly when there
 * is nothing yet — "no receipt on this booking, that is normal if nothing has
 * been charged" — which is a better answer than a link that silently is not
 * there.
 */
function BookingRecords({ requirementId }: { requirementId: string }) {
  const query = useEngagements();

  const engagements = (query.data?.pages ?? []).flatMap((page) => page.results);
  const lists = toEngagementLists(engagements);
  const row =
    [...lists.workforce, ...lists.projects].find(
      (candidate) => candidate.requirementId === requirementId,
    ) ?? null;

  // Nothing has been commissioned from this request yet. A card headed "this
  // booking" over an empty state would be describing something that does not
  // exist.
  if (row === null) return null;

  const isProject = row.mode === "managed";

  return (
    <TapRowGroup>
      <TapRow
        label={isProject ? "Your project" : "Your booking"}
        value={
          row.progress.total > 0
            ? `${row.progress.done} of ${row.progress.total} ${isProject ? "stages" : "days"} done`
            : "Open the workspace"
        }
        href={engagementHref(row.engagementId)}
      />
      {/* The funded total is an A5 fact. On `LEAD_ONLY` the answer is always
          zero because V Solve Hub holds nothing, and "Funded ₹0" beside a job
          in progress reads as a failure rather than as the design. */}
      {isProject ? (
        <TapRow
          label="Funded so far"
          value={`${row.fundedTotalLabel} of ${row.stagedTotalLabel}`}
          href={engagementHref(row.engagementId)}
        />
      ) : null}
      <TapRow
        label="Payment receipt"
        value="What you have been charged"
        href={engagementReceiptHref(row.engagementId)}
        isLast
      />
    </TapRowGroup>
  );
}
