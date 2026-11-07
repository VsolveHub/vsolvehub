// Ported from frontend/apps/partner/features/application/view/document-upload.tsx
import { ErrorState, Sheet, Text } from "@vsolve/mobile-ui";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { CloudUpload, Upload as UploadIcon } from "lucide-react-native";
import { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import {
  formatBytes,
  isRetryableUploadFailure,
  rejectFile,
  type UploadProgress,
} from "../model/upload";
import {
  UploadFailure,
  useUploadDocument,
  type DocumentKind,
  type LocalDocumentFile,
} from "../upload-queries";

const PHASE_LABEL: Record<UploadProgress["phase"], string> = {
  idle: "",
  hashing: "Checking file integrity…",
  requesting: "Preparing upload…",
  uploading: "Uploading document…",
  finalizing: "Confirming upload…",
  done: "Uploaded successfully",
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
      type: ["application/pdf", "image/*"],
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
    <View style={styles.container}>
      {/* Dashed Upload Dropzone Box matching Mockup */}
      <Pressable cssInterop={false}
        accessibilityRole="button"
        accessibilityLabel={`Upload ${label}`}
        accessibilityState={{ disabled: blocked }}
        disabled={blocked}
        onPress={() => setChooserOpen(true)}
        style={({ pressed }) => [
          styles.dropzone,
          pressed && !blocked ? styles.dropzonePressed : null,
          blocked ? styles.dropzoneDisabled : null,
        ]}
      >
        {/* Orange Cloud Icon */}
        <CloudUpload size={32} color="#ea580c" />

        {/* Peach Pill Button [^ Upload] */}
        <View style={styles.uploadPill}>
          <UploadIcon size={14} color="#c2410c" strokeWidth={2.5} />
          <Text style={styles.uploadPillText}>
            {replacing ? "Replace file" : "Upload"}
          </Text>
        </View>

        {/* Helper Subtext */}
        <Text style={styles.dropzoneSubtext}>JPG, PNG or PDF • up to 20 MB</Text>
      </Pressable>

      {/* File Chooser Sheet */}
      <Sheet open={chooserOpen} onOpenChange={setChooserOpen} title={`Upload ${label}`}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void takePhoto()}
          style={styles.sheetOption}
        >
          <Text style={styles.sheetOptionText}>Take photo with camera</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void choosePhoto()}
          style={styles.sheetOption}
        >
          <Text style={styles.sheetOptionText}>Choose from photo library</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void choosePdf()}
          style={styles.sheetOption}
        >
          <Text style={styles.sheetOptionText}>Choose document (PDF / Image)</Text>
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
        <Text accessibilityRole="alert" style={styles.rejectionText}>
          ⚠️ {rejection}
        </Text>
      ) : null}

      {/* Upload Progress Indicator */}
      {isBusy ? (
        <View style={styles.progressContainer}>
          <View style={styles.progressRow}>
            <Text style={styles.progressPhaseText}>{PHASE_LABEL[progress.phase]}</Text>
            <Text style={styles.progressPercentText}>
              {progress.phase === "uploading" ? `${progress.percent}%` : ""}
            </Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                { width: progress.phase === "uploading" ? `${progress.percent}%` : "100%" },
              ]}
            />
          </View>
        </View>
      ) : null}

      {failure ? (
        <ErrorState
          inline
          className="mt-3"
          title="Could not upload document"
          message={failure.message}
          actionLabel={isRetryableUploadFailure(failure.reason) && pendingFile ? "Try again" : undefined}
          onAction={pendingFile ? () => void send(pendingFile) : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  dropzone: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#fed7aa",
    backgroundColor: "#fffaf5",
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  dropzonePressed: {
    borderColor: "#ea580c",
    backgroundColor: "#fff7ed",
  },
  dropzoneDisabled: {
    opacity: 0.6,
  },
  uploadPill: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 6,
    backgroundColor: "#ffedd5",
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginTop: 10,
  },
  uploadPillText: {
    color: "#c2410c",
    fontSize: 13,
    fontWeight: "700",
  },
  dropzoneSubtext: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 8,
    fontWeight: "500",
  },
  sheetOption: {
    minHeight: 48,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderColor: "#f1f5f9",
    paddingVertical: 12,
  },
  sheetOptionText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#00112e",
  },
  rejectionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#be123c",
    marginTop: 8,
  },
  progressContainer: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fed7aa",
    backgroundColor: "#fffaf5",
    padding: 12,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressPhaseText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#00112e",
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ea580c",
  },
  progressBarTrack: {
    marginTop: 8,
    height: 6,
    width: "100%",
    borderRadius: 9999,
    backgroundColor: "#fed7aa",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#ea580c",
  },
});
