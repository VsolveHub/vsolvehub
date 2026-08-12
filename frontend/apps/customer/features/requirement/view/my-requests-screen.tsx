"use client";

import { buttonStyles } from "@vsolve/ui";
import Link from "next/link";

import { toRequestRows } from "../adapters";
import { useMyRequests, type RequirementSummary } from "../queries";
import { RequestsList } from "./requests-list";

/**
 * `My requests`, wired — `M2-FE-213`.
 *
 * `RequestsList` was built to take the four things a query gives it, and this
 * is the call site that finally gives them. Nothing in that component changed
 * to make this work, which is the only real evidence the seam was in the right
 * place.
 *
 * ## An empty list and a failed read are decided separately
 *
 * `requests.length === 0` is passed straight through, and `RequestsList` shows
 * the empty state only when `error` is absent. That ordering is the whole rule
 * from `queries.ts`: a dropped connection must never be able to tell a Customer
 * they have never asked for anything.
 */

/**
 * A row's heading, from the only identifier the summary carries.
 *
 * `RequirementSummary` publishes `category_slug` — which is the *service* slug,
 * `variant.service.slug` — and no display name. There is nothing else to title
 * a row with, so the slug is formatted rather than invented: `deep-cleaning`
 * becomes `Deep cleaning`, and a Customer recognises their own request from it
 * plus the lifecycle sentence underneath.
 *
 * It is a formatting of a real value, not a stand-in for a missing one, and the
 * missing display name is logged in the execution plan §7. When the serializer
 * publishes a name this function goes away rather than gaining a lookup table.
 */
export function titleForSlug(categorySlug: string): string {
  const words = categorySlug.replace(/-/g, " ").trim();
  if (words.length === 0) return "Your request";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function MyRequestsScreen() {
  const query = useMyRequests();
  const requests = toRequestRows(query.data ?? [], (summary: RequirementSummary) =>
    titleForSlug(summary.category_slug),
  );

  return (
    <RequestsList
      requests={requests}
      isPending={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      hrefFor={(requirementId) => `/requests/${requirementId}`}
      supportActionFor={() => (
        <Link href="/account/messages" className={buttonStyles({ variant: "outline" })}>
          Talk to us about this
        </Link>
      )}
      startAction={
        <Link href="/requests/new" className={buttonStyles({ variant: "primary" })}>
          Describe a job
        </Link>
      }
    />
  );
}
