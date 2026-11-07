// Ported from frontend/apps/partner/features/crew/view/crew-member-edit-form.tsx
import { Badge, Button, ErrorState, Field, Input, Sheet, Text } from "@vsolve/mobile-ui";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import type { CrewMemberPatch } from "@/features/capability/adapters/wire";

import type { CrewRow } from "../adapters/roster";
import { CrewDocumentUploader } from "./crew-document-uploader";
import { CrewGenderField, type CrewGender } from "./crew-gender";

export function CrewMemberEditForm({
  row,
  open,
  onOpenChange,
  onSubmit,
  pending = false,
  submitError = null,
  skillOptions = [],
}: {
  readonly row: CrewRow | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (membershipId: string, patch: CrewMemberPatch) => void;
  readonly pending?: boolean;
  readonly submitError?: string | null;
  readonly skillOptions?: readonly { readonly code: string; readonly label: string }[];
}) {
  const [displayName, setDisplayName] = useState(row?.name ?? "");
  const [skillCodes, setSkillCodes] = useState<readonly string[]>(row?.skillCodes ?? []);
  const [isSupervisor, setIsSupervisor] = useState(row?.isSupervisor ?? false);
  const [gender, setGender] = useState<CrewGender>(row?.gender ?? "");
  const trimmedName = displayName.trim();
  const nameProblem = trimmedName === "" ? "Give them a name your team will recognise." : null;
  const hasChanges = useMemo(
    () =>
      row !== null &&
      (trimmedName !== row.name ||
        isSupervisor !== row.isSupervisor ||
        gender !== row.gender ||
        skillCodes.length !== row.skillCodes.length ||
        skillCodes.some((code) => !row.skillCodes.includes(code))),
    [gender, isSupervisor, row, skillCodes, trimmedName],
  );

  if (row === null) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={`Edit ${row.name}`}
      description="Update how this person works with your agency"
    >
      <View className="gap-5">
        <Field
          label="Name"
          description="What your team calls them. Changing it here does not change any other agency's list."
          error={nameProblem ?? undefined}
          required
        >
          <Input value={displayName} editable={!pending} onChangeText={setDisplayName} autoComplete="off" />
        </Field>
        <View className="rounded-card border border-line bg-surface-sunken p-3">
          <Text className="text-sm font-semibold text-text">{row.phoneMasked}</Text>
          <Text className="mt-1 text-xs leading-5 text-text-secondary">
            Their mobile number identifies them across agency rosters and stops the same person being booked twice on one day, so it cannot be changed. If the number is wrong, that is a different person — add them instead.
          </Text>
        </View>
        {skillOptions.length > 0 ? (
          <View>
            <Text className="text-sm font-semibold text-text">
              What they do <Text className="font-normal text-text-muted">(optional)</Text>
            </Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {skillOptions.map((skill) => {
                const selected = skillCodes.includes(skill.code);
                return (
                  <Pressable
                    key={skill.code}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected, disabled: pending }}
                    disabled={pending}
                    onPress={() =>
                      setSkillCodes((current) =>
                        selected ? current.filter((code) => code !== skill.code) : [...current, skill.code],
                      )
                    }
                    className={
                      selected
                        ? "min-h-11 items-center justify-center rounded-control border border-action bg-selected-surface px-3"
                        : "min-h-11 items-center justify-center rounded-control border border-line px-3"
                    }
                  >
                    <Text className="text-sm text-text-secondary">{skill.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <CrewGenderField value={gender} onChange={setGender} disabled={pending} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: isSupervisor, disabled: pending }}
          disabled={pending}
          onPress={() => setIsSupervisor((value) => !value)}
          className="flex-row items-start gap-3"
        >
          <View className={isSupervisor ? "mt-0.5 h-5 w-5 rounded border border-action bg-action" : "mt-0.5 h-5 w-5 rounded border border-line"} />
          <View className="flex-1">
            <Text className="text-sm text-text-secondary">They can report attendance.</Text>
            <Text className="mt-0.5 text-xs leading-5 text-text-muted">Supervisors confirm how many crew members turned up each day.</Text>
          </View>
        </Pressable>
        {submitError ? <ErrorState inline title="We could not save these changes" message={submitError} /> : null}
        <View className="flex-row flex-wrap gap-3">
          <Button
            disabled={!hasChanges || nameProblem !== null}
            loading={pending}
            loadingLabel="Saving"
            onPress={() => {
              if (nameProblem !== null) return;
              onSubmit(row.membershipId, {
                display_name: trimmedName,
                skill_codes: [...skillCodes],
                is_supervisor: isSupervisor,
                gender,
              });
            }}
          >
            Save changes
          </Button>
          <Button variant="ghost" disabled={pending} onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
        </View>
        <View className="mt-6 border-t border-line pt-5">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-sm font-semibold text-text">Identity documents</Text>
            {row.documentsVerified ? <Badge tone="success">Checked by Operations</Badge> : <Badge tone="warning">Not checked yet</Badge>}
          </View>
          <Text className="mt-1 text-xs leading-5 text-text-secondary">
            Operations checks these before this person can be assigned to customer work. Vsolve staff review them — you cannot mark your own crew as checked.
          </Text>
          <View className="mt-3">
            <CrewDocumentUploader row={row} />
          </View>
        </View>
      </View>
    </Sheet>
  );
}
