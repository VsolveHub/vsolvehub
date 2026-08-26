"use client";

import { Button, EmptyState, ErrorState, Sheet, Skeleton, cn } from "@vsolve/ui";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useId, useState } from "react";

import {
  findCustomerVisitSlot,
  slotOverlapsAnotherSelection,
  type CustomerVisitSlotGridView,
} from "../../model/customer-visit-slots";

export interface CustomerVisitSlotChooserProps {
  planSize: number | null;
  grid: CustomerVisitSlotGridView | null;
  selectedStarts: readonly (string | null)[];
  onChange: (visitIndex: number, startsAt: string) => void;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

export function CustomerVisitSlotChooser({
  planSize,
  grid,
  selectedStarts,
  onChange,
  isLoading,
  error,
  onRetry,
}: CustomerVisitSlotChooserProps) {
  const headingId = useId();
  const [openVisitIndex, setOpenVisitIndex] = useState<number | null>(null);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState<string | null>(null);

  if (planSize === null) return null;

  const visits = Array.from({ length: planSize }, (_, index) => index);
  const chosenCount = visits.filter((index) => {
    const slot = findCustomerVisitSlot(grid, selectedStarts[index] ?? null);
    return slot?.isAvailable === true;
  }).length;
  const currentVisitIndex =
    openVisitIndex !== null && openVisitIndex < planSize ? openVisitIndex : null;

  function openPicker(visitIndex: number) {
    const selectedStart = selectedStarts[visitIndex] ?? null;
    const selectedDay = grid?.days.find((day) =>
      day.slots.some((slot) => slot.startsAt === selectedStart),
    );
    const firstOpenDay = grid?.days.find((day) => day.openCount > 0);
    setDraftStart(selectedStart);
    setActiveDay(selectedDay?.date ?? firstOpenDay?.date ?? grid?.days[0]?.date ?? null);
    setOpenVisitIndex(visitIndex);
  }

  function closePicker() {
    setOpenVisitIndex(null);
    setDraftStart(null);
  }

  return (
    <section
      data-customer-visit-slots
      aria-labelledby={headingId}
      className="rounded-card border border-line bg-surface p-4"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-action-surface text-action-active"
        >
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-base font-extrabold text-text">
            Choose each visit time
          </h2>
          <p className="mt-0.5 text-sm leading-5 text-text-secondary">
            The professional accepts your time or passes. They cannot move it.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading available visit times</span>
            {visits.map((index) => (
              <Skeleton key={index} className="h-14 w-full rounded-card" />
            ))}
          </div>
        ) : error !== null && error !== undefined ? (
          <ErrorState
            inline
            title="We could not load visit times"
            message="Nothing has been selected. Check your connection and try again."
            actionLabel="Try again"
            onAction={onRetry}
          />
        ) : grid === null || grid.openCount === 0 ? (
          <EmptyState
            compact
            title="No visit times are open right now"
            description="Try again shortly. Nothing has been sent or charged."
            action={
              <Button variant="outline" size="sm" onClick={onRetry}>
                Refresh times
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {visits.map((visitIndex) => {
              const selected = findCustomerVisitSlot(
                grid,
                selectedStarts[visitIndex] ?? null,
              );
              const complete = selected?.isAvailable === true;
              const day = grid.days.find((candidate) =>
                candidate.slots.some((slot) => slot.startsAt === selected?.startsAt),
              );
              return (
                <button
                  key={visitIndex}
                  type="button"
                  onClick={() => openPicker(visitIndex)}
                  aria-label={
                    complete
                      ? `Visit ${visitIndex + 1}. ${day?.label ?? ""}, ${selected.label}. Change time.`
                      : `Visit ${visitIndex + 1}. Choose a time.`
                  }
                  className={cn(
                    "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-card px-3 py-2 text-left",
                    "transition-colors duration-fast focus-visible:outline focus-visible:outline-2",
                    "focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                    complete
                      ? "border border-line bg-surface hover:bg-surface-hover"
                      : "border-[1.5px] border-action bg-action-surface hover:bg-signal-100",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-[10px] text-sm font-extrabold tabular-nums",
                      complete
                        ? "bg-success-surface text-success-text"
                        : "bg-signal-100 text-signal-700",
                    )}
                  >
                    {complete ? <CheckCircle2 className="size-4" /> : visitIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold text-text-muted">
                      {`Visit ${visitIndex + 1}`}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-sm font-semibold",
                        complete ? "text-text" : "text-warning-text",
                      )}
                    >
                      {complete
                        ? `${day?.label ?? ""} · ${selected.label}`
                        : selected === null
                          ? "Choose a time"
                          : "That time is no longer available"}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "shrink-0 text-sm font-semibold",
                      complete ? "text-text-link" : "text-warning-text",
                    )}
                  >
                    {complete ? "Change" : "Choose"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {grid?.timezoneUnsupported === true ? (
        <p className="mt-3 text-xs leading-4 text-warning-text" role="status">
          Your device cannot display the site timezone ({grid.timezone}); times use your device
          timezone.
        </p>
      ) : null}

      {grid !== null && grid.openCount > 0 ? (
        <p className="mt-3 text-sm font-bold text-text-secondary" role="status">
          {`${chosenCount} of ${planSize} visit ${planSize === 1 ? "time" : "times"} chosen`}
        </p>
      ) : null}

      {currentVisitIndex !== null && grid !== null ? (
        <VisitTimeSheet
          visitIndex={currentVisitIndex}
          grid={grid}
          selectedStarts={selectedStarts}
          activeDay={activeDay}
          draftStart={draftStart}
          onActiveDay={(date) => {
            setActiveDay(date);
            const selectedDay = grid.days.find((day) =>
              day.slots.some((slot) => slot.startsAt === draftStart),
            );
            if (selectedDay?.date !== date) setDraftStart(null);
          }}
          onDraftStart={setDraftStart}
          onCancel={closePicker}
          onConfirm={() => {
            if (draftStart === null) return;
            onChange(currentVisitIndex, draftStart);
            closePicker();
          }}
        />
      ) : null}
    </section>
  );
}

function VisitTimeSheet({
  visitIndex,
  grid,
  selectedStarts,
  activeDay,
  draftStart,
  onActiveDay,
  onDraftStart,
  onCancel,
  onConfirm,
}: {
  visitIndex: number;
  grid: CustomerVisitSlotGridView;
  selectedStarts: readonly (string | null)[];
  activeDay: string | null;
  draftStart: string | null;
  onActiveDay: (date: string) => void;
  onDraftStart: (startsAt: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const day = grid.days.find((candidate) => candidate.date === activeDay) ?? null;
  const selected = findCustomerVisitSlot(grid, draftStart);
  const complete = selected?.isAvailable === true;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={`Choose Visit ${visitIndex + 1}`}
      description="Pick a time you can be at the site. The professional accepts it or passes."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="secondary" disabled={!complete} onClick={onConfirm}>
            Use this time
          </Button>
        </>
      }
    >
      <fieldset className="border-0 p-0">
        <legend className="text-sm font-semibold text-text">Choose a day</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {grid.days.map((candidate) => {
            const checked = candidate.date === activeDay;
            const disabled = candidate.openCount === 0;
            return (
              <label
                key={candidate.date}
                className={cn(
                  "flex min-h-[68px] flex-col items-center justify-center rounded-card px-1 py-2 text-center",
                  "transition-colors duration-fast has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                  "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                  disabled
                    ? "border border-line bg-surface-sunken opacity-60"
                    : checked
                      ? "cursor-pointer border-2 border-action-secondary bg-selected-surface"
                      : "cursor-pointer border border-line bg-surface hover:bg-surface-hover",
                )}
              >
                <input
                  type="radio"
                  name={`customer-visit-${visitIndex}-day`}
                  value={candidate.date}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onActiveDay(candidate.date)}
                  className="sr-only"
                />
                <span aria-hidden className="text-sm font-bold text-text">
                  {candidate.label}
                </span>
                <span aria-hidden className="text-[11px] text-text-muted">
                  {`${candidate.openCount} open`}
                </span>
                <span className="sr-only">{candidate.spokenLabel}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {day === null ? (
        <p className="mt-4 text-sm text-text-secondary">Choose a day to see visit times.</p>
      ) : (
        <fieldset className="mt-5 border-0 p-0">
          <legend className="text-sm font-semibold text-text">Choose a time</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {day.slots.map((slot) => {
              const overlapping = slotOverlapsAnotherSelection({
                slot,
                selectedStarts,
                visitIndex,
                grid,
              });
              const disabled = !slot.isAvailable || overlapping;
              const checked = slot.startsAt === draftStart;
              const helper = overlapping
                ? "Used by another visit"
                : (slot.unavailableLabel ?? "Available");
              return (
                <label
                  key={slot.token}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center rounded-card p-2 text-center",
                    "transition-colors duration-fast has-[:focus-visible]:outline has-[:focus-visible]:outline-2",
                    "has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring",
                    disabled
                      ? "border border-line bg-surface-sunken opacity-60"
                      : checked
                        ? "cursor-pointer border-2 border-action-secondary bg-selected-surface"
                        : "cursor-pointer border border-line bg-surface hover:bg-surface-hover",
                  )}
                >
                  <input
                    type="radio"
                    name={`customer-visit-${visitIndex}-time`}
                    value={slot.startsAt}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onDraftStart(slot.startsAt)}
                    className="sr-only"
                  />
                  <span className="text-sm font-bold tabular-nums text-text">{slot.label}</span>
                  <span className="mt-0.5 text-[11px] font-medium text-text-muted">{helper}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </Sheet>
  );
}
