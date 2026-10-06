"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Spinner } from "@vsolve/ui";
import { useState } from "react";

import {
  rupees,
  usePublishReferralProgram,
  useReferralPrograms,
  wholeNumber,
  type ReferralProgramVersion,
} from "../queries";

type Sides = NonNullable<ReferralProgramVersion["reward_sides"]>;

const SIDES_LABEL: Record<Sides, string> = {
  BOTH: "Both (referrer and new customer)",
  REFERRER_ONLY: "Referrer only",
  REFEREE_ONLY: "New customer only",
};

interface TierRow {
  from: string;
  coins: string;
  walletRupees: string;
}

/** Client-spec launch tiers. A starting point for the form, not a server default. */
const SUGGESTED_TIERS: TierRow[] = [
  { from: "1", coins: "100", walletRupees: "" },
  { from: "4", coins: "150", walletRupees: "" },
  { from: "10", coins: "250", walletRupees: "" },
  { from: "25", coins: "350", walletRupees: "" },
  { from: "50", coins: "500", walletRupees: "" },
];

function reward(coins?: number, paise?: number | null): string {
  const parts: string[] = [];
  if (coins) parts.push(`${coins} coins`);
  if (paise) parts.push(`${rupees(paise)} wallet`);
  return parts.join(" + ") || "nothing";
}

function tierRange(tiers: ReferralProgramVersion["tiers"], index: number): string {
  const from = tiers[index]?.min_qualified_referrals ?? 1;
  const next = tiers[index + 1]?.min_qualified_referrals;
  return next ? `#${from}–${next - 1}` : `#${from}+`;
}

export function ReferralProgramEditor() {
  const programs = useReferralPrograms();
  const publish = usePublishReferralProgram();

  const [versionCode, setVersionCode] = useState("");
  const [sides, setSides] = useState<Sides>("BOTH");
  const [refereeCoins, setRefereeCoins] = useState("100");
  const [refereeWallet, setRefereeWallet] = useState("");
  const [showWallet, setShowWallet] = useState(false);
  const [tiers, setTiers] = useState<TierRow[]>(SUGGESTED_TIERS);

  const parsed = tiers.map((row) => ({
    from: wholeNumber(row.from),
    coins: row.coins.trim() === "" ? 0 : wholeNumber(row.coins),
    wallet: row.walletRupees.trim() === "" ? 0 : wholeNumber(row.walletRupees),
  }));
  const froms = parsed.map((t) => t.from);
  const valid =
    versionCode.trim() !== "" &&
    parsed.every((t) => t.from != null && t.from >= 1 && t.coins != null && t.wallet != null) &&
    froms.includes(1) &&
    new Set(froms).size === froms.length &&
    wholeNumber(refereeCoins || "0") != null &&
    (refereeWallet.trim() === "" || wholeNumber(refereeWallet) != null);

  function submit() {
    publish.mutate(
      {
        version_code: versionCode.trim(),
        reward_sides: sides,
        referee_coins_amount: wholeNumber(refereeCoins || "0") ?? 0,
        referee_wallet_paise: (wholeNumber(refereeWallet || "0") ?? 0) * 100,
        tiers: parsed.map((t) => ({
          min_qualified_referrals: t.from ?? 1,
          referrer_coins_amount: t.coins ?? 0,
          referrer_wallet_paise: (t.wallet ?? 0) * 100,
        })),
      },
      { onSuccess: () => setVersionCode("") },
    );
  }

  if (programs.isPending) return <Spinner />;
  if (programs.isError) {
    return <ErrorState severity="warning" title="Referral programs could not be loaded" message="Try again." />;
  }

  return (
    <div className="grid gap-4">
      <Card padding="md">
        <h2 className="text-sm font-semibold">Program history</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Every referral keeps the version that was active when the friend signed up. Publishing a
          new version only changes rewards for new signups.
        </p>
        <ul className="mt-3 grid gap-3">
          {(programs.data ?? []).map((program) => (
            <li key={program.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{program.version_code}</span>
                <Badge tone={program.is_active ? "success" : "neutral"}>
                  {program.is_active ? "Active" : "History"}
                </Badge>
                <span className="text-xs text-text-secondary">
                  {SIDES_LABEL[program.reward_sides ?? "BOTH"]} · from{" "}
                  {new Date(program.effective_from).toLocaleDateString("en-IN")}
                  {program.effective_until
                    ? ` to ${new Date(program.effective_until).toLocaleDateString("en-IN")}`
                    : ""}
                </span>
              </div>
              <p className="mt-1 text-xs">
                New customer gets {reward(program.referee_coins_amount, program.referee_wallet_paise)}
              </p>
              <p className="mt-1 text-xs">
                Referrer gets per successful referral:{" "}
                {program.tiers
                  .map(
                    (tier, index) =>
                      `${tierRange(program.tiers, index)}: ${reward(tier.referrer_coins_amount, tier.referrer_wallet_paise)}`,
                  )
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card padding="md">
        <h2 className="text-sm font-semibold">Publish a new version</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Rewards are in V Coins (100 coins = ₹10 at the current coin value). The first tier must
          start at referral #1; each tier applies from its number until the next tier starts.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Version name">
            <Input value={versionCode} onChange={(e) => setVersionCode(e.target.value)} placeholder="v2-diwali" />
          </Field>
          <Field label="Who is rewarded">
            <Select value={sides} onChange={(e) => setSides(e.target.value as Sides)}>
              {Object.entries(SIDES_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New customer coins">
            <Input value={refereeCoins} onChange={(e) => setRefereeCoins(e.target.value)} />
          </Field>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showWallet} onChange={(e) => setShowWallet(e.target.checked)} />
          Also give wallet cash (optional, off by default)
        </label>
        {showWallet ? (
          <Field label="New customer wallet ₹" className="mt-2 max-w-xs">
            <Input value={refereeWallet} onChange={(e) => setRefereeWallet(e.target.value)} />
          </Field>
        ) : null}

        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Referrer tiers
        </h3>
        {tiers.map((row, index) => (
          <div key={index} className="mt-2 flex flex-wrap items-end gap-2">
            <Field label="From successful referral #">
              <Input
                value={row.from}
                onChange={(e) => setTiers(tiers.map((r, i) => (i === index ? { ...r, from: e.target.value } : r)))}
              />
            </Field>
            <Field label="Coins per referral">
              <Input
                value={row.coins}
                onChange={(e) => setTiers(tiers.map((r, i) => (i === index ? { ...r, coins: e.target.value } : r)))}
              />
            </Field>
            {showWallet ? (
              <Field label="Wallet ₹ per referral">
                <Input
                  value={row.walletRupees}
                  onChange={(e) =>
                    setTiers(tiers.map((r, i) => (i === index ? { ...r, walletRupees: e.target.value } : r)))
                  }
                />
              </Field>
            ) : null}
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
          onClick={() => setTiers([...tiers, { from: "", coins: "", walletRupees: "" }])}
        >
          Add tier
        </Button>

        {publish.isError ? (
          <ErrorState
            inline
            className="mt-3"
            severity="warning"
            title="Version not published"
            message="The version name may already exist, or two tiers start at the same number."
          />
        ) : null}
        <div className="mt-4">
          <Button loading={publish.isPending} disabled={!valid} onClick={submit}>
            Publish version
          </Button>
        </div>
      </Card>
    </div>
  );
}
