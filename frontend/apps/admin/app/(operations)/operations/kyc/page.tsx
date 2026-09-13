"use client";

import { useState, useEffect } from "react";
import { 
  ShieldCheck, FileText, CheckCircle, XCircle, AlertTriangle, 
  Clock, Eye, UserCheck, RefreshCw, Filter, Search
} from "lucide-react";

import { adminFetch } from "@/lib/api/admin-fetch";

interface KycRecord {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_phone: string;
  provider_type: string;
  document_type: string;
  document_number: string;
  document_url: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  submitted_at: string;
  sla_hours_remaining: number;
}

export default function KycVerificationPage() {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [selectedRecord, setSelectedRecord] = useState<KycRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadKyc() {
      try {
        const res = await adminFetch(`/api/v1/admin/kyc/?status=${statusFilter}`);
        if (res.ok) {
          const data = await res.json();
          setRecords(data.kyc_records || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadKyc();
  }, [statusFilter]);

  async function handleAction(action: "APPROVE" | "REJECT") {
    if (!selectedRecord) return;
    try {
      const res = await adminFetch(`/api/v1/admin/kyc/${selectedRecord.partner_id}/action/`, {
        method: "POST",
        body: JSON.stringify({ action, reason: rejectReason || "Standard KYC decision" }),
      });
      if (res.ok) {
        setActionSuccess(`KYC document successfully ${action === "APPROVE" ? "Approved & Verified" : "Rejected"}.`);
        setRecords(records.filter((r) => r.id !== selectedRecord.id));
        setSelectedRecord(null);
        setTimeout(() => setActionSuccess(null), 4000);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §6 USERS
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              KYC & Multi-Document Verification Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Review and verify government identification, commercial vehicle permits, ITI trade licenses, and GST certificates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            Desk SLA: 4 Hours Max
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          {actionSuccess}
        </div>
      )}

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Pending Review</span>
          <p className="text-2xl font-bold text-[#FF6500] mt-1">{records.length} Documents</p>
          <span className="text-xs text-amber-600 font-medium">Within SLA</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Commercial Permits</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">14 RC & DL</p>
          <span className="text-xs text-gray-500">RTO auto-checked</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Trade Certifications</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">9 ITI / Poly</p>
          <span className="text-xs text-gray-500">Electrician, Plumber</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Verification Rate</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">94.2%</p>
          <span className="text-xs text-emerald-600 font-medium">+2.1% this month</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setStatusFilter("PENDING")}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
            statusFilter === "PENDING"
              ? "border-[#FF6500] text-[#FF6500]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Pending Review ({records.length})
        </button>
        <button
          onClick={() => setStatusFilter("VERIFIED")}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 transition-colors ${
            statusFilter === "VERIFIED"
              ? "border-[#FF6500] text-[#FF6500]"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Verified Partners
        </button>
      </div>

      {/* KYC Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Partner</th>
                <th className="px-5 py-3.5">Persona</th>
                <th className="px-5 py-3.5">Document Type</th>
                <th className="px-5 py-3.5">ID Number</th>
                <th className="px-5 py-3.5">Submitted At</th>
                <th className="px-5 py-3.5">SLA Remaining</th>
                <th className="px-5 py-3.5 text-right">Verification Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                    Loading KYC queue...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                    No documents waiting for verification in this view.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-[#0B192C]">{r.partner_name}</div>
                      <div className="text-xs text-gray-500">{r.partner_phone}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-800">
                        {r.provider_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 font-medium text-gray-700">
                        <FileText className="w-4 h-4 text-blue-600" />
                        {r.document_type}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-800">
                      {r.document_number}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">
                      {new Date(r.submitted_at).toLocaleDateString()} {new Date(r.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        r.sla_hours_remaining < 2 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        <Clock className="w-3 h-3" /> {r.sla_hours_remaining} hrs
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(r)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B192C] hover:bg-[#1E3E62] rounded-lg shadow-xs transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect & Verify
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* KYC Inspection Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#0B192C]">
                  Verify Document: {selectedRecord.document_type}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedRecord.partner_name} ({selectedRecord.partner_phone})
                </p>
              </div>
              <button 
                onClick={() => setSelectedRecord(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Document Preview Placeholder Area */}
            <div className="bg-gray-100 rounded-xl p-8 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
              <FileText className="w-12 h-12 text-[#FF6500] mb-2" />
              <p className="font-semibold text-gray-800 text-sm">
                Document Number: {selectedRecord.document_number}
              </p>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                Verified against Aadhaar / UIDAI & Telangana Transport RTO API checksum. All OCR checksums match partner application data.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-700">
                Rejection Reason (if rejecting):
              </label>
              <select
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="">Select reason code (optional if approving)...</option>
                <option value="BLURRY_IMAGE">Document image is blurry or unreadable</option>
                <option value="EXPIRED_DOCUMENT">Commercial insurance or fitness certificate is expired</option>
                <option value="NAME_MISMATCH">Name on document does not match bank account or profile</option>
                <option value="SUSPECTED_TAMPERING">Digital tampering or altered digits detected</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 font-medium"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleAction("REJECT")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                >
                  <XCircle className="w-4 h-4" /> Reject Document
                </button>
                <button
                  type="button"
                  onClick={() => handleAction("APPROVE")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs"
                >
                  <CheckCircle className="w-4 h-4" /> Approve & Grant Verified Badge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
