"use client";

import { Badge, EmptyState, ErrorState, Spinner } from "@vsolve/ui";

import { usePartnerRecord } from "@/features/partners/queries";
import { STATUS_LABELS, STATUS_TONE } from "./partner-directory";
import { TaxProfileSection } from "./tax-profile";

/**
 * One Partner's record.
 *
 * ## Documents are listed, never opened here
 *
 * The server publishes each document's kind and verdict and no URL at all. Revealing one goes
 * through the audited access endpoint on the review screen, which mints a short-lived link and
 * records who looked. A management screen that rendered them inline would route around that,
 * so this one deliberately cannot.
 */

const DOCUMENT_LABELS: Record<string, string> = {
  IDENTITY: "Identity",
  ADDRESS: "Address",
  QUALIFICATION: "Qualification",
  BACKGROUND_CHECK: "Background check",
  BANK: "Bank",
};

const DOCUMENT_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  APPROVED: "success",
  PENDING: "neutral",
  SUBMITTED: "neutral",
  REJECTED: "danger",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">{title}</h3>
      {children}
    </section>
  );
}

function Chips({ items, empty }: { items: { code: string; name: string }[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-secondary">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          // Services share a code across variants ("Face Cleanup - Face" and its siblings), so the
          // code alone is not unique and React dropped or mixed up chips.
          key={`${item.code}:${item.name}`}
          className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface-sunken text-text-secondary ring-1 ring-line"
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}

export function PartnerRecord({ partnerId }: { partnerId: string | null }) {
  const record = usePartnerRecord(partnerId);

  if (partnerId === null) {
    return (
      <EmptyState
        title="No partner selected"
        description="Choose someone from the list to see their application details, skills and coverage."
      />
    );
  }

  if (record.isPending) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-text-secondary">
        <Spinner size="sm" />
        Loading the partner record…
      </div>
    );
  }

  if (record.isError || !record.data) {
    return (
      <ErrorState
        severity="warning"
        title="This partner record could not be opened"
        message="Nothing is shown rather than a partial record. If this is your own account, the console refuses it by design."
        actionLabel="Try again"
        onAction={() => void record.refetch()}
      />
    );
  }

  const partner = record.data;

  return (
    <div className="bg-surface border border-line rounded-card p-5 shadow-card space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-text">{partner.display_name}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            {partner.experience_years} years of experience
          </p>
        </div>
        <Badge tone={STATUS_TONE[partner.application_status] ?? "neutral"}>
          {STATUS_LABELS[partner.application_status] ?? partner.application_status}
        </Badge>
      </header>

      {partner.biography ? (
        <p className="text-sm leading-6 text-text">{partner.biography}</p>
      ) : null}

      {partner.change_request_message ? (
        <div className="rounded-card border border-warning-line bg-warning-surface p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-warning-text">
            Changes requested
          </p>
          <p className="mt-1 text-sm text-warning-text">{partner.change_request_message}</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-text-secondary">Submitted</dt>
          <dd className="font-medium text-text">
            {partner.submitted_at ? new Date(partner.submitted_at).toLocaleString() : "Not yet"}
          </dd>
        </div>
        <div>
          <dt className="text-text-secondary">Reviewed</dt>
          <dd className="font-medium text-text">
            {partner.reviewed_at ? new Date(partner.reviewed_at).toLocaleString() : "Not yet"}
          </dd>
        </div>
      </dl>

      <Section title="Skills">
        <Chips items={partner.skills} empty="No skills recorded." />
      </Section>

      <Section title="Services">
        <Chips items={partner.services} empty="No services enabled." />
      </Section>

      <Section title="Service areas">
        <Chips items={partner.service_areas} empty="No service areas assigned." />
      </Section>

      <Section title="Business and tax">
        <TaxProfileSection partnerId={partner.id} profile={partner.business_profile} />
      </Section>

      <Section title="Documents">
        {partner.documents.length === 0 ? (
          <p className="text-sm text-text-secondary">No documents uploaded.</p>
        ) : (
          <ul className="divide-y divide-line">
            {partner.documents.map((document) => (
              <li key={document.id} className="py-2 flex items-center justify-between gap-3">
                <span className="text-sm text-text">
                  {DOCUMENT_LABELS[document.kind] ?? document.kind}
                </span>
                <Badge tone={DOCUMENT_TONE[document.status] ?? "neutral"}>{document.status}</Badge>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-text-secondary">
          Documents are opened from the application review screen, where every reveal is
          recorded.
        </p>
      </Section>

      <Section title="History">
        {partner.transitions.length === 0 ? (
          <p className="text-sm text-text-secondary">No status changes recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {partner.transitions.map((transition) => (
              <li key={transition.id} className="text-sm">
                <span className="text-text">
                  {STATUS_LABELS[transition.from_status] ?? transition.from_status} →{" "}
                  {STATUS_LABELS[transition.to_status] ?? transition.to_status}
                </span>
                <span className="ml-2 text-text-secondary">
                  {new Date(transition.occurred_at).toLocaleString()}
                </span>
                {transition.reason ? (
                  <p className="text-text-secondary">{transition.reason}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}
