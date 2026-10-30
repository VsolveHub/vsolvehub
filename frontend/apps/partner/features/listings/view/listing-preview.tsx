import { Briefcase, Building, Coins, MapPin } from "lucide-react";
import { formatMoney, useT } from "@vsolve/ui";

import { payPaise, type PayMode } from "../model";

export interface ListingPreviewProps {
  title: string;
  serviceName?: string;
  location: string;
  description: string;
  payMode: PayMode;
  salaryMin: string;
  salaryMax: string;
  salaryPeriod: string;
  experience: string;
  roleType: string;
  shift: string;
}

function payLabel(props: Pick<
  ListingPreviewProps,
  "payMode" | "salaryMin" | "salaryMax" | "salaryPeriod"
>): string {
  const bounds = payPaise({
    pay_mode: props.payMode,
    salary_min_rupees: props.salaryMin,
    salary_max_rupees: props.salaryMax,
  });
  if (!bounds) return "";
  const minStr = formatMoney(bounds.min);
  const amount =
    props.payMode === "exact" || bounds.max <= bounds.min
      ? minStr
      : `${minStr} – ${formatMoney(bounds.max)}`;
  return props.salaryPeriod ? `${amount} / ${props.salaryPeriod.toLowerCase()}` : amount;
}

export function ListingPreview(props: ListingPreviewProps) {
  const t = useT();
  const pay = payLabel(props);
  const facts = [props.roleType, props.experience, props.shift].filter(Boolean);

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-muted">
        {t("listings.preview.note")}
      </p>
      <article className="rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-sunken text-navy-900">
            <Building className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xl font-bold tracking-tight text-navy-900">
              {props.title.trim() || t("listings.preview.jobTitlePlaceholder")}
            </h3>
            <p className="text-xs text-text-secondary">
              {props.serviceName?.trim() || t("listings.preview.verifiedEmployer")}
            </p>
          </div>
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-sm text-text-secondary">
          <MapPin className="size-4 text-text-muted" />
          {props.location.trim() || t("listings.preview.locationPlaceholder")}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pay ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-3 py-1 text-xs font-semibold text-text">
              <Coins className="size-3.5 text-text-muted" />
              {pay}
            </span>
          ) : null}
          {facts.map((fact) => (
            <span
              key={fact}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-sunken px-3 py-1 text-xs font-medium text-text-secondary"
            >
              <Briefcase className="size-3.5 text-text-muted" />
              {fact}
            </span>
          ))}
        </div>

        <h4 className="mt-5 text-xs font-bold uppercase tracking-wider text-text-muted">
          {t("listings.preview.jobDescription")}
        </h4>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
          {props.description.trim()}
        </p>

        <div className="mt-5 flex justify-end">
          <span className="rounded-control bg-action px-4 py-2 text-xs font-bold text-action-text">
            {t("listings.preview.apply")}
          </span>
        </div>
      </article>
    </div>
  );
}
