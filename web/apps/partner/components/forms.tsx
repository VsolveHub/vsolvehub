"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import { UploadCloud, Check, ArrowRight, AlertCircle } from "lucide-react";
import { Button, cn } from "@vsolve/ui";
import { validateUploadFile } from "@/lib/upload-rules";

export function StepActions({
  submitLabel = "Next Step",
  cancelHref = "/dashboard",
  requireTerms = false,
}: {
  submitLabel?: string;
  cancelHref?: string;
  /** Final step: show a Terms + Privacy acceptance checkbox and block submit until ticked. */
  requireTerms?: boolean;
}) {
  const { pending } = useFormStatus();
  const [accepted, setAccepted] = useState(false);
  const blocked = pending || (requireTerms && !accepted);

  return (
    <div className="space-y-4 pt-2">
      {requireTerms ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-muted/60 p-3.5 text-sm">
          <input
            type="checkbox"
            name="acceptedTerms"
            value="yes"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600"
          />
          <span className="text-gray-600">
            I confirm the details above are accurate and I agree to V Solve Hub&apos;s{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-600 hover:underline"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-brand-600 hover:underline"
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        <Link href={cancelHref}>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </Link>
        <Button type="submit" disabled={blocked}>
          {pending ? "Saving…" : submitLabel}
          {!pending ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
      </div>
    </div>
  );
}

export function Field({
  label,
  name,
  hint,
  required,
  type = "text",
  defaultValue,
  placeholder,
  inputMode,
  maxLength,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  inputMode?: "text" | "numeric" | "tel";
  maxLength?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-900">
        {label} {required ? <span className="text-danger">*</span> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        className="h-12 w-full rounded-lg border border-border bg-white px-3.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      {hint ? <span className="mt-1 block text-xs text-gray-400">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-900">
        {label} {required ? <span className="text-danger">*</span> : null}
      </span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        required={required}
        className="h-12 w-full rounded-lg border border-border bg-white px-3 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      >
        <option value="" disabled>
          Select…
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxCards({
  name,
  options,
  defaultValues = [],
}: {
  name: string;
  options: { value: string; label: string }[];
  defaultValues?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValues);
  function toggle(v: string) {
    setSelected((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => toggle(o.value)}
            className={cn(
              "flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
              on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border bg-white text-ink-900",
            )}
          >
            {o.label}
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border",
                on ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300",
              )}
            >
              {on ? <Check className="h-3.5 w-3.5" /> : null}
            </span>
            {on ? <input type="hidden" name={name} value={o.value} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function FileDrop({
  name,
  label,
  hint = "JPG, PNG or PDF up to 5MB",
  required = false,
  accept = "image/png,image/jpeg,application/pdf",
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  accept?: string;
}) {
  const [filename, setFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setFilename(null);
      setError(null);
      return;
    }
    const problem = validateUploadFile(file, { label: label.toLowerCase(), accept });
    if (problem) {
      // Reject before submit: clear the picked file so it can't be sent.
      setError(problem);
      setFilename(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setError(null);
    setFilename(file.name);
  }

  return (
    <label className="block cursor-pointer">
      <span className="mb-1.5 block text-sm font-medium text-ink-900">
        {label} {required ? <span className="text-danger">*</span> : null}
      </span>
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
          error
            ? "border-red-300 bg-red-50"
            : filename
              ? "border-brand-400 bg-brand-50"
              : "border-brand-200 bg-brand-50/40 hover:bg-brand-50",
        )}
      >
        <span
          className={cn(
            "mb-2 flex h-12 w-12 items-center justify-center rounded-full",
            error ? "bg-red-100 text-danger" : "bg-brand-100 text-brand-600",
          )}
        >
          {error ? <AlertCircle className="h-6 w-6" /> : <UploadCloud className="h-6 w-6" />}
        </span>
        {filename ? (
          <span className="text-sm font-semibold text-brand-700">{filename}</span>
        ) : (
          <>
            <span className="text-sm font-semibold text-brand-600">Tap to upload</span>
            <span className="text-xs text-gray-500">or drag and drop here</span>
          </>
        )}
        <span className="mt-1 text-[11px] text-gray-400">{hint}</span>
      </div>
      {error ? (
        <span className="mt-1.5 flex items-center gap-1 text-xs font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </span>
      ) : null}
      <input
        ref={inputRef}
        name={name}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
    </label>
  );
}
