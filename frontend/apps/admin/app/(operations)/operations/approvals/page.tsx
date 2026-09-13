"use client";

import React, { useState, useEffect } from "react";
import { Badge, Button, Card, Spinner } from "@vsolve/ui";
import {
  CheckCircle2,
  UserCheck,
  ShieldCheck,
  FileText,
  RefreshCw,
} from "lucide-react";

import { adminFetch } from "@/lib/api/admin-fetch";

interface PendingDualAuth {
  id: string;
  title: string;
  description: string;
  action_type: string;
  requester_phone: string;
  created_at: string;
  expires_at: string;
  payload: Record<string, any>;
  status: string;
}

export default function ApprovalsPage() {
  const [dualAuthList, setDualAuthList] = useState<PendingDualAuth[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Demonstration KYC items (linked to partner onboarding in Phase 1)
  const kycApprovals = [
    {
      id: "kyc-001",
      partner_name: "Ramesh Sharma",
      trade: "Electrician / Air Conditioning",
      documents: ["Aadhaar Card", "Trade Certificate (ITI)"],
      submitted_at: "2026-09-10 10:15",
      risk_tier: "LOW",
    },
    {
      id: "kyc-002",
      partner_name: "Telangana Fleet Drivers Co.",
      trade: "Ride Fleet / Captains",
      documents: ["Commercial Driving Licence", "Vehicle Insurance"],
      submitted_at: "2026-09-10 11:40",
      risk_tier: "MEDIUM",
    },
  ];

  const fetchDualAuthQueue = async () => {
    setLoading(true);
    try {
      const res = await adminFetch("/api/v1/admin/dual-auth/");
      if (res.ok) {
        const data = await res.json();
        setDualAuthList(data.pending_requests || []);
      }
    } catch (e) {
      console.error("Failed to load dual-auth requests", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDualAuthQueue();
  }, []);

  const handleDualAuthAction = async (id: string, action: "APPROVE" | "REJECT") => {
    setProcessingId(id);
    setActionMessage(null);
    try {
      const res = await adminFetch(`/api/v1/admin/dual-auth/${id}/action/`, {
        method: "POST",
        body: JSON.stringify({ action, reason: "Verified by administrator" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionMessage(data.error || "Action failed");
      } else {
        setActionMessage(`Action successful: ${data.status}`);
        fetchDualAuthQueue();
      }
    } catch (e) {
      setActionMessage("Network error during authorization");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-warm-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-6 w-6 text-[#FF6500]" />
            <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
              Enterprise Approval Center
            </h1>
          </div>
          <p className="text-sm text-warm-700 mt-1">
            Centralized queue for Partner Onboarding & KYC reviews, plus Dual-Authorization ("four-eyes principle") for high-risk operations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchDualAuthQueue}
            className="flex items-center gap-1.5 text-xs border-warm-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Queue
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-xs font-semibold">
          {actionMessage}
        </div>
      )}

      {/* Section 1: Four-Eyes Dual-Authorization Queue */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-700" />
            <h2 className="text-base font-bold text-navy-900">
              Four-Eyes Principle Dual-Authorization Queue ({dualAuthList.length})
            </h2>
          </div>
          <span className="text-xs text-warm-500">
            Mandatory second signature required before execution
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12 gap-3 text-warm-700">
            <Spinner size="md" />
            <span>Loading dual-authorization queue…</span>
          </div>
        ) : dualAuthList.length === 0 ? (
          <Card className="p-8 border border-warm-200 bg-white text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-navy-900">No Pending High-Risk Authorizations</p>
            <p className="text-xs text-warm-500 mt-1">
              High-value refunds (&gt;₹10,000), commission restructuring, and system kill switches appear here when requested.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dualAuthList.map((item) => (
              <Card key={item.id} className="p-5 border border-amber-200 bg-amber-50/20 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 font-mono">
                      {item.action_type}
                    </span>
                    <Badge tone="warning">Pending Second Eye</Badge>
                  </div>
                  <h3 className="font-bold text-sm text-navy-900 mt-2">{item.title}</h3>
                  <p className="text-xs text-warm-700 mt-1">{item.description}</p>
                  
                  <div className="mt-3 p-2.5 bg-white border border-warm-200 rounded text-xs font-mono text-warm-800">
                    <span className="text-warm-500 block text-[10px] font-sans uppercase">Payload Parameters:</span>
                    {JSON.stringify(item.payload)}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-warm-200 flex items-center justify-between">
                  <span className="text-[11px] text-warm-500">
                    Requested by: <strong className="text-navy-900">{item.requester_phone}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDualAuthAction(item.id, "REJECT")}
                      loading={processingId === item.id}
                      className="text-xs text-rose-700 border-rose-300 hover:bg-rose-50"
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDualAuthAction(item.id, "APPROVE")}
                      loading={processingId === item.id}
                      className="text-xs bg-[#0B192C] text-white hover:bg-[#1E3E62]"
                    >
                      Approve & Execute
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Partner KYC & Verification Queue (Phase 1 Integration Point) */}
      <div className="flex flex-col gap-3 mt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-[#FF6500]" />
            <h2 className="text-base font-bold text-navy-900">
              Partner KYC & Document Verifications ({kycApprovals.length})
            </h2>
          </div>
          <span className="text-xs text-warm-500">
            Aadhaar, Commercial Licences, and ITI Skill Checks
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kycApprovals.map((kyc) => (
            <Card key={kyc.id} className="p-5 border border-warm-200 bg-white shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-navy-900">{kyc.partner_name}</span>
                  <Badge tone={kyc.risk_tier === "LOW" ? "info" : "warning"}>
                    {kyc.risk_tier} RISK
                  </Badge>
                </div>
                <p className="text-xs text-warm-600 mt-0.5">{kyc.trade}</p>

                <div className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-warm-500">
                    Submitted Documents:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {kyc.documents.map((doc) => (
                      <span
                        key={doc}
                        className="px-2 py-0.5 rounded bg-warm-100 border border-warm-200 text-navy-900 text-xs flex items-center gap-1"
                      >
                        <FileText className="h-3 w-3 text-warm-500" />
                        {doc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-warm-200 flex items-center justify-between">
                <span className="text-[11px] text-warm-500">
                  Received: {kyc.submitted_at}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="text-xs">
                    View Documents
                  </Button>
                  <Button size="sm" className="text-xs bg-[#FF6500] text-white hover:bg-[#E35B00]">
                    Approve Partner
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
