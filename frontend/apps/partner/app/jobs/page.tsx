import type { Metadata } from "next";

import { JobList } from "@/features/work/view/job-list";

/** One Partner's own work. Never cached, never indexed. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your jobs",
  robots: { index: false, follow: false },
};

export default function JobsPage() {
  return <JobList />;
}
