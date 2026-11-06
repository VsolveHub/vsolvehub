"use client";

import { Button, Field, Input } from "@vsolve/ui";
import { useState } from "react";

import { useDebounced } from "@/features/shared/use-debounced";

import { usePartnerDirectory } from "../queries";

export interface PickedPartner {
  id: string;
  display_name: string;
  phone_number: string;
}

const SHOWN = 8;

/**
 * Find a partner by name or mobile number, searched on the server, and pick one. Replaces typing
 * a partner id, and the old dropdown that could only find partners on the first page it loaded.
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
  const q = useDebounced(search.trim());
  const directory = usePartnerDirectory({ status, q: q || undefined });
  const rows = (directory.data?.pages.flatMap((page) => page.results) ?? []).slice(0, SHOWN);

  if (value) {
    return (
      <Field label={label} required>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line bg-surface-sunken px-3 py-2">
          <span className="text-sm">
            <span className="font-semibold text-text">{value.display_name}</span>{" "}
            <span className="text-text-secondary">{value.phone_number}</span>
          </span>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Change
          </Button>
        </div>
      </Field>
    );
  }

  return (
    <Field label={label} required description="Search by name or mobile number.">
      <div className="flex flex-col gap-2">
        <Input
          type="search"
          value={search}
          placeholder="Name or mobile number"
          onChange={(event) => setSearch(event.target.value)}
        />
        {q ? (
          directory.isLoading ? (
            <p className="text-sm text-text-secondary">Searching…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-text-secondary">No approved partner matches.</p>
          ) : (
            <ul role="listbox" aria-label="Matching partners" className="divide-y divide-line rounded-control border border-line">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full flex-wrap justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface-sunken"
                    onClick={() =>
                      onChange({ id: row.id, display_name: row.display_name, phone_number: row.phone_number })
                    }
                  >
                    <span className="font-semibold text-text">{row.display_name}</span>
                    <span className="text-text-secondary">{row.phone_number}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </Field>
  );
}
