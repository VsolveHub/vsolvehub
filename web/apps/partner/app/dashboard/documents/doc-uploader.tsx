"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { UploadCloud, RefreshCw } from "lucide-react";
import { Button } from "@vsolve/ui";
import { uploadDocument, type FormResult } from "@/app/dashboard/actions";

const DOC_TYPES = [
  { value: "SELFIE", label: "Profile Photo" },
  { value: "AADHAAR", label: "Aadhaar Card" },
  { value: "PAN", label: "PAN Card" },
  { value: "TRADE_CERTIFICATE", label: "Trade Certificate" },
  { value: "DRIVING_LICENCE", label: "Driving Licence" },
  { value: "BANK_PASSBOOK", label: "Bank Passbook" },
];

/** Per-row re-upload: picking a file submits immediately. */
export function ReuploadButton({ type }: { type: string }) {
  const [, action] = useActionState<FormResult, FormData>(uploadDocument, {});
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="type" value={type} />
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
        <RefreshCw className="h-3.5 w-3.5" /> Re-upload
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,application/pdf"
          className="hidden"
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
    </form>
  );
}

function SubmitNew() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Uploading…" : "Upload"}
    </Button>
  );
}

/** "Upload New" — choose a type + file. */
export function UploadNewButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormResult, FormData>(uploadDocument, {});

  return (
    <div className="relative">
      <Button onClick={() => setOpen((o) => !o)}>
        <UploadCloud className="h-4 w-4" /> Upload New
      </Button>
      {open ? (
        <form
          action={action}
          className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-xl border border-border bg-white p-4 shadow-lg"
        >
          <select
            name="type"
            required
            defaultValue=""
            className="h-10 w-full rounded-lg border border-border px-2 text-sm outline-none focus:border-brand-500"
          >
            <option value="" disabled>
              Document type…
            </option>
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <input
            type="file"
            name="file"
            required
            accept="image/png,image/jpeg,application/pdf"
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-600"
          />
          {state.error ? <p className="text-xs text-danger">{state.error}</p> : null}
          {state.ok ? <p className="text-xs text-success">Uploaded — pending review.</p> : null}
          <SubmitNew />
        </form>
      ) : null}
    </div>
  );
}
