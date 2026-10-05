"use client";

import { Button, Dialog, Field, Input, Textarea } from "@vsolve/ui";
import { useEffect, useState } from "react";

import { INTERVIEW_MODES, type InterviewMode } from "../jobs-queries";

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Day, time, in person / phone / video, and where. The candidate accepts or asks for another time. */
export function InterviewDialog({
  open,
  candidateName,
  defaultLocation,
  isPending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  candidateName: string;
  defaultLocation: string;
  isPending: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (body: { scheduled_date: string; start_time: string; mode: InterviewMode; location_text: string; note: string }) => void;
}) {
  const [day, setDay] = useState(tomorrowIso());
  const [time, setTime] = useState("11:00");
  const [mode, setMode] = useState<InterviewMode>("IN_PERSON");
  const [place, setPlace] = useState(defaultLocation);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setDay(tomorrowIso());
      setTime("11:00");
      setMode("IN_PERSON");
      setPlace(defaultLocation);
      setNote("");
    }
  }, [open, defaultLocation]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Interview ${candidateName}`}
      description="They can accept, ask for another time, or decline. Once accepted you both see each other's number."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={isPending}
            onClick={() => onSubmit({ scheduled_date: day, start_time: time, mode, location_text: mode === "IN_PERSON" ? place : "", note })}
          >
            Send invitation
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day" showOptional={false}>
            <Input type="date" value={day} min={tomorrowIso().slice(0, 8) + "01"} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Time" showOptional={false}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How">
          {INTERVIEW_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${mode === m.value ? "border-action bg-action text-action-text" : "border-line bg-surface text-text"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {mode === "IN_PERSON" ? (
          <Field label="Where">
            <Input value={place} maxLength={240} onChange={(e) => setPlace(e.target.value)} />
          </Field>
        ) : null}
        <Field label="Note for the candidate">
          <Textarea rows={2} maxLength={480} value={note} placeholder="e.g. Bring your ID and resume." onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      </div>
    </Dialog>
  );
}
