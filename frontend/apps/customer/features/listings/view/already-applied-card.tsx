import Link from "next/link";
import { CheckCircle2, FileCheck2 } from "lucide-react";
import { APPLICATION_STATUS_LABELS } from "../model";

export interface AlreadyAppliedCardProps {
  posterName?: string;
  status?: string;
}

export function AlreadyAppliedCard({ posterName, status }: AlreadyAppliedCardProps) {
  const label = APPLICATION_STATUS_LABELS[status ?? ""] ?? status ?? "in progress";

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-amber-600" />
      <h3 className="mt-2 text-sm font-semibold text-amber-900">
        You have already applied
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">
        Your application for this role is{" "}
        <span className="font-semibold">{label}</span>
        . {posterName} can now review it.
      </p>
      <Link
        href="/listings/my-applications"
        className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-800"
      >
        <FileCheck2 className="h-4 w-4" />
        Track it in My Applications
      </Link>
      <p className="mt-2 text-[11px] text-amber-700">
        One application per listing. You can withdraw it from My Applications.
      </p>
    </div>
  );
}
