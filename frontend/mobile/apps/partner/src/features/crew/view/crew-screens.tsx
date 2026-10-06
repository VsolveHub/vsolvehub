// Ported from frontend/apps/partner/features/crew/view/crew-screens.tsx
import { describeError } from "@vsolve/query/native";
import { Card, Text, useToast } from "@vsolve/mobile-ui";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { useApplicationReference } from "@/features/application/reference-queries";

import { crewProblems, describeRoster, probableDuplicate } from "../adapters/roster";
import {
  useAddCrewMember,
  useArchiveCrewMember,
  usePartnerCrew,
  useUpdateCrewMember,
  type CrewAddResult,
} from "../queries";
import { CrewMemberEditForm } from "./crew-member-edit-form";
import { CrewMemberForm } from "./crew-member-form";
import { CrewRoster } from "./crew-roster";

export function CrewRosterScreen() {
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
  const view = roster.isSuccess ? describeRoster(members) : null;
  const editingRow = view?.active.find((row) => row.membershipId === editingId) ?? null;
  const duplicate = probableDuplicate(members, phone);
  const duplicateRow =
    duplicate === null || view === null
      ? null
      : (view.active.find((row) => row.membershipId === duplicate.membership_id) ??
        view.archived.find((row) => row.membershipId === duplicate.membership_id) ??
        null);

  const announce = (result: CrewAddResult) => {
    setIsAdding(false);
    setPhone("");
    toast.notify(
      result.wasReinstated
        ? `${result.member.display_name} is back on your roster.`
        : `${result.member.display_name} added to your roster.`,
    );
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-4 px-4 py-6">
      <Text className="text-xl font-semibold text-text">Your crew</Text>
      <Text className="text-sm leading-6 text-text-secondary">
        The people you send to work. We check nobody is booked twice on the same day, including through another agency.
      </Text>
      <CrewRoster
        loading={roster.isPending}
        failed={
          roster.isError
            ? { title: "We could not load this", message: describeError(roster.error, "read").message }
            : null
        }
        view={view}
        onAdd={() => setIsAdding(true)}
        onEdit={(row) => {
          update.reset();
          setEditingId(row.membershipId);
        }}
        onArchive={(membershipId) => {
          setArchivingId(membershipId);
          archive.mutate(membershipId, { onSettled: () => setArchivingId(null) });
        }}
        archivingId={archive.isPending ? archivingId : null}
        archiveError={
          archive.isError && archivingId
            ? { membershipId: archivingId, message: describeError(archive.error, "mutation").message }
            : null
        }
        onRetry={() => void roster.refetch()}
      />
      {view && view.unrecognised.length > 0 ? (
        <Card className="border-warning-line bg-warning-surface p-4">
          <Text className="text-sm leading-6 text-text-secondary">
            <Text className="font-semibold text-warning-text">
              {view.unrecognised.length} {view.unrecognised.length === 1 ? "person" : "people"} we cannot describe.{" "}
            </Text>
            Your app is older than this part of Vsolve, so we do not know whether they are on your roster. Update it, or contact support before you rely on this list for a shift.
          </Text>
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
        skillOptions={reference.skills.map((skill) => ({ code: skill.code, label: skill.name }))}
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
        skillOptions={reference.skills.map((skill) => ({ code: skill.code, label: skill.name }))}
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
    </ScrollView>
  );
}
