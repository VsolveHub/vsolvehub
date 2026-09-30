"use client";

import {
  captureAttribution,
  composeProjectTotalPaise,
  composeWorkforceTotalPaise,
  composerFor,
  describeError,
  invitedVendors,
  isAssistedQuestion,
  requestSiteVisits,
  type ComposableArchetype,
  type InvitedVendor,
  type ProposalTaxBasis,
} from "@vsolve/query";
import type { Schemas } from "@vsolve/api-client";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  formatMoney,
  formatDate,
} from "@vsolve/ui";
import { useMemo, useState } from "react";

import {
  useAssistedClarification,
  useAssistedProposal,
  useRequestTimeline,
  type AssistedProposalBody,
} from "../queries";

/**
 * `M2-FE-705`: writing down what a vendor said on the phone.
 *
 * Revision 4 makes this a **primary path** rather than a convenience, and only
 * for the quote-flow **fallback**: on the rate-card path there is nothing to
 * compose, because the platform published the price. On the fallback, the
 * vendors who answer fastest are often the ones who will not fill in a form.
 *
 * ## Operations never becomes the vendor
 *
 * Three things hold that line, and none of them is copy:
 *
 * 1. `capture_assisted_proposal` writes `vendor_confirmed_at: null`, and every
 *    Customer-facing read filters on it. The Customer **cannot see the quote**
 *    until the vendor confirms it themselves. There is no route that skips that
 *    state, and this screen renders it as the loud, permanent middle step it is.
 * 2. The wage floor is derived and enforced identically to a vendor's own
 *    submission, so a captured A3 rate below the statutory floor is refused with
 *    the same `m2_proposal_below_wage_floor` the vendor would have got.
 * 3. `07 §7` puts "author a proposal without vendor confirmation" in Operations'
 *    *may never* column, and the enforcement is that no endpoint exists.
 *
 * ## A captured clarification is never an ordinary vendor question
 *
 * `asked_by_role` is published and derived by identity comparison rather than
 * inference, and `OPERATIONS` exists as its own value precisely so an assisted
 * question cannot arrive looking like one the vendor typed. This screen reads
 * that field; it does not guess from the shape of the row.
 *
 * ## The vendor picker is the timeline's own invitations
 *
 * Real data, not a typed id: `VENDOR_INVITED` events name the vendor, and this
 * is the one projection in M2 that does so beside a requirement before the
 * Customer has paid — safe because the audience is Operations. **Not filtered by
 * status.** Which invitations may still carry a quote is `submit_proposal`'s
 * rule, and a copy of it here would offer or withhold the wrong vendor the first
 * time the two drifted.
 */

const CONSENT_SENTENCE =
  "I read this back to the vendor and they agreed to Vsolve recording it on their behalf.";

function Refusal({ error }: { error: unknown }) {
  const presentation = describeError(error, "mutation");
  return (
    <ErrorState
      inline
      className="mt-3"
      severity={presentation.severity}
      title={presentation.title}
      message={presentation.message}
      reference={presentation.reference}
    />
  );
}

