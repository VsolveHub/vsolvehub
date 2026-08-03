"use client";

import { Button, ErrorState, EmptyState, Skeleton, SkeletonRegion } from "@vsolve/ui";
import { useState } from "react";

import { ChoiceCard } from "../../view/choice-card";
import type { WindowsView } from "../../adapters";
import { describeItemFailure } from "../reasons";
import type { Cart } from "../queries";
import type { PlanItemFailure } from "../conflicts";

/**
 * When the customer would like the work to start.
 *
 * The plan-set command takes one `preferred_start`, and this is where it comes
 * from. Only instants the server itself published are offered — the times below
 * are the service area's own operating slots for this cart and address, not a
 * grid assembled in the browser.
 *
 * The wording is careful about what those times mean. They rule out what is
 * past, too soon or outside operating hours; they are **not** a promise that the
 * whole cart fits, because only the planner can answer that. Presenting them as
 * availability would be a capacity claim nobody made, and the plan set is one
 * request away.
 */

function DaySkeleton() {
  return (
    <div>
      <Skeleton className="h-6 w-56" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-16" />
        ))}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

export interface PreferredStartPickerProps {
  windows: WindowsView;
  selectedStart: string | null;
  onSelect: (startsAt: string) => void;
}

export function PreferredStartPicker({
  windows,
  selectedStart,
  onSelect,
}: PreferredStartPickerProps) {
  const [dayIndex, setDayIndex] = useState<number | null>(null);
  const bookableDays = windows.days.filter((day) =>
    day.windows.some((window) => window.isAvailable),
  );

  if (bookableDays.length === 0) {
    return (
      <EmptyState
        title="No start times are open right now"
        description="Every slot in the next few days is either past or outside working hours for this area. Nothing has been booked."
      />
    );
  }

  const day = dayIndex === null ? null : bookableDays[dayIndex];

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-semibold text-text">Pick a day</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {bookableDays.map((candidate, index) => (
            <Button
              key={candidate.label}
              variant={dayIndex === index ? "primary" : "outline"}
              size="sm"
              aria-pressed={dayIndex === index}
              onClick={() => setDayIndex(index)}
            >
              {candidate.label}
            </Button>
          ))}
        </div>
      </fieldset>

      {day === null ? (
        <p className="mt-4 text-sm text-text-secondary">
          Choose a day to see start times. Nothing is preselected.
        </p>
      ) : (
        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-text">
            Pick a start time on {day.label}
          </legend>
          <div className="mt-2 flex flex-col gap-2">
            {day.windows.map((window) => (
              <ChoiceCard
                key={window.startsAt}
                name="preferred-start"
                value={window.startsAt}
                checked={selectedStart === window.startsAt}
                disabled={!window.isAvailable}
                onSelect={onSelect}
                title={window.label}
                description={
                  window.isAvailable ? null : (window.unavailableLabel ?? "Not available")
                }
              />
            ))}
          </div>
        </fieldset>
      )}

      <p className="mt-4 text-sm text-text-secondary">
        This is when you would like us to start. We will show you exactly how it can be
        arranged, and what it costs, before anything is confirmed.
      </p>
    </div>
  );
}

export interface ScheduleStepProps {
  windows: WindowsView | undefined;
  isLoadingWindows: boolean;
  windowsError: boolean;
  onRetryWindows: () => void;
  selectedStart: string | null;
  onSelectStart: (startsAt: string) => void;
  onContinue: () => void;
  isPlanning: boolean;
  /** Per-item planner refusals, when the last attempt returned none. */
  planFailures: PlanItemFailure[] | null;
  cart: Cart;
}

export function ScheduleStep({
  windows,
  isLoadingWindows,
  windowsError,
  onRetryWindows,
  selectedStart,
  onSelectStart,
  onContinue,
  isPlanning,
  planFailures,
  cart,
}: ScheduleStepProps) {
  return (
    <div>
      <h2 className="text-lg font-bold text-text">When should we come?</h2>

      {windowsError ? (
        <ErrorState
          className="mt-4"
          title="We could not load start times"
          message="Nothing has been booked. This is a problem on our side — try again in a moment."
          actionLabel="Try again"
          onAction={onRetryWindows}
        />
      ) : (
        <SkeletonRegion
          loading={isLoadingWindows}
          label="Loading available start times"
          className="mt-4"
        >
          {windows ? (
            <PreferredStartPicker
              windows={windows}
              selectedStart={selectedStart}
              onSelect={onSelectStart}
            />
          ) : (
            <DaySkeleton />
          )}
        </SkeletonRegion>
      )}

      {planFailures !== null ? (
        <div className="mt-6 rounded-card border border-critical-200 bg-critical-50 p-4">
          <h3 className="text-sm font-semibold text-text">
            We could not arrange this booking
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Nothing has been booked or charged. Try a different time, or book these
            separately.
          </p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {planFailures.map((failure, index) => {
              const item = cart.items.find(
                (candidate) => candidate.id === failure.cartItemId,
              );
              return (
                <li key={`${failure.cartItemId ?? "cart"}-${index}`}>
                  <span className="font-medium text-text">
                    {item ? item.service_name : "Your booking"}
                  </span>
                  <span className="block text-text-secondary">
                    {describeItemFailure(failure.reason)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          onClick={onContinue}
          disabled={selectedStart === null}
          loading={isPlanning}
          loadingLabel="Working out your options"
        >
          See how we can do this
        </Button>
        {selectedStart === null ? (
          <p className="text-sm text-text-secondary" aria-live="polite">
            Choose a start time to continue.
          </p>
        ) : null}
      </div>
    </div>
  );
}
