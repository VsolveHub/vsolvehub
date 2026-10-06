"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Spinner } from "@vsolve/ui";
import { useState } from "react";

import {
  rupees,
  useCoinGrantRules,
  useCreateCoinGrantRule,
  useSetCoinGrantRuleActive,
  wholeNumber,
  type CoinEarnTierRequest,
  type CoinGrantRule,
  type CoinGrantRuleRequest,
} from "../queries";

type EarnMode = NonNullable<CoinGrantRule["earn_mode"]>;
type Trigger = NonNullable<CoinGrantRule["grant_trigger"]>;
type Audience = NonNullable<CoinGrantRule["customer_eligibility"]>;

const MODE_LABEL: Record<EarnMode, string> = {
  FLAT: "Same coins every time",
  TIERED_ORDER_VALUE: "By order value",
  TIERED_BOOKING_SEQUENCE: "By booking number (1st, 2nd, …)",
};
// Referral rewards come from the referral program, and manual grants from Customer lookup,
// so only the two triggers that actually fire are offered here.
const TRIGGER_LABEL: Partial<Record<Trigger, string>> = {
  SIGNUP: "When a customer signs up",
  BOOKING_COMPLETED: "When a booking is completed",
};
const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL_CUSTOMERS: "All customers",
  NEW_CUSTOMER: "New customers (no completed booking yet)",
  EXISTING_CUSTOMER: "Existing customers (1+ completed booking)",
  REACTIVATED_CUSTOMER: "Inactive customers coming back",
};

interface TierRow {
  from: string;
  to: string;
  coins: string;
}

function describeRule(rule: CoinGrantRule): string {
  if (rule.earn_mode === "FLAT") return `${rule.coins_amount ?? 0} coins`;
  const tiers = rule.tiers ?? [];
  if (rule.earn_mode === "TIERED_ORDER_VALUE") {
    return tiers
      .map(
        (t) =>
          `${rupees(t.min_order_paise)}${t.max_order_paise != null ? `–${rupees(t.max_order_paise)}` : "+"}: ${t.coins_amount}`,
      )
      .join(" · ");
  }
  return tiers
    .map(
      (t) =>
        `#${t.min_booking_sequence ?? 1}${t.max_booking_sequence != null && t.max_booking_sequence !== t.min_booking_sequence ? `–${t.max_booking_sequence}` : t.max_booking_sequence == null ? "+" : ""}: ${t.coins_amount}`,
    )
    .join(" · ");
}

