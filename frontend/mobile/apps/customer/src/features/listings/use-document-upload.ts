import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";

export const RESUME_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const RESUME_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export interface PickedResume {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
}

export function useResumeUpload() {
  const [pickedFile, setPickedFile] = useState<PickedResume | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickDocument = async (): Promise<PickedResume | null> => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0]!;
      const name = asset.name || "resume.pdf";
      const size = asset.size || 0;
      const ext = name.toLowerCase().split(".").pop();

      if (!["pdf", "doc", "docx"].includes(ext || "")) {
        setError("Resume must be a PDF, DOC, or DOCX file.");
        return null;
      }

      if (size > RESUME_MAX_BYTES) {
        setError("Resume must be 5 MB or smaller.");
        return null;
      }

      const fileObj: PickedResume = {
        uri: asset.uri,
        name,
        mimeType: asset.mimeType || "application/pdf",
        size,
      };

      setPickedFile(fileObj);
      return fileObj;
    } catch (err: any) {
      setError(err?.message || "Failed to pick document.");
      return null;
    }
  };

  const clearPicked = () => {
    setPickedFile(null);
    setError(null);
  };

  return {
    pickedFile,
    setPickedFile,
    uploading,
    setUploading,
    error,
    setError,
    pickDocument,
    clearPicked,
  };
}
