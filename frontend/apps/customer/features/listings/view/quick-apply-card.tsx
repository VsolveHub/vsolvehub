"use client";

import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Card, Textarea } from "@vsolve/ui";
import { CheckCircle2, FileText } from "lucide-react";
import { useState } from "react";

import { quickApply, type JobProfile } from "../seeker-queries";

const NOTES = [
  "I am interested in this job and can join soon.",
  "I have relevant experience for this role.",
  "I live nearby and can start immediately.",
];

/** Apply with the saved profile: one tap, an optional note, nothing to fill again. */
export function QuickApplyCard({
  listingId,
  posterName,
  profile,
}: {
  listingId: string;
  posterName?: string;
  profile: JobProfile;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const apply = useMutation({
    mutationFn: () => quickApply(listingId, note.trim()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["my-listing-applications"] }),
  });

  if (apply.isSuccess) {
    return (
      <Card id="apply-panel" className="h-fit p-6 text-center">
        <CheckCircle2 className="mx-auto size-8 text-success-text" />
        <h2 className="mt-2 text-base font-bold text-success-text">Application sent</h2>
        <p className="mt-1 text-sm text-text-secondary">
          {posterName || "The employer"} has your profile. You&apos;ll be notified when they shortlist you.
        </p>
        <Link href="/listings/my-applications" className="mt-4 inline-block text-sm font-bold text-text-link">
          Track it in My Applications →
        </Link>
      </Card>
    );
  }

  return (
    <Card id="apply-panel" className="flex h-fit flex-col gap-4 p-6">
      <div>
        <h2 className="text-lg font-bold text-text">Apply with your V Solve Hub profile</h2>
        <p className="text-xs text-text-secondary">No forms to fill again.</p>
      </div>
      <div className="rounded-control border border-line bg-surface-sunken p-3 text-sm">
        <p className="font-semibold text-navy-900">{profile.full_name}</p>
        <p className="text-text-secondary">
          {[(profile.roles as string[]).join(", "), [profile.area, profile.city].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {profile.has_resume ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
            <FileText className="size-3.5" aria-hidden /> {profile.resume_name}
          </p>
        ) : null}
        <Link href="/listings/profile" className="mt-1 block text-xs font-bold text-text-link">
          Edit profile
        </Link>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-text">Message (optional)</p>
        <div className="flex flex-wrap gap-1.5">
          {NOTES.map((n) => (
            <button key={n} type="button" onClick={() => setNote(n)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs text-text-secondary hover:border-action">
              {n}
            </button>
          ))}
        </div>
        <Textarea rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Or write your own" />
      </div>
      {apply.error ? <p role="alert" className="text-sm text-danger-text">{friendlyErrorMessage(apply.error)}</p> : null}
      <Button loading={apply.isPending} loadingLabel="Sending…" onClick={() => apply.mutate()}>
        Apply now
      </Button>
      <p className="text-[11px] text-text-secondary">Your name, phone and profile are shared with this employer.</p>
    </Card>
  );
}
