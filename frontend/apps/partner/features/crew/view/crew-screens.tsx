"use client";

import { describeError } from "@vsolve/query";
import { Card, useToast } from "@vsolve/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { asyncStateFrom } from "@/components/async-section";
import { useApplicationReference } from "@/features/application/reference-queries";
import { WORKFORCE_WORKSPACE } from "@/features/workspace/registry";
import { WorkspaceRoute } from "@/features/workspace/view/workspace-route";

import { crewProblems, describeRoster, probableDuplicate } from "../adapters/roster";
import {
  useAddCrewMember,
  useArchiveCrewMember,
  usePartnerCrew,
  useUpdateCrewMember,
  type CrewAddResult,
} from "../queries";
import { CrewMemberForm } from "./crew-member-form";
import { CrewMemberEditForm } from "./crew-member-edit-form";
import { CrewRoster } from "./crew-roster";

/**
 * The crew roster route, wired (contract 1.22.0).
 *
 * `M2-FE-107`. This replaced a `WorkspacePending` screen whose comment said the
 * proposal 0013 crew endpoints were unpublished — true when it was written, and
 * out of date since 12 August. `GET`/`POST /partner/crew/`, the per-membership
 * `PATCH` and `archive` are all live, so "Add someone" has something to call and
 * the honest thing is now the real screen.
 *
 * ## Reinstatement is announced, not inferred
 *
 * `POST /partner/crew/` answers `201` for a new membership and `200` for a
 * reinstated one, because `add_crew_member` un-archives a returning worker
 * rather than duplicating them. Seasonal labour makes that the normal case: a
 * Partner who let somebody go in March and adds them again in September needs to
 * be told the old membership came back, or they will assume they have just
 * created a second row for the same person and go looking for the first.
 *
 * The status code is the only signal — the body is identical either way — so
 * `useAddCrewMember` reads it off the response and this screen says it out loud.
 *
 * ## Inside `WorkspaceRoute`, like every other workspace destination
 *
 * The roster belongs to the A3 workspace and is authorized by `crew.manage`. A
 * Partner whose workforce capability was suspended mid-session gets the same
 * notice here as on every other screen in it, and the records stay readable —
 * a supervisor still needs to know who is on Thursday's shift.
 */

export function CrewRosterScreen() {
  return (
    <WorkspaceRoute workspaceKey={WORKFORCE_WORKSPACE} actions={["crew.manage"]}>
      {() => <CrewRosterPanel />}
    </WorkspaceRoute>
  );
}

function CrewRosterPanel() {
  const roster = usePartnerCrew();
  const reference = useApplicationReference();
  const add = useAddCrewMember();
  const archive = useArchiveCrewMember();
  const update = useUpdateCrewMember();
  const toast = useToast();

  const [isAdding, setIsAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const members = roster.data?.members ?? [];
  const view = describeRoster(members);
  const editingRow = view.active.find((row) => row.membershipId === editingId) ?? null;

  // Matched on the four digits the server publishes, so this is *probable* and
  // the form says so. Django's own check is on the full number and decides.
  const duplicate = probableDuplicate(members, phone);
  const duplicateRow =
    duplicate === null
      ? null
      : (view.active.find((row) => row.membershipId === duplicate.membership_id) ??
        view.archived.find((row) => row.membershipId === duplicate.membership_id) ??
        null);

  const announce = (result: CrewAddResult) => {
    setIsAdding(false);
    setPhone("");
    // The 200-vs-201 distinction, said out loud. Silently succeeding on a name
    // the Partner thought was gone is how they conclude they have made a
    // duplicate and go looking for the first one.
    toast.notify(
      result.wasReinstated
        ? `${result.member.display_name} is back on your roster.`
        : `${result.member.display_name} added to your roster.`,
    );
  };

  return (
    <>
      <div className="mb-2">
        <Link
          href="/me"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-navy-900 transition-colors"
        >
          <ArrowLeft size={16} aria-hidden />
          Back to Account
        </Link>
      </div>
      <h1 className="text-xl font-semibold text-text">Your crew</h1>
      <p className="text-sm leading-6 text-text-secondary">
        The people you send to work. We check nobody is booked twice on the same day, including
        through another agency.
      </p>

      <CrewRoster
        state={asyncStateFrom(roster, () => view)}
        onAdd={() => setIsAdding(true)}
        onEdit={(row) => {
          update.reset();
          setEditingId(row.membershipId);
        }}
        onArchive={(membershipId) => {
          setArchivingId(membershipId);
          archive.mutate(membershipId, {
            onSettled: () => setArchivingId(null),
          });
        }}
        archivingId={archive.isPending ? archivingId : null}
        archiveError={
          archive.isError && archivingId
            ? { membershipId: archivingId, message: describeError(archive.error, "mutation").message }
            : null
        }
        onRetry={() => void roster.refetch()}
      />

      {/*
        A membership status this build has no word for. Counted rather than
        dropped: a row that silently vanishes is how a Partner sends four people
        to a site believing the fifth was never added.
      */}
      {view.unrecognised.length > 0 ? (
        <Card aria-live="polite" className="border-warning-line bg-warning-surface p-4">
          <p className="text-sm leading-6 text-text-secondary">
            <strong className="font-semibold text-warning-text">
              {view.unrecognised.length} {view.unrecognised.length === 1 ? "person" : "people"} we
              cannot describe.
            </strong>{" "}
            Your app is older than this part of Vsolve, so we do not know whether they are on your
            roster. Update it, or contact support before you rely on this list for a shift.
          </p>
        </Card>
      ) : null}

      <CrewMemberForm
        open={isAdding}
        onOpenChange={(open) => {
          setIsAdding(open);
          if (!open) setPhone("");
        }}
        problems={crewProblems({
          display_name: "",
          phone_e164: phone,
          skill_codes: [],
          is_supervisor: false,
          gender: "",
        }).filter((problem) => problem.field === "phone_e164" && phone.trim() !== "")}
        probableDuplicate={duplicateRow}
        pending={add.isPending}
        submitError={add.isError ? describeError(add.error, "mutation").message : null}
        skillOptions={reference.skills.map((skill) => ({
          code: skill.code,
          label: skill.name,
        }))}
        onSubmit={(input) => {
          setPhone(input.phoneE164);
          add.mutate(
            {
              display_name: input.displayName,
              phone_e164: input.phoneE164,
              skill_codes: [...input.skillCodes],
              is_supervisor: input.isSupervisor,
              gender: input.gender,
            },
            { onSuccess: announce },
          );
        }}
      />

      <CrewMemberEditForm
        /* Keyed on the person: the form seeds its fields at mount, so opening somebody else must
           be a remount rather than a sync, or a half-typed name follows the Partner across rows. */
        key={editingId ?? "none"}
        row={editingRow}
        open={editingRow !== null}
        onOpenChange={(open) => {
          if (!open) {
            update.reset();
            setEditingId(null);
          }
        }}
        pending={update.isPending}
        submitError={update.isError ? describeError(update.error, "mutation").message : null}
        skillOptions={reference.skills.map((skill) => ({
          code: skill.code,
          label: skill.name,
        }))}
        onSubmit={(membershipId, patch) => {
          update.mutate(
            { membershipId, patch },
            {
              onSuccess: (member) => {
                toast.notify(`${member.display_name} updated.`);
                setEditingId(null);
              },
            },
          );
        }}
      />
    </>
  );
}
