"use client";

import { useQuery } from "@tanstack/react-query";
import { Badge } from "@vsolve/ui";
import { Briefcase, Clock, Gift, Languages, MapPin, Users } from "lucide-react";

import { fetchJobOptions, type JobOptions, type ListingDetail } from "../queries";

type Option = { value: string; label: string };

function labelOf(options: readonly Option[] | undefined, value: string | null | undefined) {
  if (!value) return "";
  return options?.find((o) => o.value === value)?.label ?? value;
}

function clock(value: string | null | undefined): string {
  if (!value) return "";
  const [h = 0, m = 0] = value.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 || 12;
  return m ? `${hour}:${String(m).padStart(2, "0")} ${suffix}` : `${hour} ${suffix}`;
}

/**
 * What a job needs and offers, as tappable-form jobs record it: people needed, must-have and
 * good-to-have skills, timings, duties and benefits. Renders nothing for older listings.
 */
export function JobHighlights({ listing }: { listing: ListingDetail }) {
  const options = useQuery({ queryKey: ["job-options"], queryFn: fetchJobOptions, staleTime: 3600_000 });
  const opts = options.data as JobOptions | undefined;
  const required = (listing.required_skills as string[] | undefined) ?? [];
  const preferred = (listing.preferred_skills as string[] | undefined) ?? [];
  const duties = (listing.responsibilities as string[] | undefined) ?? [];
  const benefits = (listing.benefits as string[] | undefined) ?? [];
  const languages = ((listing.languages as string[] | undefined) ?? []).map((l) =>
    labelOf(opts?.languages, l),
  );
  if (!listing.city && !listing.job_category && required.length === 0) return null;

  const timings =
    listing.timing_start && listing.timing_end
      ? `${clock(listing.timing_start)} – ${clock(listing.timing_end)}`
      : "";
  const facts = [
    { icon: Users, text: `${listing.vacancies ?? 1} ${(listing.vacancies ?? 1) === 1 ? "person" : "people"} needed` },
    { icon: Briefcase, text: [labelOf(opts?.job_types, listing.job_type), labelOf(opts?.experience_bands, listing.experience_band)].filter(Boolean).join(" · ") },
    { icon: Clock, text: [labelOf(opts?.shifts, listing.shift), timings, listing.weekly_off && listing.weekly_off !== "NONE" ? `${labelOf(opts?.weekly_offs, listing.weekly_off)} off` : ""].filter(Boolean).join(" · ") },
    { icon: MapPin, text: [listing.location_text, labelOf(opts?.work_modes, listing.work_mode)].filter(Boolean).join(" · ") },
    { icon: Languages, text: languages.length ? `Speaks ${languages.join(", ")}` : "" },
    { icon: Gift, text: listing.min_qualification ? `Qualification: ${labelOf(opts?.qualifications, listing.min_qualification)}` : "" },
  ].filter((fact) => fact.text);

  return (
    <section className="flex flex-col gap-5">
      {listing.urgency && listing.urgency !== "NORMAL" ? (
        <Badge tone="warning" className="self-start">
          {labelOf(opts?.urgencies, listing.urgency)}
        </Badge>
      ) : null}
      <ul className="grid gap-2 sm:grid-cols-2">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2 rounded-control border border-line bg-surface-sunken p-3 text-sm text-text">
            <Icon className="mt-0.5 size-4 shrink-0 text-action" aria-hidden />
            {text}
          </li>
        ))}
      </ul>
      {required.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Must have</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {required.map((s) => (
              <li key={s}><Badge tone="info">✓ {s}</Badge></li>
            ))}
          </ul>
        </div>
      ) : null}
      {preferred.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Good to have</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {preferred.map((s) => (
              <li key={s}><Badge>{s}</Badge></li>
            ))}
          </ul>
        </div>
      ) : null}
      {duties.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">What you will do</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text">
            {duties.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {benefits.length > 0 ? (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">Benefits</h3>
          <p className="mt-2 text-sm text-text">{benefits.join(" · ")}</p>
        </div>
      ) : null}
      <p className="text-xs text-text-secondary">
        This job is shown based on what the employer shared. Please read the full details before
        applying.
      </p>
    </section>
  );
}
