import { Flag, ShieldCheck } from "lucide-react";
import type { ListingDetail } from "../queries";

export interface JdSectionsProps {
  listing: ListingDetail;
  onOpenReport: () => void;
}

export function JdSections({ listing, onOpenReport }: JdSectionsProps) {
  return (
    <>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Job Description
        </h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
          {listing.description}
        </p>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-slate-50 p-4.5 text-xs text-slate-600">
        <div className="flex items-center gap-2 font-semibold text-indigo-950 text-sm">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          Privacy-Protected Contact Exchange
        </div>
        <p className="mt-1.5 leading-relaxed text-slate-600">
          Hiring contact info:
          <span className="mx-1 font-mono font-medium text-slate-800">
            {listing.contact_masked?.phone || "+91 98••••••88"}
          </span>
          |
          <span className="mx-1 font-mono font-medium text-slate-800">
            {listing.contact_masked?.email || "co••••@example.com"}
          </span>
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          Neither your direct phone nor email is published publicly. Verified posters unlock candidate
          details only for legitimate recruitment interviews.
        </p>
      </div>

      <div className="pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={onOpenReport}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-rose-600"
        >
          <Flag className="h-3.5 w-3.5" />
          Report suspicious or abusive job listing
        </button>
      </div>
    </>
  );
}
