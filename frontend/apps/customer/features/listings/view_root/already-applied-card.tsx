import Link from "next/link";
import { CheckCircle2, FileCheck2 } from "lucide-react";
import { Badge } from "@vsolve/ui";
import { APPLICATION_STATUS_LABELS } from "../model";

export interface AlreadyAppliedCardProps {
  posterName?: string;
  status?: string;
}

export function AlreadyAppliedCard({ posterName, status }: AlreadyAppliedCardProps) {
  const label = APPLICATION_STATUS_LABELS[status ?? ""] ?? status ?? "In progress";

  return (
    <div className="mt-5 rounded-card border border-navy-200 bg-navy-50/60 p-5 text-center">
      <CheckCircle2 className="mx-auto size-8 text-navy-700" />
      <h3 className="mt-2 text-sm font-bold text-text">
        You have already applied
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
        Your application for this role is{" "}
        <Badge tone="info" className="inline-flex">{label}</Badge>
        . {posterName} can now review it.
      </p>
      <Link
        href="/listings/my-applications"
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-control bg-navy-900 px-4 py-2.5 text-xs font-semibold text-warm-0 transition hover:bg-navy-800"
      >
        <FileCheck2 className="size-4" />
        Track it in My Applications
      </Link>
      <p className="mt-2 text-[11px] text-text-muted">
        One application per listing. You can withdraw it from My Applications.
      </p>
    </div>
  );
}
