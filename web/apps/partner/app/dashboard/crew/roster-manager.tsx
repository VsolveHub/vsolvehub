"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus, QrCode as QrIcon, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { Button } from "@vsolve/ui";
import { Field, SelectField } from "@/components/forms";
import { CREW_ROLES, SKILL_LEVELS } from "@/lib/crew-constants";
import { addMember, removeMember, type FormResult } from "./actions";
import { InviteSheet, type InviteTarget } from "./invite-sheet";

export type MemberVM = InviteTarget & { skillLabel: string };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      <UserPlus className="h-4 w-4" /> {pending ? "Adding…" : "Add member"}
    </Button>
  );
}

export function RosterManager({ members }: { members: MemberVM[] }) {
  const [state, action] = useActionState<FormResult, FormData>(addMember, {});
  const [inviteId, setInviteId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Derive the open member from live props so a regenerated link (which
  // revalidates the page) shows its fresh QR/URL instead of a stale snapshot.
  const invite = members.find((m) => m.id === inviteId) ?? null;

  // After a successful add, reset the form and open the invite sheet for the
  // new member (so the lead can immediately share the QR / link).
  useEffect(() => {
    if (state.ok && state.memberId) {
      formRef.current?.reset();
      setInviteId(state.memberId);
    }
  }, [state]);

  return (
    <div className="space-y-6">
      <form ref={formRef} action={action} className="space-y-3 rounded-2xl border border-border bg-white p-4">
        <p className="text-sm font-semibold text-ink-900">Add a crew member</p>
        <Field label="Name" name="name" required placeholder="e.g. Ramesh" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Role" name="role" required options={CREW_ROLES.map((r) => ({ ...r }))} />
          <SelectField
            label="Skill level"
            name="skillLevel"
            defaultValue="skilled"
            options={SKILL_LEVELS.map((s) => ({ ...s }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Mobile (optional)" name="phone" inputMode="tel" placeholder="10-digit" />
          <Field label="Day rate ₹ (optional)" name="dayRate" inputMode="numeric" placeholder="e.g. 900" hint="For your reference only" />
        </div>
        {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
        <AddButton />
      </form>

      <div>
        <p className="mb-2 text-sm font-semibold text-ink-900">
          Roster {members.length > 0 ? <span className="text-gray-400">({members.length})</span> : null}
        </p>
        {members.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white px-4 py-8 text-center text-sm text-gray-500">
            No members yet. Add your first worker above, then share the QR or link for them to join.
          </p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{m.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {m.roleLabel} · {m.skillLabel}
                  </p>
                </div>
                {m.status === "ACTIVE" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Joined
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    <Clock className="h-3 w-3" /> Invited
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setInviteId(m.id)}
                  aria-label={`Show invite for ${m.name}`}
                  className="rounded-lg border border-border p-2 text-brand-600 hover:bg-brand-50"
                >
                  <QrIcon className="h-4 w-4" />
                </button>
                <form action={removeMember}>
                  <input type="hidden" name="memberId" value={m.id} />
                  <button
                    type="submit"
                    aria-label={`Remove ${m.name}`}
                    className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      {invite ? <InviteSheet member={invite} onClose={() => setInviteId(null)} /> : null}
    </div>
  );
}
