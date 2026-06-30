"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import type { BookingServiceInfo } from "@/lib/bookings/types";
import { formatPrice } from "@/lib/format";
import { CategoryIcon } from "@/components/ui/CategoryIcon";

type Props = {
  service: BookingServiceInfo;
  issueDescription: string;
  mediaUrls: string[];
  onChange: (patch: { issueDescription?: string; mediaUrls?: string[] }) => void;
  onNext: () => void;
};

export function BookingDetailsStep({
  service,
  issueDescription,
  mediaUrls,
  onChange,
  onNext,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    const res = await fetch("/api/bookings/media", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Upload failed");
      setUploading(false);
      return;
    }

    onChange({ mediaUrls: [...mediaUrls, ...data.urls].slice(0, 5) });
    setUploading(false);
  }

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="service-card-header">
          <span className="service-card-icon">
            <CategoryIcon
              slug={service.category.slug}
              icon={service.category.icon}
              size={28}
              color="var(--color-brand)"
            />
          </span>
          <div>
            <h2 className="card-title">{service.name}</h2>
            <p className="card-price">
              {formatPrice(service.pricePaise)}
              {service.unit === "day" ? "/day" : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="card stack">
        <Textarea
          label="Describe the problem"
          placeholder="Tell us what you need help with — symptoms, scope, urgency…"
          value={issueDescription}
          onChange={(e) => onChange({ issueDescription: e.target.value })}
        />

        <div>
          <p className="section-title">Photos / videos (optional)</p>
          <p className="text-sm text-muted">Upload up to 5 images to help the professional prepare.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            loading={uploading}
            disabled={uploading || mediaUrls.length >= 5}
          >
            + Add photos
          </Button>
          {mediaUrls.length > 0 && (
            <div className="booking-media-grid">
              {mediaUrls.map((url) => (
                <img key={url} src={url} alt="Upload preview" className="booking-media-thumb" />
              ))}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <Button onClick={onNext} block>
        Next
      </Button>
    </div>
  );
}