function VendorPicker({
  vendors,
  value,
  onChange,
}: {
  vendors: readonly InvitedVendor[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field
      label="Which vendor are you on the phone to"
      description="Every vendor invited to this request. The server decides whether theirs can still carry a quote."
      required
    >
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Choose a vendor…</option>
        {vendors.map((vendor) => (
          <option key={vendor.invitationId} value={vendor.invitationId}>
            {vendor.partnerName}
            {vendor.status === "" ? "" : ` — ${vendor.status.replaceAll("_", " ").toLowerCase()}`}
            {vendor.wave === null ? "" : ` (wave ${vendor.wave})`}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * The call script, and the consent control at the step where consent is asked.
 *
 * The tick lives **here** rather than at the bottom of the composer because this
 * is where the operator obtains it: step five is the sentence they say, and the
 * box is the record of the answer. A checkbox at the end of a form, after the
 * call, is a box somebody ticks to enable a button.
 *
 * Contract 1.33.0 is why this is a real control at all. `capture_assisted_proposal`
 * has always refused without `consent_recorded`, but until C7 the view passed
 * `True` unconditionally — so the refusal could not fire and every assisted quote
 * wrote an audit row asserting a consent nobody had recorded. **Whatever is
 * ticked here is what goes on the wire**, unticked included: it sends `false` and
 * the server refuses, which is the correct outcome. Nothing in this file supplies
 * a value the operator did not.
 */
function CallScript({
  vendorName,
  consent,
  onConsentChange,
}: {
  vendorName: string;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
}) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text">Call script</h3>
      <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-text-secondary">
        <li>
          &ldquo;This is Vsolve Hub calling about a job request. Am I speaking to{" "}
          <strong className="text-text">{vendorName || "the vendor"}</strong>?&rdquo;
        </li>
        <li>Read the request back — what the work is, where, when it is needed by.</li>
        <li>
          Ask for their price <em>in their own terms</em>. Do not suggest a number, do not say what
          anyone else quoted, and do not tell them what the customer&rsquo;s budget is.
        </li>
        <li>
          Read the whole quote back to them, line by line, including the total.
        </li>
        <li>
          &ldquo;May I record this quote on your behalf? You will get it to confirm yourself, and
          the customer will not see it until you do.&rdquo;
          <div className="mt-2 rounded-control border border-line bg-surface-sunken p-3">
            <label className="flex items-start gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(event) => onConsentChange(event.target.checked)}
              />
              <span>{CONSENT_SENTENCE}</span>
            </label>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {consent ? (
                <>
                  This will be sent as <strong className="text-text">consent recorded: yes</strong>{" "}
                  and written to the audit trail against your account and{" "}
                  {vendorName || "the vendor"}&rsquo;s name. Tick it only if they said yes.
                </>
              ) : (
                <>
                  Unticked is sent as{" "}
                  <strong className="text-text">consent recorded: no</strong> — not left out — and
                  the server will refuse the capture. That is deliberate: an assisted quote with no
                  recorded consent is exactly the row that should not exist.
                </>
              )}
            </p>
          </div>
        </li>
        <li>Tell them a confirmation is coming and that the quote does nothing until they act.</li>
      </ol>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Clarification
   --------------------------------------------------------------------------- */

function ClarificationPanel({
  requirementId,
  vendors,
}: {
  requirementId: string;
  vendors: readonly InvitedVendor[];
}) {
  const capture = useAssistedClarification(requirementId);
  const [invitationId, setInvitationId] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [consent, setConsent] = useState(false);

  const ready =
    invitationId !== "" && question.trim() !== "" && answer.trim() !== "" && consent;
  const captured = capture.data ?? null;

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text">Capture a clarification</h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        The question is the <strong>vendor&rsquo;s</strong> and the answer is the{" "}
        <strong>customer&rsquo;s</strong>. You are recorded beside them, not in place of them.
      </p>

      <div className="mt-4 space-y-3">
        <VendorPicker vendors={vendors} value={invitationId} onChange={setInvitationId} />
        <Field label="What the vendor asked" required>
          <Textarea
            value={question}
            rows={3}
            maxLength={4000}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </Field>
        <Field label="What the customer answered" required>
          <Textarea
            value={answer}
            rows={3}
            maxLength={4000}
            onChange={(event) => setAnswer(event.target.value)}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>{CONSENT_SENTENCE}</span>
        </label>
      </div>

      {capture.isError ? <Refusal error={capture.error} /> : null}

      {captured !== null ? (
        <div className="mt-3 rounded-control bg-surface-sunken p-3 text-sm">
          <Badge tone={isAssistedQuestion(captured) ? "info" : "warning"}>
            {isAssistedQuestion(captured)
              ? "Recorded as an Operations-assisted question"
              : `Recorded as asked by ${captured.asked_by_role.toLowerCase()}`}
          </Badge>
          <p className="mt-2 text-text-secondary">
            Both parties see this on their own timeline, attributed as above.
          </p>
        </div>
      ) : null}

      <Button
        className="mt-3"
        disabled={!ready || capture.isPending}
        loading={capture.isPending}
        loadingLabel="Recording"
        onClick={() =>
          capture.mutate(
            { invitationId, question, answer, consentRecorded: consent },
            {
              onSuccess: () => {
                setQuestion("");
                setAnswer("");
                setConsent(false);
              },
            },
          )
        }
      >
        Record this clarification
      </Button>
      {!consent ? (
        <p className="mt-2 text-sm text-text-secondary">
          Consent is a refusal, not a flag — without it the capture does not happen at all.
        </p>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   Quote capture
   --------------------------------------------------------------------------- */

interface StageDraft {
  readonly id: number;
  title: string;
  amountRupees: string;
  deliverable: string;
}

function rupeesToPaise(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "" || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const paise = Math.round(Number.parseFloat(trimmed) * 100);
  return Number.isSafeInteger(paise) ? paise : null;
}

function QuotePanel({
  requirementId,
  archetype,
  vendors,
  siteVisits,
  invitationId,
  onInvitationChange,
  consent,
  onConsentSpent,
}: {
  requirementId: string;
  archetype: ComposableArchetype;
  vendors: readonly InvitedVendor[];
  siteVisits: readonly { siteVisitId: string; status: string; at: string }[];
  /** Lifted, so the call script can name the vendor the quote is actually for. */
  invitationId: string;
  onInvitationChange: (value: string) => void;
  /** Lifted, and obtained on the call script where the question is asked. */
  consent: boolean;
  /** Clears the tick once it has been spent — consent is per quote, not per session. */
  onConsentSpent: () => void;
}) {
  const capture = useAssistedProposal(requirementId);

  const [taxBasis, setTaxBasis] = useState<ProposalTaxBasis>("INCLUSIVE");
  // Starts empty and is required. `tax_paise` carries a server-side default of
  // zero, and taking it would mean this screen quietly declaring "no tax" on
  // behalf of a vendor who was never asked — on a quote that becomes an
  // agreement. Zero is a perfectly good answer; it just has to be given.
  const [taxRupees, setTaxRupees] = useState("");

  // A3
  const [rate, setRate] = useState("");
  const [workers, setWorkers] = useState("");
  const [days, setDays] = useState("");

  // A5
  const [stages, setStages] = useState<StageDraft[]>([
    { id: 1, title: "", amountRupees: "", deliverable: "" },
  ]);
  const [siteVisitId, setSiteVisitId] = useState("");

  const workforceTotal =
    archetype === "A3_TIME_BLOCK"
      ? composeWorkforceTotalPaise({
          ratePaisePerWorkerDay: rupeesToPaise(rate) ?? 0,
          workerCount: Number.parseInt(workers, 10) || 0,
          minimumDays: Number.parseInt(days, 10) || 0,
        })
      : null;

  const stagePaise = stages.map((stage) => rupeesToPaise(stage.amountRupees));
  const projectTotal =
    archetype === "A5_CUSTOM_PROJECT" && stagePaise.every((value) => value !== null)
      ? composeProjectTotalPaise(
          stagePaise.map((value) => ({ amountPaise: value as number })),
          [],
        )
      : null;

  const total = archetype === "A3_TIME_BLOCK" ? workforceTotal : projectTotal;

  const taxPaise = taxRupees.trim() === "" ? null : (rupeesToPaise(taxRupees) ?? null);
  const taxValid = taxPaise !== null && taxPaise >= 0;

  const stagesReady =
    archetype === "A5_CUSTOM_PROJECT" &&
    stages.length > 0 &&
    stages.every((stage, index) => stage.title.trim() !== "" && stagePaise[index] !== null);

  /**
   * What makes the request well-formed — and **consent is deliberately not in it.**
   *
   * The obvious move is to disable the button until the box is ticked. It is the
   * wrong one here. Consent is a server-side refusal (`capture_assisted_proposal`
   * raises without it, and since 1.33.0 that refusal can actually fire), and a
   * client that greys the control out is a client keeping its own copy of an
   * authorization answer — the argument `step-up-gate.tsx` already settled for
   * refunds on this app. It also means `consent_recorded: false` would never
   * reach the wire, so the field the whole change exists for would be untestable
   * from the only screen that sends it.
   *
   * So the button stays live, the value sent is whatever was ticked, and the
   * screen says plainly what pressing it will do. The server decides.
   */
  const wellFormed =
    invitationId !== "" &&
    taxValid &&
    total !== null &&
    total > 0 &&
    (archetype === "A3_TIME_BLOCK" ? true : stagesReady && siteVisitId !== "");

  const captured = capture.data ?? null;

  function submit() {
    if (total === null || taxPaise === null) return;
    const base = {
      invitation_id: invitationId,
      total_paise: total,
      tax_basis: taxBasis,
      tax_paise: taxPaise,
      // Whatever the operator ticked on the call script, including `false`.
      // Never a literal `true` and never omitted: a hard-coded value here would
      // put back the exact defect 1.33.0 removed from the view, one layer up and
      // worse — the server would then be faithfully recording a consent this
      // client invented.
      consent_recorded: consent,
    };

    const body: AssistedProposalBody =
      archetype === "A3_TIME_BLOCK"
        ? {
            ...base,
            rate_paise_per_worker_day: rupeesToPaise(rate),
            worker_count: Number.parseInt(workers, 10),
            minimum_days: Number.parseInt(days, 10),
          }
        : {
            ...base,
            site_visit_id: siteVisitId,
            stages: stages.map((stage, index) => ({
              title: stage.title.trim(),
              amount_paise: stagePaise[index] as number,
              deliverable: stage.deliverable.trim(),
            })) satisfies Schemas["ProposalStageRequest"][],
          };

    // Consent is spent on success: it was given for *this* quote, on that call,
    // and a tick left standing would carry into the next capture unasked.
    capture.mutate(body, { onSuccess: onConsentSpent });
  }

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-text">Capture the quote</h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Attributed to the vendor you name below. It is written unconfirmed and the customer cannot
        see it until the vendor confirms it themselves — there is no way to skip that.
      </p>

      <div className="mt-4 space-y-3">
        <VendorPicker vendors={vendors} value={invitationId} onChange={onInvitationChange} />

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Tax basis"
            description="How the vendor stated their price. The server refuses a basis this request is not compared on."
            required
          >
            <Select
              value={taxBasis}
              onChange={(event) => setTaxBasis(event.target.value as ProposalTaxBasis)}
            >
              <option value="INCLUSIVE">Tax included in the total</option>
              <option value="EXCLUSIVE">Tax added to the total</option>
            </Select>
          </Field>
          <Field
            label="Tax (₹)"
            description="Ask, and write down what they say. Zero is a fine answer; it is not a default."
            required
            error={taxRupees !== "" && !taxValid ? "A whole amount in rupees, or 0." : undefined}
          >
            <Input
              value={taxRupees}
              inputMode="decimal"
              data-numeric
              onChange={(event) => setTaxRupees(event.target.value)}
            />
          </Field>
        </div>

        {archetype === "A3_TIME_BLOCK" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Rate per worker per day (₹)" required>
              <Input
                value={rate}
                inputMode="decimal"
                data-numeric
                onChange={(event) => setRate(event.target.value)}
              />
            </Field>
            <Field label="Workers" required>
              <Input
                value={workers}
                inputMode="numeric"
                data-numeric
                onChange={(event) => setWorkers(event.target.value.replace(/[^\d]/g, ""))}
              />
            </Field>
            <Field label="Minimum days" required>
              <Input
                value={days}
                inputMode="numeric"
                data-numeric
                onChange={(event) => setDays(event.target.value.replace(/[^\d]/g, ""))}
              />
            </Field>
          </div>
        ) : (
          <>
            <Field
              label="The completed visit this estimate is priced on"
              description="A project estimate must be priced on a visit this vendor completed. Site visits on this request are listed; the server checks the visit is theirs and is COMPLETED."
              required
            >
              <Select value={siteVisitId} onChange={(event) => setSiteVisitId(event.target.value)}>
                <option value="">Choose a visit…</option>
                {siteVisits.map((visit) => (
                  <option key={visit.siteVisitId} value={visit.siteVisitId}>
                    {formatDate(visit.at)} —{" "}
                    {visit.status.replaceAll("_", " ").toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>

            <fieldset className="rounded-control border border-line p-3">
              <legend className="px-1 text-sm font-semibold text-text">Milestones</legend>
              <p className="text-sm text-text-secondary">
                At least one. Material lines cannot be captured here — see the note below.
              </p>
              <ul className="mt-3 list-none space-y-3 p-0">
                {stages.map((stage, index) => (
                  <li key={stage.id} className="grid gap-2 sm:grid-cols-[1fr_10rem]">
                    <Field label={`Milestone ${index + 1}`} required>
                      <Input
                        value={stage.title}
                        maxLength={200}
                        onChange={(event) =>
                          setStages((rows) =>
                            rows.map((row) =>
                              row.id === stage.id ? { ...row, title: event.target.value } : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Amount (₹)" required>
                      <Input
                        value={stage.amountRupees}
                        inputMode="decimal"
                        data-numeric
                        onChange={(event) =>
                          setStages((rows) =>
                            rows.map((row) =>
                              row.id === stage.id
                                ? { ...row, amountRupees: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="What it delivers" className="sm:col-span-2">
                      <Textarea
                        value={stage.deliverable}
                        rows={2}
                        maxLength={2000}
                        onChange={(event) =>
                          setStages((rows) =>
                            rows.map((row) =>
                              row.id === stage.id
                                ? { ...row, deliverable: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setStages((rows) => [
                      ...rows,
                      {
                        id: (rows.at(-1)?.id ?? 0) + 1,
                        title: "",
                        amountRupees: "",
                        deliverable: "",
                      },
                    ])
                  }
                >
                  Add a milestone
                </Button>
                {stages.length > 1 ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setStages((rows) => rows.slice(0, -1))}
                  >
                    Remove the last one
                  </Button>
                ) : null}
              </div>
            </fieldset>
          </>
        )}

        {/*
          The one arithmetic this screen does, and it is a request field rather
          than a price: `_assert_a3_shape` refuses any A3 quote whose total is
          not exactly rate x workers x days, and `_assert_a5_shape` refuses any
          project quote whose stages and materials do not add up to it. So the
          total is composed and sent, and labelled as what it is — not as a
          number anyone has agreed to.
        */}
        <p className="rounded-control bg-surface-sunken p-3 text-sm">
          {total === null ? (
            <span className="text-text-secondary">
              Fill the entries above and the total the vendor quoted will compose here.
            </span>
          ) : (
            <>
              <span className="text-text-secondary">This composes to </span>
              <strong className="text-text">{formatMoney(total)}</strong>
              <span className="text-text-secondary">
                {" "}
                — read it back to the vendor. The server re-checks the arithmetic and refuses a
                total that does not match.
              </span>
            </>
          )}
        </p>

        {/*
          The consent control is on the call script, not here. This is a read of
          it, so the operator can see what is about to be written without
          scrolling back — a statement, never a second place to set it.
        */}
        <p
          className={[
            "rounded-control border p-3 text-sm",
            consent
              ? "border-line bg-surface-sunken text-text-secondary"
              : "border-warning-line bg-warning-surface text-warning-text",
          ].join(" ")}
        >
          {consent ? (
            <>
              Consent recorded: <strong className="text-text">yes</strong> — that is what will be
              written to the audit trail beside this quote.
            </>
          ) : (
            <>
              Consent recorded: <strong>no</strong>. Recording now sends exactly that, and the
              server will refuse the capture. Tick the box at step 5 of the call script once the
              vendor has agreed.
            </>
          )}
        </p>
      </div>

      {capture.isError ? <Refusal error={capture.error} /> : null}

      {captured !== null ? (
        <div className="mt-3 rounded-control border border-line bg-surface-sunken p-3 text-sm">
          {captureAttribution(captured) === "awaiting_vendor_confirmation" ? (
            <>
              <Badge tone="warning">Captured — awaiting the vendor&rsquo;s own confirmation</Badge>
              <p className="mt-2 text-text-secondary">
                The customer cannot see this quote yet, and will not until the vendor confirms it.
                Nothing on this console can confirm it for them.
              </p>
            </>
          ) : (
            <Badge tone="success">The vendor has confirmed this quote</Badge>
          )}
        </div>
      ) : null}

      <Button
        className="mt-3"
        variant={consent ? "primary" : "outline"}
        disabled={!wellFormed || capture.isPending}
        loading={capture.isPending}
        loadingLabel="Recording"
        onClick={submit}
      >
        {consent ? "Record this quote" : "Record without consent (will be refused)"}
      </Button>

      {archetype === "A5_CUSTOM_PROJECT" ? (
        <p className="mt-2 max-w-prose text-sm text-text-secondary">
          Material lines are a separate row type from milestones — spent rather than earned — and
          this console does not capture them. A project quote that includes materials has to come
          through the vendor&rsquo;s own composer, or the total will not reconcile and the server
          will refuse it.
        </p>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
   The screen
   --------------------------------------------------------------------------- */

export function AssistedCapture({ requirementId }: { requirementId: string }) {
  const timeline = useRequestTimeline(requirementId);

  // Both lifted so the call script can name the vendor the quote is for and own
  // the consent tick at the step where it is asked for. Changing the vendor
  // clears the consent: it was given by one named person about one quote, and
  // carrying it to the next vendor would be the console asserting something
  // nobody said — the same defect 1.33.0 removed from the server.
  const [quoteInvitationId, setQuoteInvitationId] = useState("");
  const [quoteConsent, setQuoteConsent] = useState(false);

  const vendors = useMemo(
    () => (timeline.data ? invitedVendors(timeline.data) : []),
    [timeline.data],
  );
  const visits = useMemo(
    () => (timeline.data ? requestSiteVisits(timeline.data) : []),
    [timeline.data],
  );

  if (timeline.isPending) {
    return (
      <Card className="flex items-center gap-2 p-6 text-text-secondary">
        <Spinner size="sm" />
        Loading this request…
      </Card>
    );
  }

  if (timeline.isError || !timeline.data) {
    return (
      <ErrorState
        title="We could not load this request"
        message="Nothing has changed. Either the id is not a request, or it can be tried again."
        actionLabel="Try again"
        onAction={() => void timeline.refetch()}
      />
    );
  }

  const archetype = composerFor(timeline.data.archetype);

  if (archetype === null) {
    // Fails closed rather than defaulting to the workforce shape, which would
    // send `rate x workers x days` at a request whose domain expects stages and
    // collect one refusal per attempt.
    return (
      <ErrorState
        severity="warning"
        title="No composer for this lifecycle"
        message={`This request runs "${timeline.data.archetype}", which this console has no quote composer for. Capturing one would mean guessing the shape, and the server would refuse every attempt.`}
      />
    );
  }

  if (vendors.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-base font-bold text-text">Nobody has been invited yet</h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-secondary">
          A quote is captured against a vendor&rsquo;s own invitation, and this request has none.
          Rematch it from the request screen first — that is what creates them.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <QuotePanel
            requirementId={requirementId}
            archetype={archetype}
            vendors={vendors}
            siteVisits={visits}
            invitationId={quoteInvitationId}
            onInvitationChange={(value) => {
              setQuoteInvitationId(value);
              setQuoteConsent(false);
            }}
            consent={quoteConsent}
            onConsentSpent={() => setQuoteConsent(false)}
          />
          <ClarificationPanel requirementId={requirementId} vendors={vendors} />
        </div>
        <CallScript
          vendorName={
            vendors.find((vendor) => vendor.invitationId === quoteInvitationId)?.partnerName ?? ""
          }
          consent={quoteConsent}
          onConsentChange={setQuoteConsent}
        />
      </div>
    </div>
  );
}
