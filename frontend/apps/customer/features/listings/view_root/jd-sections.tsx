"use client";

import { useState } from "react";
import { Flag, ShieldCheck } from "lucide-react";
import type { ListingDetail } from "../queries";

export interface JdSectionsProps {
  listing: ListingDetail;
  onOpenReport: () => void;
}

export function JdSections({ listing, onOpenReport }: JdSectionsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongDescription = (listing.description?.length ?? 0) > 250;

  return (
    <>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">
          Job Description
        </h3>
        <p
          className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary ${
            !isExpanded && isLongDescription ? "line-clamp-6" : ""
          }`}
        >
          {listing.description}
        </p>
        {isLongDescription && (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="mt-2 inline-flex items-center text-xs font-semibold text-text-link hover:underline"
          >
            {isExpanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      <div className="rounded-card border border-navy-200 bg-navy-50/60 p-4.5 text-xs text-text-secondary">
        <div className="flex items-center gap-2 font-semibold text-navy-950 text-sm">
          <ShieldCheck className="size-4 text-navy-700" />
          Privacy-Protected Contact Exchange
        </div>
        <p className="mt-1.5 leading-relaxed text-text-secondary">
          Hiring contact info:
          <span className="mx-1 font-mono font-medium text-navy-950">
            {listing.contact_masked?.phone || "+91 98••••••88"}
          </span>
          |
          <span className="mx-1 font-mono font-medium text-navy-950">
            {listing.contact_masked?.email || "co••••@example.com"}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-text-muted">
          Neither your direct phone nor email is published publicly. Verified posters unlock candidate
          details only for legitimate recruitment interviews.
        </p>
      </div>

      <div className="pt-2 border-t border-line">
        <button
          type="button"
          onClick={onOpenReport}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-muted transition hover:text-text hover:underline"
        >
          <Flag className="size-3.5" />
          Report suspicious or abusive job listing
        </button>
      </div>
    </>
  );
}
