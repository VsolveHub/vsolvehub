"use client";

import { describeError } from "@vsolve/query";
import { Badge, Button, Card, ErrorState, Field, Input, Spinner } from "@vsolve/ui";
import { useMemo, useState } from "react";

import {
  useActivateGuardrailPolicy,
  useGuardrailPolicies,
  useSkillOptions,
  type QuoteGuardrailPolicy,
} from "../queries";

/**
 * Phase A: the guardrail policy Operations tunes (contract 1.46.0).
 *
 * **Every percentage on this screen is the whole answer to "can a Partner
 * price anything they want".** They cannot: every field here is a limit
 * their own rate card and every item-wise quote is checked against, at
 * submission, server-side. Changing a value here changes what every Partner
 * in every city may charge from the moment it activates.
 *
 * Versioned and activated exactly like the commercial policy: nothing here
 * is ever edited in place, only superseded, so a quote checked against
 * version 3 stays checked against version 3's numbers even after version 4
 * activates.
 */

function bpsToPercent(bps: number): string {
  return (bps / 100).toString();
}

function percentToBps(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100);
}

export function GuardrailPolicyPanel() {
  const policies = useGuardrailPolicies();
  const skills = useSkillOptions();

  const active = useMemo(
    () => (policies.data ?? []).find((policy) => policy.status === "ACTIVE") ?? null,
    [policies.data],
  );

  return (
    <div className="space-y-6">
      {policies.isPending ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Spinner size="sm" />
          Loading the guardrail policy…
        </p>
      ) : null}

      {policies.isError ? (
        <ErrorState
          title="We could not load the guardrail policy"
          message="Nothing has changed. Try again."
          actionLabel="Try again"
          onAction={() => void policies.refetch()}
        />
      ) : null}

      {active ? <ActivePolicyCard policy={active} skills={skills.data ?? []} /> : null}

      {!policies.isPending && !policies.isError && active === null ? (
        <ErrorState
          severity="warning"
          title="No guardrail policy is active"
          message="Until one is, no Partner can save a rate-card rate and no item-wise quote that uses the price book can be priced — every attempt fails closed with m2_guardrail_policy_unavailable. This is the fail-closed path working, not a bug."
        />
      ) : null}

      <ActivateForm skills={skills.data ?? []} nextVersion={(active?.version ?? 0) + 1} />
    </div>
  );
}

