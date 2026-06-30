"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  buildScheduledSlot,
  generateTimeSlots,
  getDateOptions,
  getInstantSlot,
  getTimeOptionsForDate,
} from "@/lib/bookings/slots";
import type { ScheduleType } from "@/lib/bookings/types";

type Props = {
  scheduleType: ScheduleType;
  slot: string;
  onChange: (patch: { scheduleType?: ScheduleType; slot?: string }) => void;
  onNext: () => void;
};

export function BookingScheduleStep({ scheduleType, slot, onChange, onNext }: Props) {
  const dateOptions = useMemo(() => getDateOptions(), []);
  const [selectedDate, setSelectedDate] = useState(dateOptions[0]?.value ?? "");

  const timeOptions = useMemo(() => {
    if (!selectedDate) return generateTimeSlots().slice(0, 12);
    return getTimeOptionsForDate(selectedDate);
  }, [selectedDate]);

  function selectInstant() {
    onChange({ scheduleType: "instant", slot: getInstantSlot() });
  }

  function selectScheduled(date: string, timeIso: string) {
    onChange({
      scheduleType: "scheduled",
      slot: buildScheduledSlot(date, timeIso),
    });
  }

  function handleNext() {
    if (scheduleType === "instant") {
      onChange({ scheduleType: "instant", slot: getInstantSlot() });
      onNext();
      return;
    }
    if (slot) {
      onNext();
      return;
    }
    if (timeOptions[0]) {
      onChange({
        scheduleType: "scheduled",
        slot: buildScheduledSlot(selectedDate, timeOptions[0].value),
      });
      onNext();
    }
  }

  return (
    <div className="stack-lg">
      <div className="booking-mode-tabs">
        <button
          type="button"
          className={`booking-mode-tab ${scheduleType === "instant" ? "active" : ""}`}
          onClick={selectInstant}
        >
          Instant booking
        </button>
        <button
          type="button"
          className={`booking-mode-tab ${scheduleType === "scheduled" ? "active" : ""}`}
          onClick={() => onChange({ scheduleType: "scheduled" })}
        >
          Schedule booking
        </button>
      </div>

      {scheduleType === "instant" ? (
        <div className="card">
          <p className="card-title">As soon as possible</p>
          <p className="card-text">
            A professional will be assigned within 30–60 minutes based on availability near you.
          </p>
        </div>
      ) : (
        <>
          <div className="card stack">
            <h2 className="section-title">Select date</h2>
            <div className="slot-grid">
              {dateOptions.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`slot-option ${selectedDate === d.value ? "selected" : ""}`}
                  onClick={() => setSelectedDate(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card stack">
            <h2 className="section-title">Select time slot</h2>
            <div className="slot-grid">
              {timeOptions.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`slot-option ${slot === buildScheduledSlot(selectedDate, t.value) ? "selected" : ""}`}
                  onClick={() => selectScheduled(selectedDate, t.value)}
                >
                  {t.label.split(", ").slice(-1)[0]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <Button onClick={handleNext} block>
        Next
      </Button>
    </div>
  );
}
