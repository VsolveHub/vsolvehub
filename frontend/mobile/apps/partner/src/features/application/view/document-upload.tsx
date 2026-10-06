// Ported from frontend/apps/partner/features/application/view/document-upload.tsx
import { Badge, ErrorState, Sheet, Text } from "@vsolve/mobile-ui";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import {
  formatBytes,
  isRetryableUploadFailure,
  rejectFile,
  type UploadProgress,
} from "../model/upload";
import { UploadFailure, useUploadDocument, type DocumentKind, type LocalDocumentFile } from "../upload-queries";

const PHASE_LABEL: Record<UploadProgress["phase"], string> = {
  idle: "",
  hashing: "Checking the file…",
  requesting: "Preparing a secure upload…",
  uploading: "Uploading…",
  finalizing: "Confirming with our server…",
  done: "Uploaded",
  failed: "Upload failed",
};

export interface DocumentUploadProps {
  kind: DocumentKind;
  label: string;
  expectedVersion: number | null;
  replacing?: boolean;
  disabled?: boolean;
}

export function DocumentUpload({
  kind,
  label,
  expectedVersion,
  replacing = false,
  disabled = false,
}: DocumentUploadProps) {
  const upload = useUploadDocument();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({ phase: "idle", percent: 0 });
  const [rejection, setRejection] = useState<string | null>(null);
  const [failure, setFailure] = useState<UploadFailure | null>(null);
  const [pendingFile, setPendingFile] = useState<LocalDocumentFile | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const isBusy = upload.isPending;
  const blocked = disabled || isBusy || expectedVersion === null;

  async function send(file: LocalDocumentFile) {
    if (expectedVersion === null) return;
    setFailure(null);
    setRejection(null);
    try {
      await upload.mutateAsync({
        kind,
        file,
        expectedVersion,
        onProgress: setProgress,
      });
      setPendingFile(null);
    } catch (error) {
      setProgress({ phase: "failed", percent: 0 });
      setFailure(
        error instanceof UploadFailure
          ? error
          : new UploadFailure("unknown", "The upload did not complete."),
      );
    }
  }

  function acceptFile(file: LocalDocumentFile) {
    const problem = rejectFile({ size: file.size, type: file.mimeType });
    if (problem) {
      setRejection(problem.message);
      setPendingFile(null);
      return;
    }
    setRejection(null);
    setPermissionDenied(false);
    setPendingFile(file);
    void send(file);
  }

  async function takePhoto() {
    setChooserOpen(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    acceptFile({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      size: asset.fileSize ?? 0,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  async function choosePhoto() {
    setChooserOpen(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPermissionDenied(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    acceptFile({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      size: asset.fileSize ?? 0,
      mimeType: asset.mimeType ?? "image/jpeg",
    });
  }

  async function choosePdf() {
    setChooserOpen(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    acceptFile({
      uri: asset.uri,
      name: asset.name,
      size: asset.size ?? 0,
      mimeType: asset.mimeType ?? "application/pdf",
    });
  }

  return (
    <View className="mt-3">
      <Text className="mb-1 text-sm font-bold text-text">
        {replacing ? `Replace your ${label.toLowerCase()}` : `Upload your ${label.toLowerCase()}`}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose a file"
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        onPress={() => setChooserOpen(true)}
        className="items-center justify-center rounded-card border-2 border-dashed border-line-strong bg-surface p-5"
      >
        <Text className="text-sm font-bold text-navy-900">
          <Text className="text-signal-700 underline">Choose a file</Text>
        </Text>
        <Text className="mt-1 text-center text-xs text-text-muted">
          Supports clear photo (JPG, PNG) or PDF document (up to {formatBytes(20 * 1024 * 1024)})
        </Text>
      </Pressable>

      <Sheet open={chooserOpen} onOpenChange={setChooserOpen} title="Add a document">
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

      {permissionDenied ? (
        <ErrorState
          inline
          className="mt-3"
          title="Permission denied"
          message="Camera or photo access is off. Allow it in settings, then try again."
          actionLabel="Open settings"
          onAction={() => void Linking.openSettings()}
        />
      ) : null}

      {rejection ? (
        <Text accessibilityRole="alert" className="mt-2 text-xs font-bold text-danger-text">
          ⚠️ {rejection}
        </Text>
      ) : null}

      {isBusy ? (
        <View accessibilityLiveRegion="polite" className="mt-3 rounded-card border border-line bg-surface-sunken p-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-text">{PHASE_LABEL[progress.phase]}</Text>
            <Text className="text-xs font-semibold text-text">
              {progress.phase === "uploading" ? `${progress.percent}%` : ""}
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: progress.phase === "uploading" ? progress.percent : undefined,
            }}
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line"
          >
            <View
              className="h-full bg-action"
              style={{ width: progress.phase === "uploading" ? `${progress.percent}%` : "100%" }}
            />
          </View>
        </View>
      ) : null}

      {failure ? (
        <ErrorState
          inline
          className="mt-3"
          severity={failure.reason === "rejected" ? "error" : "warning"}
          title={
            failure.reason === "expired"
              ? "That upload link expired"
              : failure.reason === "conflict"
                ? "Your application changed while uploading"
                : failure.reason === "rejected"
                  ? "We could not accept that file"
                  : "The upload did not finish"
          }
          message={
            failure.reason === "rejected"
              ? "The file did not match what we expected. Choose the document again — a clear photo of the original usually works."
              : failure.reason === "conflict"
                ? "Nothing was uploaded. Reload this page to pick up the latest version, then try again."
                : "Nothing was uploaded. Check your connection and try again."
          }
          actionLabel={isRetryableUploadFailure(failure.reason) && pendingFile ? "Try again" : undefined}
          onAction={
            isRetryableUploadFailure(failure.reason) && pendingFile
              ? () => void send(pendingFile)
              : undefined
          }
        />
      ) : null}

      {upload.isSuccess && progress.phase === "done" ? (
        <View className="mt-3 flex-row items-center gap-2">
          <Badge tone="success">Uploaded</Badge>
          <Text className="flex-1 text-xs font-bold text-success-text">
            File received securely. A reviewer will verify this during review.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
