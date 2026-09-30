import Link from "next/link";
import {
  BriefcaseBusiness,
  Building,
  Clock,
  Coins,
  Flame,
  MapPin,
  Users,
} from "lucide-react";
import { Badge, Card, formatMoney, formatMoneyText, formatDate } from "@vsolve/ui";

import { listingFields, type Listing } from "../queries";

export interface ListingRowProps {
  listing: Listing;
}

export function ListingRow({ listing }: ListingRowProps) {
  const fields = listingFields(listing.structured_fields);
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
  } else if (fields.pay_range || fields.salary_range || fields.compensation) {
    displayPay = formatMoneyText(String(fields.pay_range || fields.salary_range || fields.compensation));
  }

  const roleType = fields.role_type || fields.employment_type;
  const experience = fields.experience_years || fields.experience;
  const shift = fields.shift || fields.work_mode;

  return (
    <Link href={`/listings/${listing.id}`} className="group block focus-visible:outline-none">
      <Card
        className={`relative transition duration-fast hover:-translate-y-0.5 hover:shadow-raised ${
          listing.is_premium
            ? "border-signal-300/80 bg-gradient-to-r from-signal-50/40 via-surface to-surface ring-1 ring-signal-200"
            : "hover:border-line-strong"
        }`}
      >
        {listing.is_premium && (
          <div className="absolute top-4 right-4">
            <Badge tone="action" dot>
              <Flame className="size-3.5 text-signal-600" />
              Featured
            </Badge>
          </div>
        )}

        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2.5 flex-1 pr-16">
            {/* Employer and Location */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-text-muted">
              <span className="flex items-center gap-1 font-medium text-text-secondary">
                <Building className="size-3.5 text-text-muted" />
                {listing.poster_name || "Verified Employer"}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5 text-text-muted" />
                {listing.location_text || "Location on application"}
              </span>
              {listing.published_at && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    Posted {formatDate(listing.published_at)}
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold tracking-tight text-text group-hover:text-text-link transition">
              {listing.title}
            </h2>

            {/* Summary list payloads omit description (ListingDetail only). */}
            {(fields.summary || fields.description) ? (
              <p className="line-clamp-2 text-sm leading-relaxed text-text-secondary">
                {String(fields.summary || fields.description)}
              </p>
            ) : null}

            {/* Badges / Structured Fields */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {displayPay ? (
                <Badge tone="success">
                  <Coins className="size-3.5" />
                  {String(displayPay)}
                </Badge>
              ) : null}

              {roleType ? (
                <Badge tone="neutral">
                  <BriefcaseBusiness className="size-3.5" />
                  {String(roleType)}
                </Badge>
              ) : null}

              {experience ? (
                <Badge tone="neutral">
                  {String(experience)} Exp
                </Badge>
              ) : null}

              {shift ? (
                <Badge tone="neutral">
                  {String(shift)}
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Right side stats */}
          <div className="flex md:flex-col items-center md:items-end justify-between border-t md:border-t-0 pt-3 md:pt-0 border-line">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 text-xs font-medium text-text-secondary border border-line">
              <Users className="size-3.5 text-text-muted" />
              {listing.application_count}{" "}
              {listing.application_count === 1 ? "applicant" : "applicants"}
            </span>
            <span className="mt-auto hidden md:inline-flex items-center gap-1 text-xs font-semibold text-text-link group-hover:underline">
              View & Apply &rarr;
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
