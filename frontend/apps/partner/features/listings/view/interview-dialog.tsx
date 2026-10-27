"use client";

import { Button, Dialog, Field, Input, Textarea, useT } from "@vsolve/ui";
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
  const t = useT();
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
      title={t("listings.interview.title", { name: candidateName })}
      description={t("listings.interview.description")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            loading={isPending}
            onClick={() => onSubmit({ scheduled_date: day, start_time: time, mode, location_text: mode === "IN_PERSON" ? place : "", note })}
          >
            {t("listings.interview.sendInvitation")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("listings.interview.day")} showOptional={false}>
            <Input type="date" value={day} min={tomorrowIso().slice(0, 8) + "01"} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label={t("listings.interview.time")} showOptional={false}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("listings.interview.howAriaLabel")}>
          {INTERVIEW_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${mode === m.value ? "border-action bg-action text-action-text" : "border-line bg-surface text-text"}`}
            >
              {t(m.label)}
            </button>
          ))}
        </div>
        {mode === "IN_PERSON" ? (
          <Field label={t("listings.interview.where")}>
            <Input value={place} maxLength={240} onChange={(e) => setPlace(e.target.value)} />
          </Field>
        ) : null}
        <Field label={t("listings.interview.noteLabel")}>
          <Textarea rows={2} maxLength={480} value={note} placeholder={t("listings.interview.notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error ? <p role="alert" className="text-sm text-danger-text">{error}</p> : null}
      </div>
    </Dialog>
  );
}
