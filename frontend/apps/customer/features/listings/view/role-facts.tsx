import { formatFieldLabel } from "../model";
import type { ListingDetail } from "../queries";

export interface RoleFactsProps {
  listing: ListingDetail;
}

export function RoleFacts({ listing }: RoleFactsProps) {
  const fields = (listing.structured_fields || {}) as Record<string, unknown>;

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
        {Object.entries(fields).map(([key, val]) => (
          <div key={key} className="rounded-control border border-line bg-surface-sunken p-3.5">
            <dt className="text-xs text-text-muted">{formatFieldLabel(key)}</dt>
            <dd className="mt-1 text-sm font-semibold text-text">{String(val)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
