import { PackageCheck } from "lucide-react";

import type { QuoteMaterialListRowView } from "../adapters";
import { MaterialListRows } from "./material-list-rows";

export function IncludedSupplyCard({
  rows,
}: {
  rows: readonly QuoteMaterialListRowView[];
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-success-line bg-surface shadow-card">
      <header className="flex gap-3 bg-success-surface px-4 py-4 text-success-text">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface">
          <PackageCheck className="size-5" aria-hidden />
        </span>
        <div>
          <h2 className="text-base font-extrabold text-text">Materials & finish included</h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            The decorator sources, delivers, installs and removes these. You do not need to buy or arrange décor materials.
          </p>
        </div>
      </header>
      {rows.length > 0 ? (
        <div className="px-4 py-2">
          <MaterialListRows rows={rows} />
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-text-secondary">
          The complete supply is included in the quoted work. Ask the decorator if you need a particular brand or finish recorded.
        </p>
      )}
      <p className="border-t border-line px-4 py-3 text-xs leading-5 text-text-muted">
        These are disclosure details, not extra charges. Their cost is already included in the estimate above.
      </p>
    </section>
  );
}
