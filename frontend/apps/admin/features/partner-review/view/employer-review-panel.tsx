"use client";

import type { Schemas } from "@vsolve/api-client";
import { describeError } from "@vsolve/query";
import { Badge, Button, Card, Field, Textarea } from "@vsolve/ui";
import { AlertTriangle, CheckCircle2, Copy, ExternalLink, MapPin } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useSetEmployerCheck } from "../queries";

/**
 * What an Operations reviewer sees of an employer application, and the checks they tick.
 *
 * The details and hints sit above the documents; the checklist sits below them, because every
 * check is about one of the uploaded documents. The server decides what is required and refuses an
 * approval until every required check passes: nothing here keeps a rule of its own.
 */

type Application = Schemas["OperationsPartnerApplicationDetail"];
type Check = Schemas["EmployerCheck"];

/** The portal asks for a captcha, so a reviewer pastes the number in by hand. */
const GST_SEARCH_URL = "https://services.gst.gov.in/services/searchtp";

const ID_TYPES: Record<string, string> = {
  AADHAAR_MASKED: "Masked Aadhaar",
  PAN: "PAN card",
  DRIVING_LICENCE: "Driving licence",
  VOTER_ID: "Voter ID",
  PASSPORT: "Passport",
};

const ROLES: Record<string, string> = {
  OWNER: "Owner / Partner / Director",
  HR: "HR / Recruiter",
  MANAGER: "Manager",
  OTHER: "Other",
};

const STRUCTURES: Record<string, string> = {
  PROPRIETORSHIP: "Proprietorship",
  PARTNERSHIP_LLP: "Partnership / LLP",
  COMPANY: "Company",
  TRUST_SOCIETY_NGO: "Trust / society / NGO",
  GOVERNMENT: "Government",
};

const CATEGORIES: Record<string, string> = {
  SHOP: "Shop / retail",
  RESTAURANT: "Restaurant / food",
  CLINIC: "Clinic / hospital",
  OFFICE: "Office / IT",
  SCHOOL: "School / coaching",
  FACTORY: "Factory / workshop",
  CONSTRUCTION: "Construction",
  FACILITY: "Security / facility services",
  LOGISTICS: "Delivery / logistics",
  HOTEL: "Hotel",
  SALON: "Salon / beauty",
  OTHER: "Other",
};

const SIZES: Record<string, string> = {
  SIZE_1_10: "1-10 staff",
  SIZE_11_50: "11-50 staff",
  SIZE_51_200: "51-200 staff",
  SIZE_200_PLUS: "200+ staff",
};

const PROOFS: Record<string, string> = {
  GST_CERTIFICATE: "GST certificate",
  INCORPORATION_CERTIFICATE: "Incorporation certificate",
  COMPANY_PAN: "Company PAN",
  SHOP_ESTABLISHMENT: "Shop & Establishment licence",
  TRADE_LICENCE: "Trade licence",
  FSSAI: "FSSAI licence",
  CLINIC_REGISTRATION: "Clinic registration",
  UDYAM: "Udyam registration",
};

const label = (names: Record<string, string>, value: string) => (value ? (names[value] ?? value) : "");

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 text-xs sm:grid-cols-[9rem_1fr] sm:gap-3">
      <span className="font-semibold text-text-muted">{name}</span>
      <div className="min-w-0 break-words text-text">{children}</div>
    </div>
  );
}

const NOT_GIVEN = <span className="text-text-muted">Not given</span>;

