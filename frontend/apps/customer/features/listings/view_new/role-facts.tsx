import { formatMoneyText } from "@vsolve/ui";
import { formatFieldLabel } from "../model";
import type { ListingDetail } from "../queries";

export interface RoleFactsProps {
  listing: ListingDetail;
}

export function RoleFacts({ listing }: RoleFactsProps) {
  const fields = (listing.structured_fields || {}) as Record<string, unknown>;
  const schema = listing.listing_type_schema as Record<string, unknown> | undefined;
  const schemaProps = (schema?.properties as Record<string, unknown> | undefined) || {};

  const sortedKeys = Array.from(
    new Set([...Object.keys(schemaProps).filter((k) => k in fields), ...Object.keys(fields)]),
  );

  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
        Role Details & Requirements
      </h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listing.service_name && (
          <div className="rounded-control border border-line bg-surface-sunken p-3.5">
            <dt className="text-xs text-text-muted">Category Service</dt>
            <dd className="mt-1 text-sm font-semibold text-text">{listing.service_name}</dd>
          </div>
        )}
        {sortedKeys.map((key) => {
          const rawValue = String(fields[key]);
          const isMoneyKey = /salary|pay_range|compensation/i.test(key);
          const displayValue = isMoneyKey ? formatMoneyText(rawValue) : rawValue;
          return (
            <div key={key} className="rounded-control border border-line bg-surface-sunken p-3.5">
              <dt className="text-xs text-text-muted">{formatFieldLabel(key, schema)}</dt>
              <dd className="mt-1 text-sm font-semibold text-text">{displayValue}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
