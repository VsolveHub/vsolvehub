"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Spinner } from "@vsolve/ui";
import { useState } from "react";

import { useServiceAreas } from "@/features/m2-rate-cards/queries";

import {
  useEngageKillSwitch,
  useKillSwitches,
  useReleaseKillSwitch,
  type KillSwitchScope,
} from "../queries";

/**
 * The kill-switch board.
 *
 * Read whole, because during an incident the question is "what is off right now", and a screen
 * that answered it one row per request is a screen nobody trusts. Engaged switches sort first
 * for the same reason.
 *
 * A reason is required to engage one, and the board shows it back. "Why did notifications stop
 * at 3am" should have an answer on the screen rather than in a database query.
 */

/**
 * Only switches the platform actually obeys. Payment collection, partner dispatch and a single
 * service have no reader on the server yet, so offering them would let someone believe they had
 * stopped something they had not. Exported for tests.
 */
export const SCOPES: { value: KillSwitchScope; label: string; effect: string; takesArea: boolean }[] = [
  {
    value: "SERVICE_AREA",
    label: "Pause one service area",
    effect: "No new bookings or requests there, and no partner is sent new work there.",
    takesArea: true,
  },
  { value: "NOTIFICATIONS", label: "All notifications", effect: "Stops every outgoing message.", takesArea: false },
  { value: "SMS", label: "SMS", effect: "Stops text messages.", takesArea: false },
  { value: "WHATSAPP", label: "WhatsApp", effect: "Stops WhatsApp messages.", takesArea: false },
  { value: "VOICE", label: "Voice calls", effect: "Stops automated calls.", takesArea: false },
  { value: "PUSH", label: "Push notifications", effect: "Stops app and browser push.", takesArea: false },
  { value: "PAYOUTS", label: "Partner payouts", effect: "Stops payout runs and withdrawals.", takesArea: false },
  {
    value: "M2_PURCHASES",
    label: "Crew & project purchases",
    effect: "Stops new crew and project purchases.",
    takesArea: false,
  },
];

const SCOPE_LABEL = new Map<string, string>(SCOPES.map((entry) => [entry.value, entry.label]));

/** A released switch for a scope no longer offered is history nobody needs. Exported for tests. */
export function rowsToShow<T extends { scope: string; is_engaged: boolean }>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => row.is_engaged || SCOPE_LABEL.has(row.scope))
    .sort((a, b) => Number(b.is_engaged) - Number(a.is_engaged));
}

export function SwitchBoard() {
  const switches = useKillSwitches();
  const engage = useEngageKillSwitch();
  const release = useReleaseKillSwitch();

  const [scope, setScope] = useState<KillSwitchScope>("SERVICE_AREA");
  const areas = useServiceAreas();
  const areaName = new Map((areas.data ?? []).map((area) => [area.slug, area.name]));
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");

  const chosen = SCOPES.find((entry) => entry.value === scope);
  const takesTarget = chosen?.takesArea ?? false;
  const rows = rowsToShow(switches.data ?? []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div>
        {switches.isPending ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <Spinner size="sm" />
            Loading switches…
          </p>
        ) : null}

        {!switches.isPending && rows.length === 0 ? (
          <Card className="p-6 text-sm text-text-secondary">
            Nothing is switched off. Switches appear here once one has been used.
          </Card>
        ) : null}

        <ul className="list-none space-y-2">
          {rows.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4"
            >
              <div>
                <span className="flex items-center gap-2">
                  <Badge tone={entry.is_engaged ? "danger" : "neutral"}>
                    {entry.is_engaged ? "Off" : "Running"}
                  </Badge>
                  <span className="font-semibold text-text">
                    {SCOPE_LABEL.get(entry.scope) ?? entry.scope.replaceAll("_", " ").toLowerCase()}
                    {entry.target ? ` · ${areaName.get(entry.target) ?? entry.target}` : ""}
                  </span>
                </span>
                {entry.is_engaged && entry.reason ? (
                  <p className="mt-1 text-sm text-text-secondary">{entry.reason}</p>
                ) : null}
              </div>
              {entry.is_engaged ? (
                <Button
                  variant="outline"
                  loading={release.isPending}
                  loadingLabel="Starting"
                  onClick={() => release.mutate({ scope: entry.scope, target: entry.target })}
                >
                  Turn back on
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-text">Switch something off</h2>
        {engage.isError ? (
          <ErrorState
            inline
            className="mt-3"
            title="We could not engage that switch"
            message="Nothing has changed. Try again."
          />
        ) : null}

        <div className="mt-3 space-y-3">
          <Field label="What">
            <Select
              value={scope}
              onChange={(event) => setScope(event.target.value as KillSwitchScope)}
            >
              {SCOPES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </Field>
          {chosen ? <p className="-mt-1 text-xs text-text-secondary">{chosen.effect}</p> : null}

          {takesTarget ? (
            <Field label="Area">
              <Select value={target} onChange={(event) => setTarget(event.target.value)}>
                <option value="">Choose an area…</option>
                {(areas.data ?? []).map((area) => (
                  <option key={area.slug} value={area.slug}>
                    {area.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Why" description="Recorded against the switch. Required.">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>

        <Button
          className="mt-3"
          variant="danger"
          disabled={reason.trim() === "" || (takesTarget && target === "") || engage.isPending}
          loading={engage.isPending}
          loadingLabel="Switching off"
          onClick={() =>
            engage.mutate(
              { scope, target: takesTarget ? target : "", reason: reason.trim() },
              {
                onSuccess: () => {
                  setReason("");
                  setTarget("");
                },
              },
            )
          }
        >
          Switch off
        </Button>
      </Card>
    </div>
  );
}
