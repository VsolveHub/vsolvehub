"use client";

import { Search, X } from "lucide-react";
import { useId, type FormEvent } from "react";

/**
 * The Bookings hub search field.
 *
 * Visual only as a control: matching lives in `booking-search.ts` against the
 * list the page already loaded. Clearing is local state — it must not reload.
 */

export function BookingsSearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="w-full min-w-0">
      <label htmlFor={id} className="sr-only">
        Search bookings
      </label>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-text-muted"
          strokeWidth={1.8}
        />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search by service name, booking ID or keyword…"
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full min-w-0 rounded-card border border-line bg-surface py-0 pr-11 pl-11 text-sm text-navy-900 placeholder:text-text-muted/80 shadow-none appearance-none outline-none transition-[border-color,box-shadow] focus:border-navy-700 focus:ring-2 focus:ring-navy-900/10 sm:h-[50px] [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-control text-text-muted hover:bg-surface-sunken hover:text-navy-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </form>
  );
}
