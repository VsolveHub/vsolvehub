"use client";

import { friendlyErrorMessage, usePagedList } from "@vsolve/query";
import { Badge, Card, EmptyState, Field, Input, LoadMore } from "@vsolve/ui";
import { ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useDebounced } from "@/features/shared/use-debounced";

import { customerKeys, fetchCustomersPage, type CustomerRow } from "../queries";

const JOINED = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

function CustomerCard({ row }: { row: CustomerRow }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy-900">{row.full_name || "No name given"}</p>
          <p className="text-sm text-text-secondary">Joined {JOINED.format(new Date(row.date_joined))}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {row.is_blocked ? <Badge tone="danger">Blocked</Badge> : null}
          {row.is_partner ? <Badge tone="info">Also a partner</Badge> : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <a className="inline-flex items-center gap-1 text-sm text-text-link" href={`tel:${row.phone_number}`}>
          <Phone aria-hidden className="size-3" /> {row.phone_number}
        </a>
        <Link
          href={`/operations/customers/${row.id}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-text-link hover:underline"
        >
          Open customer <ChevronRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

/** Find a customer by mobile number (typed any way) or name, then open their record. */
export function CustomerDirectory() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const customers = usePagedList([...customerKeys.all, "list", q], (cursor) => fetchCustomersPage(cursor, q));

  return (
    <section className="flex flex-col gap-4">
      <Field label="Search">
        <Input
          type="search"
          inputMode="search"
          value={search}
          placeholder="Mobile number or name"
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>

      {customers.isLoading ? <p className="text-sm text-text-secondary">Loading customers…</p> : null}
      {customers.error ? (
        <p role="alert" className="text-sm text-danger-text">
          {friendlyErrorMessage(customers.error)}
        </p>
      ) : null}
      {!customers.isLoading && !customers.error && customers.items.length === 0 ? (
        <EmptyState
          title={q ? "No customer matches" : "No customers yet"}
          description={q ? "Check the number or try part of the name." : "Customers appear here when they sign up."}
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {customers.items.map((row) => (
          <li key={row.id}>
            <CustomerCard row={row} />
          </li>
        ))}
      </ul>
      <LoadMore hasMore={customers.hasMore} loading={customers.loadingMore} onLoadMore={customers.loadMore} />
    </section>
  );
}
