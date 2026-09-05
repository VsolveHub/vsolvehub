import { cn } from "@vsolve/ui";

import type { QuoteMaterialListRowView } from "../adapters";

/**
 * The shopping list, one row per thing to buy.
 *
 * Shared by the estimate card's disclosure and the full estimate page so the
 * two cannot drift: title bold, spec muted, the quantity right-aligned where
 * a thumb at a shop counter finds it, the note small underneath. **No price
 * column** — the list is quantities and specs by contract, and adding a
 * figure here would be the screen pricing something the pro did not.
 */
export function MaterialListRows({
  rows,
  className,
}: {
  rows: readonly QuoteMaterialListRowView[];
  className?: string;
}) {
  return (
    <ul className={cn("flex list-none flex-col divide-y divide-line p-0", className)}>
      {rows.map((row, index) => (
        <li key={`${row.title}-${index}`} className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-5 text-text">{row.title}</p>
            {row.spec !== null ? (
              <p className="text-xs leading-4 text-text-muted">{row.spec}</p>
            ) : null}
            {row.note !== null ? (
              <p className="mt-0.5 text-[11px] leading-4 text-text-muted">{row.note}</p>
            ) : null}
          </div>
          <p className="shrink-0 text-sm font-extrabold tabular-nums text-text">
            {row.quantityLabel}
          </p>
        </li>
      ))}
    </ul>
  );
}

/**
 * The same list as plain text, for the share sheet and the clipboard.
 *
 * "What to buy — Bathroom renovation: …" then one line per item. Text rather
 * than a link because the estimate is behind the Customer's session, and text
 * rather than a file because the sandbox a viewer reads this in offers none.
 */
export function materialListText({
  serviceName,
  rows,
  brandTierLabel,
}: {
  serviceName: string;
  rows: readonly QuoteMaterialListRowView[];
  brandTierLabel: string | null;
}): string {
  const lines = rows.map((row) => {
    const detail = [row.spec, row.note].filter((part): part is string => part !== null);
    return `- ${row.title} × ${row.quantityLabel}${detail.length > 0 ? ` (${detail.join("; ")})` : ""}`;
  });
  return [
    `What to buy — ${serviceName}:`,
    ...(brandTierLabel !== null ? [brandTierLabel] : []),
    ...lines,
    "Shared from Vsolve",
  ].join("\n");
}
