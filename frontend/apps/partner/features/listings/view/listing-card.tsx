import Link from "next/link";
import { Briefcase, Check, CheckCircle2, Copy, IndianRupee, MapPin, Pencil, RotateCcw, Send, UserPlus, Users, XCircle } from "lucide-react";
import { Badge, Card, StatusChip, formatMoney, formatMoneyText, formatDate, useT } from "@vsolve/ui";

import type { PartnerListing } from "../queries";

export interface ListingCardProps {
  listing: PartnerListing;
  /** Put a draft live, or reopen a closed job, at once. */
  onPublishNow: (id: string) => void;
  onDuplicate: (id: string) => void;
  onStartEdit: (listing: PartnerListing) => void;
  onAction: (params: {
    id: string;
    next: "submit" | "publish" | "republish" | "close";
    reason?: string;
  }) => void;
  isActionPending: boolean;
}

export function ListingCard({
  listing,
  onPublishNow,
  onDuplicate,
  onStartEdit,
  onAction,
  isActionPending,
}: ListingCardProps) {
  const t = useT();
  let displayPay = "";
  if (listing.salary_min_paise && listing.salary_min_paise > 0) {
    const minStr = formatMoney(listing.salary_min_paise);
    if (listing.salary_max_paise && listing.salary_max_paise > listing.salary_min_paise) {
      displayPay = `${minStr} - ${formatMoney(listing.salary_max_paise)}`;
    } else {
      displayPay = minStr;
    }
    if (listing.salary_period) {
      displayPay += ` / ${listing.salary_period.toLowerCase()}`;
    }
  } else if (listing.salary_display) {
    displayPay = formatMoneyText(listing.salary_display);
  } else if (listing.structured_fields?.salary_range) {
    displayPay = formatMoneyText(String(listing.structured_fields.salary_range));
  }

  const exp = listing.structured_fields?.experience_years
    ? String(listing.structured_fields.experience_years)
    : "";
  const skills = (listing.required_skills as string[] | undefined) ?? [];
  // Jobs made with the quick form publish at once; older long-form ones keep the review step.
  const quickJob = Boolean(listing.city || listing.job_category);

  return (
    <Card className="p-5 transition duration-fast hover:border-line-strong hover:shadow-raised">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-navy-900">{listing.title}</h2>
          </div>
          
          {listing.service_name && (
            <div className="text-sm font-semibold text-text-secondary">
              {listing.service_name} {listing.poster_name ? `· ${listing.poster_name}` : ""}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
            {listing.location_text && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 text-text-muted" />
                {listing.location_text}
              </span>
            )}
            {exp && (
              <span className="flex items-center gap-1.5">
                <Briefcase className="size-4 text-text-muted" />
                {exp}
              </span>
            )}
            {displayPay && (
              <span className="flex items-center gap-1.5">
                <IndianRupee className="size-4 text-text-muted" />
                {displayPay}
              </span>
            )}
          </div>

          {quickJob ? (
            <p className="text-sm font-semibold text-navy-900">
              👥 {t("listings.card.vacanciesNeeded", { count: listing.vacancies ?? 1 })}
            </p>
          ) : null}
          {skills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {skills.slice(0, 5).map((skill) => (
                <Badge key={skill} tone="info">
                  {skill}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="line-clamp-2 text-sm text-text-secondary mt-2">{listing.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <StatusChip status={listing.status} category="listing" />
            
            {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
              <Badge tone="info">
                <CheckCircle2 className="size-3" /> {t("listings.card.moderationApproved")}
              </Badge>
            )}

            <span className="text-xs text-text-muted">
              {t("listings.card.created", { date: formatDate(listing.created_at) })}
            </span>
          </div>

          {listing.counts ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary" aria-label={t("listings.card.jobActivityAriaLabel")}>
              <li>👁 {t("listings.card.views", { count: listing.counts.views })}</li>
              <li>{t("listings.card.applied", { count: listing.counts.applied })}</li>
              <li>{t("listings.card.shortlisted", { count: listing.counts.shortlisted })}</li>
              <li>{t("listings.card.interviews", { count: listing.counts.interviews })}</li>
              <li>{t("listings.card.connected", { count: listing.counts.connected })}</li>
            </ul>
          ) : null}

          {listing.moderation_reason && (
            <div className="mt-2 rounded-control border border-warning-line bg-warning-surface p-2.5 text-xs text-warning-text">
              <span className="font-semibold">{t("listings.card.moderationNote")}</span> {listing.moderation_reason}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 lg:flex-col lg:items-end">
          <Link
            href={`/listings/${listing.id}`}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text transition hover:border-line-strong hover:bg-surface-hover"
          >
            <Users className="size-3.5 text-action" />
            {t("listings.card.viewApplicants", { count: listing.application_count })}
          </Link>

          {(listing.counts?.matches ?? 0) > 0 ? (
            <Link
              href={`/listings/${listing.id}?view=matches`}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text transition hover:border-line-strong hover:bg-surface-hover"
            >
              <UserPlus className="size-3.5 text-action" />
              {t("listings.card.matchingCandidates", { count: listing.counts?.matches ?? 0 })}
            </Link>
          ) : null}

          {["DRAFT", "PUBLISHED"].includes(listing.status) && quickJob && (
            <Link
              href={`/listings/post?edit=${listing.id}`}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text-secondary transition hover:border-line-strong hover:bg-surface-hover"
            >
              <Pencil className="size-3.5 text-text-muted" /> {t("listings.card.editJob")}
            </Link>
          )}

          <button
            type="button"
            onClick={() => onDuplicate(listing.id)}
            disabled={isActionPending}
            className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text-secondary transition hover:border-line-strong hover:bg-surface-hover disabled:opacity-50"
          >
            <Copy className="size-3.5 text-text-muted" /> {t("listings.card.postAgain")}
          </button>

          {listing.status === "DRAFT" && quickJob && (
            <button
              type="button"
              onClick={() => onPublishNow(listing.id)}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control bg-action px-3.5 py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover disabled:opacity-50"
            >
              <Send className="size-3.5" /> {t("listings.card.publishNow")}
            </button>
          )}

          {["DRAFT", "PUBLISHED"].includes(listing.status) && !quickJob && (
            <button
              type="button"
              onClick={() => onStartEdit(listing)}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface px-3.5 py-2 text-xs font-semibold text-text-secondary transition hover:border-line-strong hover:bg-surface-hover"
            >
              <Pencil className="size-3.5 text-text-muted" /> {t("listings.card.editJob")}
            </button>
          )}

          {listing.status === "DRAFT" && !quickJob && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "submit" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control bg-action px-3.5 py-2 text-xs font-semibold text-action-text shadow-card transition hover:bg-action-hover active:bg-action-active disabled:opacity-50"
            >
              <Send className="size-3.5" /> {t("listings.card.publishNow")}
            </button>
          )}

          {listing.moderation_status === "APPROVED" && listing.status !== "PUBLISHED" && (
            <button
              type="button"
              onClick={() => onAction({ id: listing.id, next: "publish" })}
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control bg-navy-900 px-3.5 py-2 text-xs font-semibold text-warm-0 transition hover:bg-navy-800 disabled:opacity-50"
            >
              <Check className="size-3.5" /> {t("listings.card.publishLive")}
            </button>
          )}

          {listing.status === "PUBLISHED" && (
            <button
              type="button"
              onClick={() =>
                onAction({
                  id: listing.id,
                  next: "close",
                  reason: "Filled position or partner closed",
                })
              }
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-text-muted hover:border-danger-line hover:text-danger-text hover:bg-danger-surface/20 disabled:opacity-50"
            >
              <XCircle className="size-3.5 text-text-muted" /> {t("listings.card.closeJob")}
            </button>
          )}

          {["CLOSED", "EXPIRED"].includes(listing.status) && (
            <button
              type="button"
              onClick={() =>
                quickJob
                  ? onPublishNow(listing.id)
                  : onAction({ id: listing.id, next: "republish" })
              }
              disabled={isActionPending}
              className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              <RotateCcw className="size-3.5 text-text-muted" /> {t("listings.card.reopen")}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
