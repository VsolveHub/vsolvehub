"use client";

import { Button, Field, Input } from "@vsolve/ui";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { useDebounced } from "@/features/shared/use-debounced";

import { usePartnerDirectory } from "../queries";

export interface PickedPartner {
  id: string;
  display_name: string;
  phone_number: string;
}

const SHOWN = 8;

/** `text` with the first case-insensitive match of `query` in bold. Exported for tests. */
export function highlight(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle) return text;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold text-text">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * Find a partner by name or mobile number, searched on the server, and pick one.
 *
 * Suggestions open as soon as the box is focused, before anything is typed, so the common case
 * is one click. Arrow keys move through them, Enter picks, Escape closes: an operator correcting
 * balances all day should not need the mouse.
 */
export function PartnerPicker({
  value,
  onChange,
  label = "Partner",
  status = "APPROVED",
}: {
  value: PickedPartner | null;
  onChange: (partner: PickedPartner | null) => void;
  label?: string;
  /** Only partners in this application status. Approved by default: the only ones who work. */
  status?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const typed = search.trim();
  const q = useDebounced(typed);
  const directory = usePartnerDirectory({ status, q: q || undefined });
  const rows = (directory.data?.pages.flatMap((page) => page.results) ?? []).slice(0, SHOWN);
  // While the debounce settles, the rows still answer the previous search.
  const settling = typed !== q;

  const pick = (row: PickedPartner) => {
    onChange({ id: row.id, display_name: row.display_name, phone_number: row.phone_number });
    setSearch("");
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (rows.length ? (index + 1) % rows.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (rows.length ? (index - 1 + rows.length) % rows.length : 0));
    } else if (event.key === "Enter") {
      const row = rows[active];
      if (open && row && !settling) {
        event.preventDefault();
        pick(row);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  if (value) {
    return (
      <Field label={label} required>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-sunken px-3 py-2">
          <span className="text-sm">
            <span className="font-semibold text-text">{value.display_name}</span>{" "}
            <span data-numeric className="text-text-secondary">
              {value.phone_number}
            </span>
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(null);
              setOpen(true);
              // The box comes back focused with its suggestions open: changing is one more click.
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            Change
          </Button>
        </div>
      </Field>
    );
  }

  const heading = typed ? "Matching partners" : "Suggested partners";

  return (
    <Field
      label={label}
      required
      description="Pick from the list, or type a name or mobile number to narrow it."
    >
      <div className="relative">
        <Input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${listId}-${rows[active].id}` : undefined}
          value={search}
          placeholder="Name or mobile number"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          // Late enough that a click on a suggestion lands first.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setSearch(event.target.value);
            setActive(0);
            setOpen(true);
          }}
        />
        {open ? (
          <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-control border border-line bg-surface shadow-lg">
            <p className="border-b border-line px-3 py-1.5 text-xs font-medium text-text-muted">
              {heading}
            </p>
            {directory.isLoading || (settling && rows.length === 0) ? (
              <p className="px-3 py-2 text-sm text-text-secondary">Searching…</p>
            ) : directory.isError ? (
              <p className="px-3 py-2 text-sm text-danger-text">
                Partners could not be loaded. Try typing again.
              </p>
            ) : rows.length === 0 ? (
              <p className="px-3 py-2 text-sm text-text-secondary">
                {typed
                  ? `No approved partner matches “${typed}”. Try part of the name or the last digits of the number.`
                  : "No approved partners yet."}
              </p>
            ) : (
              <ul id={listId} role="listbox" aria-label={heading} className="max-h-80 divide-y divide-line overflow-y-auto">
                {rows.map((row, index) => (
                  <li
                    key={row.id}
                    id={`${listId}-${row.id}`}
                    role="option"
                    aria-selected={index === active}
                    className={`flex cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-sm ${
                      index === active ? "bg-surface-sunken" : ""
                    }`}
                    // Mouse down, not click: it fires before the input's blur closes the list.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pick(row);
                    }}
                    onMouseEnter={() => setActive(index)}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-text">
                        {highlight(row.display_name, typed)}
                      </span>
                      {row.skills.length ? (
                        <span className="block truncate text-xs text-text-muted">
                          {row.skills
                            .slice(0, 3)
                            .map((skill) => skill.name)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </span>
                    <span data-numeric className="text-text-secondary">
                      {highlight(row.phone_number, typed)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {rows.length > 0 && !typed ? (
              <p className="border-t border-line px-3 py-1.5 text-xs text-text-muted">
                Not here? Type a name or mobile number.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </Field>
  );
}
