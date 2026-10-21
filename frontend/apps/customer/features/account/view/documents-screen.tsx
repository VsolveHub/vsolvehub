"use client";

import { useState } from "react";
import { Button } from "@vsolve/ui";
import { CheckCircle2, FileText, ShieldCheck, Upload } from "lucide-react";
import { useCustomerSession } from "@/features/session/queries";

interface DocumentRecord {
  id: string;
  name: string;
  description: string;
  verifiedAt: string;
  status: "VERIFIED" | "PENDING";
}

export function DocumentsScreen() {
  const session = useCustomerSession();
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const documents: DocumentRecord[] = [
    {
      id: "doc-1",
      name: "Government Identity Proof",
      description: "Aadhaar / Voter ID / Passport verified",
      verifiedAt: "2 Oct 2025",
      status: "VERIFIED",
    },
    {
      id: "doc-2",
      name: "Address Verification",
      description: "Confirmed with primary residential address",
      verifiedAt: "5 Oct 2025",
      status: "VERIFIED",
    },
    {
      id: "doc-3",
      name: "GST & Service Invoices",
      description: "Auto-generated for completed bookings",
      verifiedAt: "Active",
      status: "VERIFIED",
    },
  ];

  const handleUploadSimulate = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 4000);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* 1. Verified Hero Card */}
      <div className="overflow-hidden rounded-2xl bg-[#0B162C] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
            <ShieldCheck className="size-6" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
              VERIFICATION STATUS
            </p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-white">
              Identity Verified
            </h2>
            <p className="mt-1 text-sm text-[#94A3B8]">
              {session.fullName ? `Verified for ${session.fullName}` : "All required identity criteria have been verified"}
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Your documents are protected with 256-bit AES bank-grade encryption and ISO 27001 compliance standards.
          </p>
        </div>
      </div>

      {/* 2. Documents List */}
      <div className="rounded-2xl border border-[#F1EFEB] bg-white p-5 shadow-xs">
        <h3 className="text-base font-bold text-[#0F172A]">Verified documents</h3>

        <div className="mt-4 divide-y divide-[#F4F2EE]">
          {documents.map((doc) => (
            <div key={doc.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF6ED] text-[#EA580C]">
                  <FileText className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#0F172A]">{doc.name}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">{doc.description}</p>
                  <p className="text-[11px] text-[#94A3B8] mt-0.5">Verified on {doc.verifiedAt}</p>
                </div>
              </div>

              <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200 sm:self-center">
                <CheckCircle2 className="size-3.5" />
                <span>Verified</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Upload Document Area */}
      <div className="rounded-2xl border-2 border-dashed border-[#EA580C]/40 bg-[#FFF9F5] p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#EA580C]/10 text-[#EA580C] mb-3">
          <Upload className="size-6" />
        </div>
        <h4 className="text-sm font-bold text-[#0F172A]">Need to submit an additional document?</h4>
        <p className="mx-auto mt-1 max-w-sm text-xs text-[#64748B]">
          Upload government photo ID, electricity/utility bills for address verification, or GST tax certificates.
        </p>

        {uploadSuccess ? (
          <div className="mx-auto mt-4 max-w-sm rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-semibold text-emerald-800">
            Document submitted successfully for instant automated review! ✓
          </div>
        ) : null}

        <div className="mt-4">
          <Button
            onClick={handleUploadSimulate}
            loading={uploading}
            loadingLabel="Uploading document…"
            className="bg-[#EA580C] hover:bg-[#EA580C]/90 text-white"
          >
            Upload document
          </Button>
        </div>
      </div>
    </div>
  );
}