export function EarnRulesPanel() {
  const rules = useCoinGrantRules();
  const create = useCreateCoinGrantRule();
  const toggle = useSetCoinGrantRuleActive();

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<Trigger>("BOOKING_COMPLETED");
  const [mode, setMode] = useState<EarnMode>("FLAT");
  const [audience, setAudience] = useState<Audience>("ALL_CUSTOMERS");
  const [inactiveDays, setInactiveDays] = useState("90");
  const [coins, setCoins] = useState("");
  const [unlockAfter, setUnlockAfter] = useState("0");
  const [expiresOn, setExpiresOn] = useState("");
  const [tiers, setTiers] = useState<TierRow[]>([{ from: "", to: "", coins: "" }]);

  const tierValues = tiers.map((row) => ({
    from: wholeNumber(row.from),
    to: row.to.trim() === "" ? null : wholeNumber(row.to),
    coins: wholeNumber(row.coins),
  }));
  const tiersValid =
    mode === "FLAT" ||
    (tierValues.length > 0 &&
      tierValues.every((t) => t.from != null && t.coins != null && t.coins > 0) &&
      tiers.every((row) => row.to.trim() === "" || wholeNumber(row.to) != null));
  const flatValid = mode !== "FLAT" || (wholeNumber(coins) ?? 0) > 0;
  const canSave =
    name.trim() !== "" &&
    tiersValid &&
    flatValid &&
    wholeNumber(unlockAfter) != null &&
    (audience !== "REACTIVATED_CUSTOMER" || (wholeNumber(inactiveDays) ?? 0) > 0);

  function buildTiers(): CoinEarnTierRequest[] {
    return tierValues.map((t, index) =>
      mode === "TIERED_ORDER_VALUE"
        ? {
            min_order_paise: (t.from ?? 0) * 100,
            max_order_paise: t.to == null ? null : t.to * 100,
            coins_amount: t.coins ?? 0,
            sort_order: index,
          }
        : {
            min_booking_sequence: t.from ?? 1,
            max_booking_sequence: t.to,
            coins_amount: t.coins ?? 0,
            sort_order: index,
          },
    );
  }

  function submit() {
    const body: CoinGrantRuleRequest = {
      name: name.trim(),
      grant_trigger: trigger,
      earn_mode: mode,
      customer_eligibility: audience,
      reactivation_inactive_days: wholeNumber(inactiveDays) ?? 90,
      completions_required: wholeNumber(unlockAfter) ?? 0,
      coins_amount: mode === "FLAT" ? (wholeNumber(coins) ?? 0) : 0,
      expires_at: expiresOn ? new Date(`${expiresOn}T23:59:59+05:30`).toISOString() : null,
      is_active: true,
      ...(mode === "FLAT" ? {} : { tiers: buildTiers() }),
    };
    create.mutate(body, {
      onSuccess: () => {
        setName("");
        setCoins("");
        setTiers([{ from: "", to: "", coins: "" }]);
      },
    });
  }

  if (rules.isPending) return <Spinner />;
  if (rules.isError) {
    return <ErrorState severity="warning" title="Earn rules could not be loaded" message="Try again." />;
  }

  const fromLabel = mode === "TIERED_ORDER_VALUE" ? "From ₹" : "From booking #";
  const toLabel = mode === "TIERED_ORDER_VALUE" ? "To ₹ (blank = no limit)" : "To booking # (blank = no limit)";

  return (
    <div className="grid gap-4">
      <Card padding="md">
        <h2 className="text-sm font-semibold">Active and past earn rules</h2>
        <p className="mt-1 text-sm text-text-secondary">
          A rule that has already given coins cannot change its amounts. Switch it off and create a
          new one instead, so customers keep what they were promised.
        </p>
        {(rules.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No earn rules yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border text-sm">
            {(rules.data ?? []).map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-semibold">{rule.name}</span>{" "}
                  <Badge tone={rule.is_active ? "success" : "neutral"}>
                    {rule.is_active ? "On" : "Off"}
                  </Badge>
                  <p className="text-xs text-text-secondary">
                    {TRIGGER_LABEL[rule.grant_trigger ?? "SIGNUP"] ?? rule.grant_trigger} ·{" "}
                    {AUDIENCE_LABEL[rule.customer_eligibility ?? "ALL_CUSTOMERS"]} · {describeRule(rule)}
                    {rule.completions_required
                      ? ` · usable after ${rule.completions_required} completed booking(s)`
                      : ""}
                    {rule.expires_at ? ` · expires ${new Date(rule.expires_at).toLocaleDateString("en-IN")}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  loading={toggle.isPending && toggle.variables?.id === rule.id}
                  onClick={() => toggle.mutate({ id: rule.id, isActive: !rule.is_active })}
                >
                  {rule.is_active ? "Switch off" : "Switch on"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card padding="md">
        <h2 className="text-sm font-semibold">New earn rule</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name (customers see this)">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali bonus" />
          </Field>
          <Field label="When">
            <Select
              value={trigger}
              onChange={(e) => {
                const next = e.target.value as Trigger;
                setTrigger(next);
                // Signup has no order, so signup coins are always a flat amount.
                if (next === "SIGNUP") setMode("FLAT");
              }}
            >
              {Object.entries(TRIGGER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who">
            <Select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
              {Object.entries(AUDIENCE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {audience === "REACTIVATED_CUSTOMER" ? (
            <Field label="Inactive for at least (days)">
              <Input value={inactiveDays} onChange={(e) => setInactiveDays(e.target.value)} />
            </Field>
          ) : null}
          <Field label="How many coins">
            <Select
              value={mode}
              onChange={(e) => setMode(e.target.value as EarnMode)}
              disabled={trigger === "SIGNUP"}
            >
              {Object.entries(MODE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {mode === "FLAT" ? (
            <Field label="Coins">
              <Input value={coins} onChange={(e) => setCoins(e.target.value)} placeholder="100" />
            </Field>
          ) : null}
          <Field
            label="Usable after N completed bookings"
            description="0 = usable right away (booking coins still wait for the waiting period)."
          >
            <Input value={unlockAfter} onChange={(e) => setUnlockAfter(e.target.value)} />
          </Field>
          <Field label="Coins expire on (optional)">
            <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </Field>
        </div>

        {mode !== "FLAT" ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Tiers</h3>
            {tiers.map((row, index) => (
              <div key={index} className="mt-2 flex flex-wrap items-end gap-2">
                <Field label={fromLabel}>
                  <Input
                    value={row.from}
                    onChange={(e) =>
                      setTiers(tiers.map((r, i) => (i === index ? { ...r, from: e.target.value } : r)))
                    }
                  />
                </Field>
                <Field label={toLabel}>
                  <Input
                    value={row.to}
                    onChange={(e) =>
                      setTiers(tiers.map((r, i) => (i === index ? { ...r, to: e.target.value } : r)))
                    }
                  />
                </Field>
                <Field label="Coins">
                  <Input
                    value={row.coins}
                    onChange={(e) =>
                      setTiers(tiers.map((r, i) => (i === index ? { ...r, coins: e.target.value } : r)))
                    }
                  />
                </Field>
                {tiers.length > 1 ? (
                  <Button variant="ghost" onClick={() => setTiers(tiers.filter((_, i) => i !== index))}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              variant="outline"
              className="mt-2"
              onClick={() => setTiers([...tiers, { from: "", to: "", coins: "" }])}
            >
              Add tier
            </Button>
          </div>
        ) : null}

        {create.isError ? (
          <ErrorState
            inline
            className="mt-3"
            severity="warning"
            title="Rule not saved"
            message="Check the tiers do not overlap and every amount is filled in."
          />
        ) : null}
        <Button
          className="mt-4"
          loading={create.isPending}
          disabled={!canSave}
          onClick={submit}
        >
          Create rule
        </Button>
      </Card>
    </div>
  );
}
