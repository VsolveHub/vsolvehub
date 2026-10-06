// Ported from frontend/apps/partner/features/crew/view/crew-member-form.tsx
import { Button, Card, ErrorState, Field, Input, Sheet, Text } from "@vsolve/mobile-ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { CrewProblem, CrewRow } from "../adapters/roster";
import { CrewGenderField, type CrewGender } from "./crew-gender";

export function CrewMemberForm({
  open,
  onOpenChange,
  onSubmit,
  problems = [],
  probableDuplicate = null,
  pending = false,
  submitError = null,
  skillOptions = [],
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (input: {
    displayName: string;
    phoneE164: string;
    isSupervisor: boolean;
    skillCodes: readonly string[];
    gender: CrewGender;
  }) => void;
  readonly problems?: readonly CrewProblem[];
  readonly probableDuplicate?: CrewRow | null;
  readonly pending?: boolean;
  readonly submitError?: string | null;
  readonly skillOptions?: readonly { readonly code: string; readonly label: string }[];
}) {
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [skillCodes, setSkillCodes] = useState<readonly string[]>([]);
  const [gender, setGender] = useState<CrewGender>("");
  const messageFor = (field: CrewProblem["field"]) => problems.find((problem) => problem.field === field)?.message;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add someone to your crew">
      <View className="gap-4">
        <Field label="Name" description="What your team calls them. Customers do not see it before a shift." error={messageFor("display_name")} required>
          <Input value={displayName} onChangeText={setDisplayName} autoComplete="off" />
        </Field>
        <Field label="Mobile number" description="We use it to make sure nobody is booked twice on the same day." error={messageFor("phone_e164")} required>
          <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="off" />
        </Field>
        {probableDuplicate ? (
          <Card className="bg-surface-sunken p-3">
            <Text className="text-sm leading-6 text-text-secondary">
              This looks like <Text className="font-semibold text-text">{probableDuplicate.name}</Text>, who is already on your roster. If it is someone else, carry on — we check the full number.
            </Text>
          </Card>
        ) : null}
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
                    accessibilityState={{ checked: selected }}
                    onPress={() =>
                      setSkillCodes((current) =>
                        selected ? current.filter((code) => code !== skill.code) : [...current, skill.code],
                      )
                    }
                    className={
                      selected
                        ? "min-h-11 flex-row items-center rounded-control border border-action bg-selected-surface px-3"
                        : "min-h-11 flex-row items-center rounded-control border border-line px-3"
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
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSupervisor }} onPress={() => setIsSupervisor((value) => !value)} className="flex-row items-start gap-3">
          <View className={isSupervisor ? "mt-0.5 h-5 w-5 rounded border border-action bg-action" : "mt-0.5 h-5 w-5 rounded border border-line"} />
          <View className="flex-1">
            <Text className="text-sm text-text-secondary">They can report attendance.</Text>
            <Text className="mt-0.5 text-xs leading-5 text-text-muted">Supervisors confirm how many of the crew turned up each day. You need at least one.</Text>
          </View>
        </Pressable>
        {submitError ? <ErrorState inline title="We could not add them" message={submitError} /> : null}
        <View className="flex-row gap-3">
          <Button
            loading={pending}
            loadingLabel="Adding"
            onPress={() =>
              onSubmit({
                displayName,
                phoneE164: phone.trim().startsWith("+") ? phone.trim() : `+91${phone.replace(/\D/g, "")}`,
                isSupervisor,
                skillCodes,
                gender,
              })
            }
          >
            Add to roster
          </Button>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
        </View>
      </View>
    </Sheet>
  );
}