function ActivePolicyCard({
  policy,
  skills,
}: {
  policy: QuoteGuardrailPolicy;
  skills: readonly { id: string; name: string }[];
}) {
  const skillBands = Object.entries(policy.per_skill_bands ?? {});

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">Active — version {policy.version}</Badge>
        <span className="text-sm text-text-secondary">
          Effective from{" "}
          <time dateTime={policy.effective_from ?? undefined}>{policy.effective_from}</time>
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PolicyStat
          label="Default band"
          value={`-${bpsToPercent(policy.default_band_below_bps ?? 0)}% / +${bpsToPercent(policy.default_band_above_bps ?? 0)}%`}
          hint="How far a Partner's rate may sit from the reference, unless a trade or item overrides it."
        />
        <PolicyStat
          label="Miscellaneous cap"
          value={`${bpsToPercent(policy.misc_cap_bps ?? 0)}%`}
          hint="The most a Partner may add as Miscellaneous, as a share of their priced lines."
        />
        <PolicyStat
          label="Margin cap"
          value={`${bpsToPercent(policy.margin_cap_bps ?? 0)}%`}
          hint="The most a Partner may add as Margin."
        />
        <PolicyStat
          label="Custom-item share cap"
          value={`${bpsToPercent(policy.custom_share_cap_bps ?? 0)}%`}
          hint="The most of a quote's priced-line subtotal that unlisted (custom) items may cover."
        />
      </dl>

      {skillBands.length > 0 ? (
        <div className="mt-4 border-t border-line pt-4">
          <h4 className="text-sm font-semibold text-text">Per-trade band overrides</h4>
          <ul className="mt-2 list-none space-y-1 p-0 text-sm">
            {skillBands.map(([skillId, band]) => (
              <li key={skillId} className="flex justify-between">
                <span className="text-text-secondary">
                  {skills.find((skill) => skill.id === skillId)?.name ?? skillId}
                </span>
                <span className="font-medium text-text" data-numeric>
                  -{bpsToPercent(band.below_bps)}% / +{bpsToPercent(band.above_bps)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">
          No trade has its own band override — every trade uses the default above unless one item
          overrides it individually.
        </p>
      )}

      <p className="mt-4 text-xs text-text-muted">Approved: {policy.approval_reference}</p>
    </Card>
  );
}

function PolicyStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-control bg-surface-sunken p-3">
      <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="m-0 text-lg font-bold text-text" data-numeric>
        {value}
      </dd>
      <p className="mt-1 text-xs leading-5 text-text-secondary">{hint}</p>
    </div>
  );
}

interface SkillBandRow {
  readonly id: number;
  skillId: string;
  below: string;
  above: string;
}

function ActivateForm({
  skills,
  nextVersion,
}: {
  skills: readonly { id: string; name: string }[];
  nextVersion: number;
}) {
  const activate = useActivateGuardrailPolicy();

  const [approvalReference, setApprovalReference] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [defaultBelow, setDefaultBelow] = useState("20");
  const [defaultAbove, setDefaultAbove] = useState("30");
  const [miscCap, setMiscCap] = useState("10");
  const [marginCap, setMarginCap] = useState("25");
  const [customShareCap, setCustomShareCap] = useState("20");
  const [skillBands, setSkillBands] = useState<SkillBandRow[]>([]);

  const defaultBelowBps = percentToBps(defaultBelow);
  const defaultAboveBps = percentToBps(defaultAbove);
  const miscCapBps = percentToBps(miscCap);
  const marginCapBps = percentToBps(marginCap);
  const customShareCapBps = percentToBps(customShareCap);

  const skillBandsWellFormed = skillBands.every(
    (row) =>
      row.skillId === "" ||
      (percentToBps(row.below) !== null && percentToBps(row.above) !== null),
  );

  const ready =
    approvalReference.trim() !== "" &&
    effectiveFrom !== "" &&
    defaultBelowBps !== null &&
    defaultAboveBps !== null &&
    miscCapBps !== null &&
    marginCapBps !== null &&
    customShareCapBps !== null &&
    skillBandsWellFormed;

  function submit() {
    if (
      defaultBelowBps === null ||
      defaultAboveBps === null ||
      miscCapBps === null ||
      marginCapBps === null ||
      customShareCapBps === null
    ) {
      return;
    }
    const perSkillBands: Record<string, { below_bps: number; above_bps: number }> = {};
    for (const row of skillBands) {
      if (row.skillId === "") continue;
      const below = percentToBps(row.below);
      const above = percentToBps(row.above);
      if (below === null || above === null) continue;
      perSkillBands[row.skillId] = { below_bps: below, above_bps: above };
    }
    activate.mutate({
      version: nextVersion,
      approval_reference: approvalReference.trim(),
      effective_from: effectiveFrom,
      default_band_below_bps: defaultBelowBps,
      default_band_above_bps: defaultAboveBps,
      misc_cap_bps: miscCapBps,
      margin_cap_bps: marginCapBps,
      custom_share_cap_bps: customShareCapBps,
      per_skill_bands: perSkillBands,
    });
  }

  const errorMessage = activate.isError ? describeError(activate.error, "mutation").message : null;

  return (
    <Card className="p-5">
      <h2 className="text-base font-bold text-text">Activate version {nextVersion}</h2>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-secondary">
        Every value is required — nothing defaults silently. This supersedes the active policy
        the moment it activates; a quote already checked against the old version keeps the
        numbers it was checked against.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Approval reference" required description="The decision or sign-off this came from.">
          <Input
            value={approvalReference}
            maxLength={120}
            onChange={(event) => setApprovalReference(event.target.value)}
          />
        </Field>
        <Field label="Effective from" required>
          <Input
            type="datetime-local"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </Field>
      </div>

      <fieldset className="mt-4 rounded-control border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-text">Default band</legend>
        <p className="text-sm text-text-secondary">
          How far a Partner&rsquo;s rate may sit from the published reference, for any item with
          no trade or item-specific override.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Below the reference (%)" required>
            <Input value={defaultBelow} inputMode="decimal" data-numeric onChange={(event) => setDefaultBelow(event.target.value)} />
          </Field>
          <Field label="Above the reference (%)" required>
            <Input value={defaultAbove} inputMode="decimal" data-numeric onChange={(event) => setDefaultAbove(event.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-control border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-text">Dial caps</legend>
        <div className="mt-1 grid gap-3 sm:grid-cols-3">
          <Field label="Miscellaneous cap (%)" required>
            <Input value={miscCap} inputMode="decimal" data-numeric onChange={(event) => setMiscCap(event.target.value)} />
          </Field>
          <Field label="Margin cap (%)" required>
            <Input value={marginCap} inputMode="decimal" data-numeric onChange={(event) => setMarginCap(event.target.value)} />
          </Field>
          <Field label="Custom-item share cap (%)" required>
            <Input value={customShareCap} inputMode="decimal" data-numeric onChange={(event) => setCustomShareCap(event.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-control border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-text">Per-trade band overrides</legend>
        <p className="text-sm text-text-secondary">
          Optional. Narrower or wider than the default for one trade — a thin-supply city, or a
          trade with unusually consistent rates.
        </p>
        <ul className="mt-3 list-none space-y-2 p-0">
          {skillBands.map((row) => (
            <li key={row.id} className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem]">
              <select
                value={row.skillId}
                onChange={(event) =>
                  setSkillBands((rows) =>
                    rows.map((entry) =>
                      entry.id === row.id ? { ...entry, skillId: event.target.value } : entry,
                    ),
                  )
                }
                className="h-10 rounded-control border border-line bg-surface px-2 text-sm text-text"
              >
                <option value="">Choose a trade…</option>
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name}
                  </option>
                ))}
              </select>
              <Input
                value={row.below}
                placeholder="Below %"
                inputMode="decimal"
                data-numeric
                onChange={(event) =>
                  setSkillBands((rows) =>
                    rows.map((entry) =>
                      entry.id === row.id ? { ...entry, below: event.target.value } : entry,
                    ),
                  )
                }
              />
              <Input
                value={row.above}
                placeholder="Above %"
                inputMode="decimal"
                data-numeric
                onChange={(event) =>
                  setSkillBands((rows) =>
                    rows.map((entry) =>
                      entry.id === row.id ? { ...entry, above: event.target.value } : entry,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setSkillBands((rows) => [
                ...rows,
                { id: (rows.at(-1)?.id ?? 0) + 1, skillId: "", below: "", above: "" },
              ])
            }
          >
            Add a trade override
          </Button>
          {skillBands.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => setSkillBands((r) => r.slice(0, -1))}>
              Remove the last one
            </Button>
          ) : null}
        </div>
        {!skillBandsWellFormed ? (
          <p className="mt-2 text-sm text-danger-text">
            Every override needs a trade and both percentages.
          </p>
        ) : null}
      </fieldset>

      {errorMessage ? (
        <ErrorState inline className="mt-4" title="Could not activate this policy" message={errorMessage} />
      ) : null}

      {activate.isSuccess ? (
        <div className="mt-4 rounded-control bg-surface-sunken p-3 text-sm">
          <Badge tone="success">Activated</Badge>
          <p className="mt-2 text-text-secondary">
            Version {activate.data?.version} is now checked against every new rate save and quote
            submission.
          </p>
        </div>
      ) : null}

      <Button
        className="mt-4"
        disabled={!ready || activate.isPending}
        loading={activate.isPending}
        loadingLabel="Activating"
        onClick={submit}
      >
        Activate version {nextVersion}
      </Button>
    </Card>
  );
}