/** Who the employer is, their GST details and what the platform noticed. */
export function EmployerDetailsPanel({ application }: { application: Application }) {
  const employer = application.employer;
  const hints = application.employer_hints ?? [];
  const [copied, setCopied] = useState(false);
  if (!employer) return null;

  const business = employer.business;
  const individual = employer.hiring_as === "INDIVIDUAL";
  const pinned = business?.latitude && business.longitude;

  async function copyGstin(gstin: string) {
    try {
      await navigator.clipboard.writeText(gstin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5" aria-labelledby="employer-details-title">
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id="employer-details-title"
          className="text-sm font-bold uppercase tracking-wider text-text-secondary"
        >
          Employer details
        </h3>
        <Badge tone={individual ? "info" : "neutral"}>
          {individual ? "Individual" : employer.hiring_as === "BUSINESS" ? "Business" : "Type not chosen"}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-sunken p-3">
        <Row name="Name">{application.display_name || NOT_GIVEN}</Row>
        {employer.poster_role ? <Row name="Role">{label(ROLES, employer.poster_role)}</Row> : null}
        <Row name="ID they will upload">{label(ID_TYPES, employer.id_document_type) || NOT_GIVEN}</Row>
        {employer.email ? <Row name="Email">{employer.email}</Row> : null}
        {individual ? (
          <Row name="Location">
            {[employer.area, employer.city, employer.pin_code].filter(Boolean).join(", ") || NOT_GIVEN}
          </Row>
        ) : null}
      </div>

      {business ? (
        <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-sunken p-3">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={business.logo_url}
              alt="Business logo"
              className="size-14 rounded-control border border-line object-cover"
            />
          ) : null}
          <Row name="Shown on jobs as">{business.trade_name || business.legal_name || NOT_GIVEN}</Row>
          <Row name="Legal name">{business.legal_name || NOT_GIVEN}</Row>
          <Row name="Legal structure">{label(STRUCTURES, business.legal_structure) || NOT_GIVEN}</Row>
          <Row name="Industry · size">
            {[label(CATEGORIES, business.business_category), label(SIZES, business.company_size)]
              .filter(Boolean)
              .join(" · ") || NOT_GIVEN}
          </Row>
          <Row name="Business proof">{label(PROOFS, business.business_proof_type) || NOT_GIVEN}</Row>
          <Row name="Address">
            {[business.address, business.area, business.city, business.state, business.pin_code]
              .filter(Boolean)
              .join(", ") || NOT_GIVEN}
          </Row>
          {pinned ? (
            <Row name="Map pin">
              <a
                href={`https://www.google.com/maps?q=${business.latitude},${business.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-action underline underline-offset-2"
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                View on map
              </a>
            </Row>
          ) : null}
          {business.website_url ? (
            <Row name="Website">
              <a
                href={business.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-action underline underline-offset-2"
              >
                {business.website_url}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </Row>
          ) : null}
          <Row name="GST">
            {business.gst_registered ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{business.gstin}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void copyGstin(business.gstin)}
                  aria-label="Copy GSTIN"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copied ? "Copied" : "Copy"}
                </Button>
                <a
                  href={GST_SEARCH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-action underline underline-offset-2"
                >
                  Open GST portal search
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </span>
            ) : (
              "No GST"
            )}
          </Row>
        </div>
      ) : null}

      {hints.length > 0 ? (
        <section aria-label="Things to look at" className="flex flex-col gap-1.5">
          <h4 className="text-xs font-bold text-text">What we noticed</h4>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {hints.map((hint) => (
              <li
                key={hint.code}
                className={[
                  "flex items-start gap-2 rounded-control border p-2.5 text-xs",
                  hint.level === "WARN"
                    ? "border-warning-line bg-warning-surface text-text"
                    : "border-success-line bg-success-surface text-text",
                ].join(" ")}
              >
                {hint.level === "WARN" ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-label="Warning" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-label="OK" />
                )}
                <span>{hint.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}

const RESULT_TONE = { PASS: "success", FAIL: "danger" } as const;
const RESULT_LABEL = { PASS: "Passed", FAIL: "Failed" } as const;

/** Whether every check this employer needs has been passed. False when there are none to pass. */
export function employerChecklistComplete(application: Application): boolean {
  const checks = application.employer_checks ?? [];
  return checks.length > 0 && checks.every((check) => check.result === "PASS");
}

/**
 * The checks Operations must pass, one row each. Failing one needs a note. Only the reviewer
 * holding the application can record a check; for anyone else the rows are read-only.
 */
export function EmployerChecklist({
  application,
  canRecord,
}: {
  application: Application;
  canRecord: boolean;
}) {
  const checks = application.employer_checks ?? [];
  const record = useSetEmployerCheck();
  const [failing, setFailing] = useState<Check["code"] | null>(null);
  const [note, setNote] = useState("");

  if (application.track !== "EMPLOYER" || checks.length === 0) return null;
  const passed = checks.filter((check) => check.result === "PASS").length;

  function pass(code: Check["code"]) {
    setFailing(null);
    record.mutate({ applicationId: application.id, code, result: "PASS" });
  }

  function fail(code: Check["code"]) {
    record.mutate(
      { applicationId: application.id, code, result: "FAIL", note: note.trim() },
      { onSuccess: () => setFailing(null) },
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5" aria-labelledby="employer-checks-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="employer-checks-title" className="text-base font-bold text-text">
            Employer checklist
          </h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            Check each against the documents above. Every one must pass before this employer can be
            approved.
          </p>
        </div>
        <span className="rounded-full border border-line bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-800">
          {passed} of {checks.length} passed
        </span>
      </div>

      {canRecord ? null : (
        <p className="text-xs text-text-secondary">Claim this application to record the checks.</p>
      )}

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {checks.map((check) => (
          <li key={check.code} className="rounded-control border border-line p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold text-text">{check.label}</p>
              {check.result ? (
                <Badge tone={RESULT_TONE[check.result]}>{RESULT_LABEL[check.result]}</Badge>
              ) : (
                <Badge tone="neutral">Not checked</Badge>
              )}
            </div>

            {check.result && check.checked_at ? (
              <p className="mt-1 text-[11px] text-text-muted">
                {check.checked_by_name || "A reviewer"} ·{" "}
                <time dateTime={check.checked_at}>
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(check.checked_at))}
                </time>
              </p>
            ) : null}
            {check.result === "FAIL" && check.note ? (
              <p className="mt-1.5 rounded bg-surface-sunken p-2 text-xs text-text-secondary">
                {check.note}
              </p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={check.result === "PASS" ? "primary" : "outline"}
                disabled={!canRecord || record.isPending}
                onClick={() => pass(check.code)}
                aria-label={`Pass: ${check.label}`}
              >
                Pass
              </Button>
              <Button
                size="sm"
                variant={check.result === "FAIL" ? "danger" : "outline"}
                disabled={!canRecord || record.isPending}
                onClick={() => {
                  setFailing(check.code);
                  setNote(check.result === "FAIL" ? check.note : "");
                }}
                aria-label={`Fail: ${check.label}`}
              >
                Fail
              </Button>
            </div>

            {failing === check.code ? (
              <div className="mt-3 rounded-control bg-surface-sunken p-3">
                <Field label="Why did it fail?" description="Kept in the record." required>
                  <Textarea
                    rows={2}
                    maxLength={480}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </Field>
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={note.trim().length === 0}
                    loading={record.isPending}
                    loadingLabel="Recording…"
                    onClick={() => fail(check.code)}
                  >
                    Record fail
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFailing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {record.isError ? (
        <p role="alert" className="text-xs font-semibold text-danger-text">
          {describeError(record.error, "mutation").message}
        </p>
      ) : null}
    </Card>
  );
}
