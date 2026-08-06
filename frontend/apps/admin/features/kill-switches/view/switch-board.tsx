"use client";

import { Badge, Button, Card, ErrorState, Field, Input, Select, Spinner } from "@vsolve/ui";
import { useState } from "react";

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

const SCOPES: { value: KillSwitchScope; label: string; takesTarget: boolean }[] = [
  { value: "NOTIFICATIONS", label: "All outbound notifications", takesTarget: false },
  { value: "SMS", label: "SMS channel", takesTarget: false },
  { value: "PAYMENTS", label: "Payment collection", takesTarget: false },
  { value: "PAYOUTS", label: "Partner payouts", takesTarget: false },
  { value: "DISPATCH", label: "Partner dispatch", takesTarget: false },
  { value: "SERVICE_AREA", label: "One service area", takesTarget: true },
  { value: "SERVICE", label: "One service", takesTarget: true },
];

export function SwitchBoard() {
  const switches = useKillSwitches();
  const engage = useEngageKillSwitch();
  const release = useReleaseKillSwitch();

  const [scope, setScope] = useState<KillSwitchScope>("NOTIFICATIONS");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");

  const takesTarget = SCOPES.find((entry) => entry.value === scope)?.takesTarget ?? false;
  const rows = [...(switches.data ?? [])].sort(
    (a, b) => Number(b.is_engaged) - Number(a.is_engaged),
  );

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
                    {entry.scope.replaceAll("_", " ").toLowerCase()}
                    {entry.target ? ` · ${entry.target}` : ""}
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

          {takesTarget ? (
            <Field label="Which one">
              <Input
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                placeholder="slug"
              />
            </Field>
          ) : null}

          <Field label="Why" description="Recorded against the switch. Required.">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>

        <Button
          className="mt-3"
          variant="danger"
          disabled={reason.trim() === "" || engage.isPending}
          loading={engage.isPending}
          loadingLabel="Switching off"
          onClick={() =>
            engage.mutate(
              { scope, target: takesTarget ? target : "", reason: reason.trim() },
              { onSuccess: () => setReason("") },
            )
          }
        >
          Switch off
        </Button>
      </Card>
    </div>
  );
}
