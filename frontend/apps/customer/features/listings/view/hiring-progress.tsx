"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { friendlyErrorMessage } from "@vsolve/query";
import { Button, Textarea, formatDate } from "@vsolve/ui";
import { CheckCircle2, Phone } from "lucide-react";
import { useState } from "react";

import type { ListingApplication } from "../queries";
import { answerInterview, HIRING_STEP_LABELS } from "../seeker-queries";

const STEPS = ["Applied", "Shortlisted", "Interview", "Connected"] as const;

function stepIndex(status: string): number {
  const label = HIRING_STEP_LABELS[status] ?? "";
  if (label === "Under review") return 0;
  return STEPS.indexOf(label as (typeof STEPS)[number]);
}

/**
 * Where the application is (Applied → Shortlisted → Interview → Connected), the interview
 * invitation to answer, and the employer's number once the interview is accepted.
 */
export function HiringProgress({ app }: { app: ListingApplication }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState<null | "reschedule" | "decline">(null);
  const [note, setNote] = useState("");
  const interview = app.interview;
  const answer = useMutation({
    mutationFn: (action: "accept" | "reschedule" | "decline") => answerInterview(interview!.id, action, note.trim()),
    onSuccess: () => {
      setAsking(null);
      setNote("");
      void qc.invalidateQueries({ queryKey: ["my-listing-applications"] });
    },
  });
  const current = stepIndex(app.status);
  const closed = ["REJECTED", "WITHDRAWN", "EXPIRED"].includes(app.status);
  const connected = app.status === "CONNECTED" || app.status === "CONTACTED";

  return (
    <div className="flex flex-col gap-3">
      {!closed ? (
        <ol className="grid grid-cols-4 gap-1 text-center text-[11px] font-semibold" aria-label="Application progress">
          {STEPS.map((name, i) => (
            <li key={name} className={`rounded-full px-1 py-1 ${i <= current ? "bg-action text-action-text" : "bg-surface-sunken text-text-muted"}`}>
              {name}
            </li>
          ))}
        </ol>
      ) : null}

      {interview && interview.status !== "CANCELLED" && !connected ? (
        <div className="rounded-control border border-action/40 bg-action-surface/40 p-3 text-sm">
          <p className="font-bold text-navy-900">
            {interview.status === "PROPOSED" ? "Interview invitation" : `Interview · ${interview.status_label}`}
          </p>
          <p className="text-text">
            {formatDate(`${interview.scheduled_date}T12:00:00`)} at {interview.start_time.slice(0, 5)} · {interview.mode_label}
            {interview.location_text ? ` · ${interview.location_text}` : ""}
          </p>
          {interview.note ? <p className="mt-1 text-xs text-text-secondary">“{interview.note}”</p> : null}
          {interview.status === "PROPOSED" ? (
            asking ? (
              <div className="mt-2 flex flex-col gap-2">
                <Textarea
                  rows={2}
                  maxLength={480}
                  value={note}
                  placeholder={asking === "reschedule" ? "e.g. Any day after 4 PM works for me." : "Optional reason"}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" loading={answer.isPending} onClick={() => answer.mutate(asking)}>
                    {asking === "reschedule" ? "Ask for another time" : "Decline interview"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
                    Back
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" loading={answer.isPending} onClick={() => answer.mutate("accept")}>
                  Accept
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAsking("reschedule")}>
                  Ask for another time
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAsking("decline")}>
                  Decline
                </Button>
              </div>
            )
          ) : null}
          {answer.error ? <p className="mt-1 text-xs text-danger-text">{friendlyErrorMessage(answer.error)}</p> : null}
        </div>
      ) : null}

      {connected ? (
        <p className="flex items-start gap-2 rounded-control border border-success-line bg-success-surface p-3 text-sm text-success-text">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          V Solve Hub has completed the connection. You can continue directly with the employer for the next steps.
        </p>
      ) : null}

      {app.employer_phone ? (
        <a
          href={`tel:${app.employer_phone}`}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-control bg-action px-5 text-sm font-bold text-action-text"
        >
          <Phone className="size-4" aria-hidden /> Call {app.employer_name || "employer"} · {app.employer_phone}
        </a>
      ) : null}
    </div>
  );
}
