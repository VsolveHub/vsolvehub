"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { PostJobWizard } from "@/features/listings/view/post-job-wizard";

function PostJob() {
  const params = useSearchParams();
  const editId = params?.get("edit");
  return <PostJobWizard key={editId ?? "new"} editId={editId} />;
}

/** `/listings/post` — post a job in four taps-first steps. `?edit=<id>` edits one. */
export default function PostJobPage() {
  return (
    <Suspense fallback={null}>
      <PostJob />
    </Suspense>
  );
}
