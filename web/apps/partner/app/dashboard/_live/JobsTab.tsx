import { TabTitle } from "./TabTitle";
import { CrewSection, ActiveJobCard, NoActiveJobCard, JobHistoryList } from "./JobsTabSections";
import type { Props, Stage } from "./types";

function isJobInProgress(stage: Stage): boolean {
  return stage !== "offline" && stage !== "searching" && stage !== "complete";
}

/* ------------------------------------------------------------------ *
 * JOBS tab.
 * ------------------------------------------------------------------ */
export function JobsTab(p: Props & { stage: Stage; todayJobs: number }) {
  const active = isJobInProgress(p.stage);

  return (
    <div className="vsh-rise">
      <TabTitle title="My Jobs" subtitle={`${p.jobsCompleted} completed all-time`} />

      <CrewSection crew={p.crew} />

      {active ? <ActiveJobCard offer={p.offer} /> : !p.crew?.jobs?.length ? <NoActiveJobCard /> : null}

      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">History</p>
      <JobHistoryList ledger={p.ledger} />
    </div>
  );
}
