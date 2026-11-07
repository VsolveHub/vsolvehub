// Ported from frontend/apps/partner/features/crew/view/crew-document-uploader.tsx
import { describeError } from "@vsolve/query/native";
import { Badge, Button, ErrorState, Sheet, Text } from "@vsolve/mobile-ui";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { formatBytes, rejectFile } from "@/features/application/model/upload";

import type { CrewDocumentState, CrewRow } from "../adapters/roster";
import { useUploadCrewDocument, type CrewDocumentFile, type CrewDocumentKind } from "../queries";

const OPTIONAL_KINDS: readonly { kind: CrewDocumentKind; label: string }[] = [
  { kind: "ADDRESS_PROOF", label: "Address proof" },
  { kind: "POLICE_VERIFICATION", label: "Police verification" },
];

const STATUS_TONE = {
  APPROVED: { tone: "success" as const, label: "Approved" },
  PENDING: { tone: "info" as const, label: "With Operations" },
  REJECTED: { tone: "danger" as const, label: "Rejected" },
};

export function CrewDocumentUploader({ row }: { readonly row: CrewRow }) {
  const upload = useUploadCrewDocument();
  const [activeKind, setActiveKind] = useState<CrewDocumentKind | null>(null);
  const [chooserKind, setChooserKind] = useState<CrewDocumentKind | null>(null);
  const [percent, setPercent] = useState(0);
  const [localProblem, setLocalProblem] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const stateFor = (kind: CrewDocumentKind): CrewDocumentState | undefined =>
    row.documents.find((document) => document.kind === kind);

  const send = (kind: CrewDocumentKind, file: CrewDocumentFile) => {
    const rejection = rejectFile({ size: file.size, type: file.mimeType });
    if (rejection !== null) {
      setLocalProblem(
        rejection.code === "too_large" ? `That file is ${formatBytes(file.size)}. Send something smaller.` : rejection.message,
      );
      return;
    }
    setLocalProblem(null);
    setPermissionDenied(false);
    setActiveKind(kind);
    setPercent(0);
    upload.mutate(
      { membershipId: row.membershipId, kind, file, onProgress: (progress) => setPercent(progress.percent) },
      { onSettled: () => setActiveKind(null) },
    );
  };

  async function takePhoto() {
    const kind = chooserKind;
    setChooserKind(null);
    if (!kind) return;
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    send(kind, {
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      size: asset.fileSize ?? 0,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  async function choosePhoto() {
    const kind = chooserKind;
    setChooserKind(null);
    if (!kind) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    send(kind, {
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      size: asset.fileSize ?? 0,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  async function choosePdf() {
    const kind = chooserKind;
    setChooserKind(null);
    if (!kind) return;
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    send(kind, {
      uri: asset.uri,
      name: asset.name,
      size: asset.size ?? 0,
      mimeType: asset.mimeType ?? "application/pdf",
    });
  }

  return (
    <View className="gap-3">
      <DocumentSlot
        label="Government ID"
        hint="Aadhaar, voter ID, driving licence or passport. Required before they can be assigned."
        required
        state={stateFor("GOVERNMENT_ID")}
        busy={activeKind === "GOVERNMENT_ID"}
        percent={percent}
        disabled={upload.isPending}
        onPick={() => setChooserKind("GOVERNMENT_ID")}
      />
      {OPTIONAL_KINDS.map((option) => (
        <DocumentSlot
          key={option.kind}
          label={option.label}
          hint="If you have it."
          state={stateFor(option.kind)}
          busy={activeKind === option.kind}
          percent={percent}
          disabled={upload.isPending}
          onPick={() => setChooserKind(option.kind)}
        />
      ))}
      {localProblem ? <ErrorState inline severity="warning" title="We cannot send that file" message={localProblem} /> : null}
      {permissionDenied ? (
        <ErrorState
          inline
          title="Permission denied"
          message="Allow camera or photo access to send this document."
          actionLabel="Open settings"
          onAction={() => void Linking.openSettings()}
        />
      ) : null}
      {upload.isError ? (
        <ErrorState inline title="The upload did not finish" message={describeError(upload.error, "mutation").message} />
      ) : null}
      <Sheet open={chooserKind !== null} onOpenChange={(open) => { if (!open) setChooserKind(null); }} title="Add a document">
        <Pressable accessibilityRole="button" onPress={() => void takePhoto()} className="min-h-11 justify-center">
          <Text className="text-base text-text">Take photo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void choosePhoto()} className="min-h-11 justify-center">
          <Text className="text-base text-text">Choose photo</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void choosePdf()} className="min-h-11 justify-center">
          <Text className="text-base text-text">Choose PDF</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

function DocumentSlot({
  label,
  hint,
  required = false,
  state,
  busy,
  percent,
  disabled,
  onPick,
}: {
  label: string;
  hint: string;
  required?: boolean;
  state: CrewDocumentState | undefined;
  busy: boolean;
  percent: number;
  disabled: boolean;
  onPick: () => void;
}) {
  const badge = state ? STATUS_TONE[state.status as keyof typeof STATUS_TONE] : undefined;
  const canReplace = state?.status !== "APPROVED";
  return (
    <View className="rounded-card border border-line p-3">
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-text">
            {label}
            {required ? <Text className="text-xs text-text-muted"> (required)</Text> : null}
          </Text>
          <Text className="mt-0.5 text-xs leading-5 text-text-secondary">{hint}</Text>
        </View>
        {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
      </View>
      {state?.status === "REJECTED" && state.reason ? (
        <Text className="mt-2 rounded-control bg-danger-surface px-2.5 py-2 text-xs leading-5 text-danger-text">{state.reason}</Text>
      ) : null}
      {busy ? <Text className="mt-2 text-xs text-text-secondary">Sending… {percent}%</Text> : null}
      {!busy && canReplace ? (
        <Button variant="outline" className="mt-2" disabled={disabled} onPress={onPick}>
          {state ? "Replace" : "Choose file"}
        </Button>
      ) : null}
    </View>
  );
}
