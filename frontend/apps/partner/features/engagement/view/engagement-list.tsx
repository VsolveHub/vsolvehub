"use client";

import { Card, EmptyState, ErrorState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import {
  describeError,
  groupEngagements,
  isEngagementNotFound,
  type Engagement,
  type EngagementBucket,
} from "@vsolve/query";
import { CalendarCheck } from "lucide-react";
import { useMemo } from "react";

import { usePartnerEngagements } from "../queries";
import type { StageWording } from "../model/engagement-copy";
import { EngagementCard } from "./engagement-card";

/**
 * The vendor's engagement list for one workspace.
 *
 * `M2-FE-501` (workforce) and `M2-FE-601` (projects). One component, two bucket
 * vocabularies, because there is one spine — the difference between a shift-day
 * list and a stage list is which nouns and which groups, not which code.
 *
 * Seven states, all reachable, none faked: loading · empty · forbidden · server
 * error · offline · truncated · populated. Plus two this screen adds and the
 * enquiry inbox does not: a **bucket nothing can fill** and a **row nothing can
 * file**.
 *
 * ## Why the split is by `commercial_mode` and not by `archetype`
 *
 * `GET /engagements/` returns every engagement this vendor is performing, across
 * both lifecycles, and takes no archetype filter. The two workspaces are separate
 * places, so each shows its own — and the field that separates them is
 * `commercial_mode`, a published enum, rather than `archetype`, an unconstrained
 * string. That is two server values being compared, not a lifecycle inferred from
 * a category or a profession. An engagement whose mode this build has no
 * workspace for is dropped for the same reason an unknown workspace key renders
 * nothing: there are no screens behind it.
 *
 * ## Truncation is stated, never silent
 *
 * The endpoint is cursor-paginated at twenty rows. `m2_engagement_list` publishes
 * a `cursor` parameter, and this build does not thread it yet — so a vendor with
 * more than twenty engagements would be shown a list that looks complete. The
 * notice below is the honest alternative.
 */

export interface EngagementListProps<Key extends string> {
  readonly buckets: readonly EngagementBucket<Key>[];
  readonly bucketFor: (engagement: Engagement) => Key | null;
  /** Which mode belongs in this workspace. */
  readonly commercialMode: Engagement["commercial_mode"];
  readonly wording: StageWording;
  /** What a customer buys here, for the empty state. */
  readonly workLabel: string;
}

export function EngagementList<Key extends string>({
  buckets,
  bucketFor,
  commercialMode,
  wording,
  workLabel,
}: EngagementListProps<Key>) {
  const query = usePartnerEngagements();

  const mine = useMemo(
    () => (query.data?.results ?? []).filter((row) => row.commercial_mode === commercialMode),
    [query.data, commercialMode],
  );

  const grouping = useMemo(
    () => groupEngagements(mine, buckets, bucketFor),
    [mine, buckets, bucketFor],
  );

  if (query.isPending) {
    return (
      <SkeletonRegion loading label={`Loading your ${wording.parentMany}`}>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </SkeletonRegion>
    );
  }

  if (query.isError) {
    const presentation = describeError(query.error, "read");
    const refused = isEngagementNotFound(query.error);
    return (
      <ErrorState
        title={presentation.title}
        message={
          refused
            ? `Vsolve has no ${wording.parentMany} on this account. If you were working a moment ago, your access may have changed — contact support.`
            : presentation.message
        }
        severity={presentation.severity}
        // A refused read does not offer a retry: asking again walks into the same
        // refusal and delays the honest screen.
        actionLabel={refused ? undefined : "Try again"}
        onAction={refused ? undefined : () => void query.refetch()}
        reference={presentation.reference}
      />
    );
  }

  if (mine.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck size={24} aria-hidden />}
        title={`No ${wording.parentMany} yet`}
        description={`When a customer chooses your quote for ${workLabel} and it is confirmed, the ${wording.parent} appears here with its ${wording.many}.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {grouping.groups.map(({ bucket, engagements }) => {
        // A bucket nothing can fill still renders — that is the whole point of
        // `derivable: false`. A bucket that simply has nothing in it today does
        // not, because an empty heading on every screen is noise.
        if (!bucket.derivable) {
          return <UnfillableBucket key={bucket.key} bucket={bucket} />;
        }
        if (engagements.length === 0) return null;

        return (
          <section key={bucket.key} aria-labelledby={`engagements-${bucket.key}`}>
            <h2
              id={`engagements-${bucket.key}`}
              className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted"
            >
              {bucket.label}
            </h2>
            <p className="mb-2 text-xs text-text-secondary">{bucket.description}</p>
            <div className="flex flex-col gap-2">
              {engagements.map((engagement) => (
                <EngagementCard
                  key={engagement.id}
                  engagement={engagement}
                  wording={wording}
                />
              ))}
            </div>
          </section>
        );
      })}

      {grouping.unplaceable.length === 0 ? null : (
        <section aria-labelledby="engagements-unplaceable">
          <h2
            id="engagements-unplaceable"
            className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted"
          >
            Not recognised
          </h2>
          <p className="mb-2 text-xs text-text-secondary">
            Vsolve sent a state this version of the app cannot describe. These are shown rather
            than hidden — they are still yours, and guessing which group they belong in could put
            a finished {wording.parent} under &ldquo;coming up&rdquo; or the other way round.
            Updating the app usually resolves it.
          </p>
          <div className="flex flex-col gap-2">
            {grouping.unplaceable.map((engagement) => (
              <EngagementCard
                key={engagement.id}
                engagement={engagement}
                wording={wording}
              />
            ))}
          </div>
        </section>
      )}

      {query.data?.next === null ? null : (
        <Card className="p-4 text-sm leading-6 text-text-secondary">
          Vsolve is holding older {wording.parentMany} that this screen cannot ask for yet. Nothing
          is missing from the groups above; there is simply more behind them.
        </Card>
      )}
    </div>
  );
}

/**
 * A group the product promises and no published field can fill.
 *
 * Rendered rather than dropped, and stated rather than left empty. `M2-FE-501`
 * names a crew-needed bucket; crew assignment is Wave C4 and nothing on the wire
 * says which shift-days still need names.
 */
function UnfillableBucket<Key extends string>({
  bucket,
}: {
  readonly bucket: EngagementBucket<Key>;
}) {
  return (
    <section aria-labelledby={`engagements-${bucket.key}`}>
      <h2
        id={`engagements-${bucket.key}`}
        className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted"
      >
        {bucket.label}
      </h2>
      <Card className="border-dashed p-4 text-sm leading-6 text-text-secondary">
        {bucket.unavailableBecause ??
          "This group is not available in this version of the app."}
      </Card>
    </section>
  );
}
