import type { ListingDetail } from "../queries";

export interface RoleFactsProps {
  listing: ListingDetail;
}

export function RoleFacts({ listing }: RoleFactsProps) {
  const fields = (listing.structured_fields || {}) as Record<string, unknown>;

  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Role Details & Requirements
      </h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {listing.service_name && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <dt className="text-xs text-slate-500">Category Service</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{listing.service_name}</dd>
          </div>
        )}
        {Object.entries(fields).map(([key, val]) => (
          <div key={key} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
            <dt className="text-xs capitalize text-slate-500">{key.replaceAll("_", " ")}</dt>
            <dd className="mt-1 text-sm font-semibold text-slate-900">{String(val)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
