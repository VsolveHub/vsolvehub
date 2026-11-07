// Ported from frontend/apps/partner/features/crew/view/crew-roster.tsx
import { Badge, Button, Card, ConfirmAction, Disclosure, EmptyState, ErrorState, Text } from "@vsolve/mobile-ui";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { outstandingDocumentKinds, type CrewRow, type RosterView } from "../adapters/roster";
import { crewGenderLabel } from "./crew-gender";

export function CrewRoster({
  loading,
  failed,
  view,
  onAdd,
  onArchive,
  onEdit,
  archivingId = null,
  archiveError = null,
  onRetry,
}: {
  readonly loading: boolean;
  readonly failed: { title: string; message: string } | null;
  readonly view: RosterView | null;
  readonly onAdd: () => void;
  readonly onArchive: (membershipId: string) => void;
  readonly onEdit: (row: CrewRow) => void;
  readonly archivingId?: string | null;
  readonly archiveError?: { readonly membershipId: string; readonly message: string } | null;
  readonly onRetry?: () => void;
}) {
  if (loading) {
    return <Text className="text-sm text-text-secondary">Loading your crew</Text>;
  }
  if (failed) {
    return (
      <ErrorState
        title={failed.title}
        message={failed.message}
        actionLabel={onRetry ? "Try again" : undefined}
        onAction={onRetry}
      />
    );
  }
  if (!view || view.isEmpty) {
    return (
      <EmptyState
        title="No one on your roster yet"
        description="Add the people you send to work. We check nobody is double-booked on a day, including through another agency."
        action={<Button onPress={onAdd}>Add someone</Button>}
      />
    );
  }

  return (
    <View className="gap-4">
      {view.canReportAttendance ? null : (
        <Card className="border-warning-line bg-warning-surface p-4">
          <Text className="text-sm leading-6 text-text-secondary">
            <Text className="font-semibold text-warning-text">Nobody can report attendance. </Text>
            Mark at least one person as a supervisor — they are who confirms how many of your crew turned up each day.
          </Text>
        </Card>
      )}

      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base font-semibold text-text">
          Your crew <Text className="font-normal text-text-muted">({view.active.length})</Text>
        </Text>
        <Button onPress={onAdd}>Add someone</Button>
      </View>

      <GenderGapNotice count={view.genderUnrecordedCount} />

      <View className="flex-row flex-wrap gap-3">
        {view.active.map((row) => (
          <View key={row.membershipId} className="w-[48%]">
            <CrewCard
              row={row}
              pending={archivingId === row.membershipId}
              error={archiveError?.membershipId === row.membershipId ? archiveError.message : null}
              onArchive={() => onArchive(row.membershipId)}
              onEdit={() => onEdit(row)}
            />
          </View>
        ))}
      </View>

      {view.archived.length > 0 ? (
        <Disclosure summary={`People you have archived (${view.archived.length})`} className="rounded-card border border-line bg-surface p-4">
          <Text className="mt-2 text-sm leading-6 text-text-secondary">
            Adding an archived person again puts them back on your roster — you do not need to re-enter their details.
          </Text>
          <View className="mt-3 gap-2.5">
            {view.archived.map((row) => (
              <View key={row.membershipId} className="flex-row items-center gap-2.5">
                <CrewAvatar name={row.name} status={avatarStatusFor(row)} size="sm" />
                <Text className="text-sm text-text-secondary">
                  {row.name} <Text className="text-text-muted">· {row.phoneMasked}</Text>
                </Text>
              </View>
            ))}
          </View>
        </Disclosure>
      ) : null}
    </View>
  );
}

type CrewAvatarStatus = "verified" | "pending" | "archived";

function avatarStatusFor(row: CrewRow): CrewAvatarStatus {
  if (row.isArchived) return "archived";
  return row.documentsVerified ? "verified" : "pending";
}

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function CrewAvatar({ name, status, size = "md" }: { name: string; status: CrewAvatarStatus; size?: "sm" | "md" }) {
  const initials = initialsFor(name);
  const dimension = size === "md" ? 56 : 36;
  const colors = status === "archived" ? (["#d3ccc0", "#756c5e"] as const) : (["#7d9ad6", "#2551a3"] as const);
  const dot = status === "verified" ? "bg-success-text" : status === "pending" ? "bg-warning-text" : "bg-text-muted";
  return (
    <View className="relative">
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ width: dimension, height: dimension, borderRadius: dimension / 2, alignItems: "center", justifyContent: "center" }}
      >
        <Text className={size === "md" ? "text-base font-bold text-surface" : "text-xs font-bold text-surface"}>{initials}</Text>
      </LinearGradient>
      <View className={`absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-surface ${dot}`} />
    </View>
  );
}

function CrewCard({
  row,
  pending,
  error,
  onArchive,
  onEdit,
}: {
  row: CrewRow;
  pending: boolean;
  error: string | null;
  onArchive: () => void;
  onEdit: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Card className="items-center gap-2.5 p-4">
      <CrewAvatar name={row.name} status={avatarStatusFor(row)} />
      <Text className="text-center text-sm font-semibold text-text">{row.name}</Text>
      <Text className="text-center text-xs text-text-muted">{row.phoneMasked}</Text>
      <View className="flex-row flex-wrap justify-center gap-1.5">
        {row.isSupervisor ? <Badge tone="info">Supervisor</Badge> : null}
        <Badge tone={row.documentsVerified ? "success" : "neutral"}>
          {row.documentsVerified ? "Documents checked" : "Documents not checked"}
        </Badge>
        {row.gender === "" ? null : <Badge tone="neutral">{crewGenderLabel(row.gender)}</Badge>}
      </View>
      {row.skillCodes.length > 0 ? (
        <Text className="text-center text-xs text-text-secondary">{row.skillCodes.join(" · ")}</Text>
      ) : null}
      {!row.documentsVerified ? (
        <Text className="text-center text-xs leading-5 text-text-muted">
          {outstandingDocumentKinds(row).length > 0
            ? "Send their ID so Operations can check it."
            : "Their documents are with Operations."}
        </Text>
      ) : null}
      {error ? <Text className="text-center text-xs text-danger-text">{error}</Text> : null}
      <View className="flex-row flex-wrap justify-center gap-2 pt-1">
        <Button variant="outline" onPress={onEdit}>
          {row.gender === "" ? "Edit details" : "Edit"}
        </Button>
        <Button variant="ghost" loading={pending} loadingLabel="Archiving" onPress={() => setConfirming(true)}>
          Archive
        </Button>
      </View>
      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${row.name}?`}
        consequence="They stop appearing when you assign crew. Nothing they have already worked is affected, and you can put them back at any time."
        confirmLabel="Archive"
        pending={pending}
        onConfirm={() => {
          setConfirming(false);
          onArchive();
        }}
      />
    </Card>
  );
}

function GenderGapNotice({ count }: { readonly count: number }) {
  if (count === 0) return null;
  return (
    <Text className="rounded-card border border-warning-line bg-warning-surface px-3.5 py-3 text-sm leading-6 text-warning-text">
      <Text className="font-bold text-warning-text">
        {count === 1 ? "One person has no man/woman recorded." : `${count} people have no man/woman recorded.`}
      </Text>{" "}
      Customers booking event staff ask for a number of men and a number of women, and Vsolve can only count someone toward that once it is set. Open anyone below to add it.
    </Text>
  );
}
