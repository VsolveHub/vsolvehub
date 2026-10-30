"use client";

import { Badge, Card, Spinner } from "@vsolve/ui";
import Link from "next/link";

import { maskId } from "@/features/shared/identifiers";

import { useRequestTimeline } from "../queries";
import { ProjectRecovery } from "./project-recovery";
import { RecoveryActions } from "./recovery-actions";
import { RequestTimelineView } from "./request-timeline";

/**
 * One request: its history, then what can be done about it.
 *
 * The timeline sits above the actions on purpose. Every command here takes a
 * required reason and lands on that timeline, and the order of the page is the
 * order of the job — read what happened, then decide.
 *
 * ## The recovery panel waits for the archetype
 *
 * Both halves read the same cached timeline entry, so this is one request over
 * the wire. The panel is mounted only once the archetype is known, because the
 * reclassification control names the lifecycle the request is currently on — and
 * a control that named the wrong one would be offering to move it the way it has
 * already gone.
 */
export function RequestWorkspace({ requirementId }: { requirementId: string }) {
  const timeline = useRequestTimeline(requirementId);
  const data = timeline.data ?? null;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/operations/requests"
          className="text-sm font-medium text-text-link hover:underline"
        >
          &larr; All queues
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text">Request</h1>
        <p className="mt-1 text-sm text-text-secondary">
          <span className="font-mono">{maskId(requirementId)}</span>
        </p>
        {data !== null ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="action">{data.archetype.replaceAll("_", " ")}</Badge>
            <Badge tone="neutral">{data.status.replaceAll("_", " ")}</Badge>
            <span className="text-sm text-text-secondary">
              Server time{" "}
              <time dateTime={data.server_now}>
                {new Date(data.server_now).toLocaleString("en-IN")}
              </time>
            </span>
          </div>
        ) : null}
      </div>

      <RequestTimelineView requirementId={requirementId} />

      {data?.engagement_id && data.archetype === "A5_CUSTOM_PROJECT" ? (
        <ProjectRecovery engagementId={data.engagement_id} />
      ) : null}

      {data !== null ? (
        <RecoveryActions requirementId={requirementId} archetype={data.archetype} />
      ) : timeline.isPending ? (
        <Card className="flex items-center gap-2 p-4 text-sm text-text-secondary">
          <Spinner size="sm" />
          Recovery actions open once the request has loaded.
        </Card>
      ) : null}
    </div>
  );
}
