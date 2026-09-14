"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  X,
  DoorOpen,
  DollarSign,
  FileText,
  Clock,
} from "lucide-react";
import { apiFetch } from "@vsolve/api-client";
import { useCurrentSession } from "@vsolve/query";
import { durationModeLabel, type StayDurationMode, formatMoney } from "@vsolve/ui";

import { getApiClient } from "@/lib/api/browser";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface StayDeposit {
  id: string;
  status: string;
  authorized_amount_paise: number;
  consumed_amount_paise: number;
  refunded_amount_paise: number;
  dispute_reason?: string;
}

interface PendingSettlementApproval {
  proposed_by_id: string;
  proposed_by_name: string;
  proposed_at: string;
  proposal: {
    final_consumed_amount_paise: number;
    refund_deposit: boolean;
    resolution_notes: string;
  };
}

interface StayReservation {
  id: string;
  status: string;
  duration_mode: string;
  lease_duration_months: number;
  start_date: string;
  end_date: string;
  guest_count: number;
  total_nights: number;
  total_amount_paise: number;
  deposit_amount_paise: number;
  property_id?: string;
  property_title: string;
  property_type: string;
  property_locality: string;
  unit_type_id?: string;
  unit_id?: string;
  unit_name: string;
  unit_code: string;
  host_name: string;
  deposit?: StayDeposit;
  // Wave U1: set only when a settlement has been proposed by one Operations
  // user and is waiting on a *different* one to approve the identical
  // proposal (the backend's own two-person rule -- see
  // apps/cases/approvals.py::propose_or_approve_settlement). Null once
  // approved or if no dispute is open.
  pending_settlement_approval?: PendingSettlementApproval | null;
  created_at: string;
}

// Thin wrapper so every call site keeps using formatPaise (paise is the
// unit stored everywhere) while the actual currency formatting lives in one
// place: @vsolve/ui's formatMoney (locale grouping, paise-only-when-needed).
function formatPaise(paise: number): string {
  return formatMoney(paise);
}

// Plain-English label for a raw backend status/enum code (e.g. "RECOVERY_REQUIRED"
// -> "Recovery required"). Ops staff can still infer meaning from the raw enum, but
// there's no reason to make them -- this is purely cosmetic, the color-coding logic
// elsewhere is untouched.
function formatStatusLabel(raw: string): string {
  const words = raw.toLowerCase().split("_");
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export default function AdminStaysOversightPage() {
  const session = useCurrentSession(getApiClient());
  const currentUserId = session.data?.user?.id ?? null;
  const [reservations, setReservations] = useState<StayReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // Wave U1: last resolve-dispute response, so we can show "proposal recorded"
  // distinctly from "settled" instead of treating a 202 as if it were a 200.
  const [disputeOutcome, setDisputeOutcome] = useState<
    { kind: "proposed" } | { kind: "settled" } | { kind: "self-approval-blocked" } | null
  >(null);

  // Reassignment Modal State
  const [reassignReservation, setReassignReservation] = useState<StayReservation | null>(null);
  const [newUnitId, setNewUnitId] = useState("");
  const [reassignReason, setReassignReason] = useState("Unit maintenance emergency");
  const [submittingReassign, setSubmittingReassign] = useState(false);
  const [propertyUnits, setPropertyUnits] = useState<Array<{ id: string; unit_code: string; unit_type_name: string; floor: string; status: string }>>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  useEffect(() => {
    if (!reassignReservation?.property_id) {
      setPropertyUnits([]);
      return;
    }
    setLoadingUnits(true);
    // Filter to the reservation's own unit type server-side -- without this,
    // the picker (and its auto-selected default) could offer any unit in the
    // property regardless of room configuration, letting Ops reassign a
    // guest into an incompatible room by accident.
    const unitTypeQuery = reassignReservation.unit_type_id
      ? `?unit_type_id=${encodeURIComponent(reassignReservation.unit_type_id)}`
      : "";
    apiFetch(
      `${API_BASE}/api/v1/stays/ops/properties/${reassignReservation.property_id}/units/${unitTypeQuery}`,
    )
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const compatible = data.filter((u: any) => u.id !== reassignReservation.unit_id && u.status === "ACTIVE");
          setPropertyUnits(compatible);
          if (compatible.length > 0) setNewUnitId(compatible[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingUnits(false));
  }, [reassignReservation]);

  // Dispute Resolution Modal State
  const [disputeReservation, setDisputeReservation] = useState<StayReservation | null>(null);
  const [finalDeductionInr, setFinalDeductionInr] = useState<number>(0);
  const [resolutionNotes, setResolutionNotes] = useState<string>("");
  const [refundBalance, setRefundBalance] = useState<boolean>(true);
  const [submittingDispute, setSubmittingDispute] = useState<boolean>(false);

  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadReservations(): Promise<StayReservation[]> {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch(`${API_BASE}/api/v1/stays/ops/reservations/`);
      if (!res.ok) throw new Error("Failed to fetch stays");
      const data = await res.json();
      setReservations(data);
      return data;
    } catch (err) {
      setReservations([]);
      setLoadError(err instanceof Error ? err.message : "Unable to load stay reservations.");
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReservations();
  }, []);

  async function handleExecuteReassignment() {
    if (!reassignReservation || !newUnitId.trim()) return;
    setSubmittingReassign(true);
    try {
      const res = await apiFetch(
        `${API_BASE}/api/v1/stays/ops/reservations/${reassignReservation.id}/reassign/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            new_unit_id: newUnitId.trim(),
            reason: reassignReason,
          }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Room reassignment failed. Check unit availability.");
      }
      setReassignReservation(null);
      setNewUnitId("");
      await loadReservations();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingReassign(false);
    }
  }

  async function handleResolveDispute() {
    if (!disputeReservation || !resolutionNotes.trim()) return;
    setSubmittingDispute(true);
    setDisputeOutcome(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/api/v1/stays/ops/reservations/${disputeReservation.id}/resolve-dispute/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            final_deduction_paise: Math.round(finalDeductionInr * 100),
            resolution_notes: resolutionNotes,
            refund_deposit: refundBalance,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.code === "self_approval_denied") {
          setDisputeOutcome({ kind: "self-approval-blocked" });
          return;
        }
        throw new Error(body.detail || "Failed to resolve dispute.");
      }
      // Wave U1: the backend returns 202 + PENDING_SECOND_APPROVAL on the first
      // ("proposing") call and only 200 with a real deposit status once a
      // *different* Operations user submits the identical proposal. Treating
      // both the same (as this used to) silently hid that the deposit was not
      // actually settled yet.
      if (res.status === 202 || body.status === "PENDING_SECOND_APPROVAL") {
        setDisputeOutcome({ kind: "proposed" });
        const refreshed = await loadReservations();
        const updated = refreshed.find((item) => item.id === disputeReservation.id);
        if (updated) setDisputeReservation(updated);
        return;
      }
      setDisputeOutcome({ kind: "settled" });
      setDisputeReservation(null);
      setFinalDeductionInr(0);
      setResolutionNotes("");
      await loadReservations();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSubmittingDispute(false);
    }
  }

  const filtered = reservations.filter((r) => {
    const matchesFilter =
      filter === "ALL"
        ? true
        : filter === "DISPUTED"
        ? r.status === "DISPUTED" || r.deposit?.status === "DISPUTED"
        : r.status === filter;

    const matchesSearch =
      searchQuery.trim() === ""
        ? true
        : r.property_title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.host_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.unit_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.id.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="rounded bg-navy-50 px-2 py-0.5 text-xs font-bold uppercase text-navy-900 border border-navy-200">
            A9 Archetype Oversight
          </span>
          <h1 className="mt-1 text-2xl font-black text-neutral-900">
            Stays & Accommodations Operations
          </h1>
          <p className="text-xs text-neutral-500">
            Platform-wide management of long-term and short-stay holds, emergency unit reassignments, and deposit dispute maker-checker settlement.
          </p>
        </div>

        <button
          onClick={loadReservations}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-xs hover:border-neutral-400 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Queue
        </button>
      </div>

      {loadError && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-neutral-200 pb-3">
        <div className="flex flex-wrap gap-2">
          {["ALL", "CONFIRMED", "IN_STAY", "RECOVERY_REQUIRED", "DISPUTED", "COMPLETED", "CANCELLED"].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase transition-all ${
                filter === st
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-neutral-400" />
          <input
            type="text"
            placeholder="Search by property, host, unit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 bg-white pl-8 pr-3 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 focus:border-action focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-neutral-50 font-bold uppercase text-neutral-500 border-b border-neutral-200">
            <tr>
              <th className="p-4">Reservation ID</th>
              <th className="p-4">Property & Room Unit</th>
              <th className="p-4">Host</th>
              <th className="p-4">Dates</th>
              <th className="p-4">Deposit Escrow</th>
              <th className="p-4">Status</th>
              <th className="p-4">Operations Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-neutral-400">
                  {loadError
                    ? loadError
                    : "No reservations match this filter."}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50/60 transition-colors">
                  <td className="p-4">
                    <span className="font-mono font-bold text-neutral-900 block">#{r.id.slice(0, 8)}</span>
                    <span className="text-[10px] text-neutral-400">
                      {durationModeLabel(r.duration_mode as StayDurationMode)}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-neutral-900 block">{r.property_title}</span>
                    <span className="text-neutral-500 text-[11px] block">{r.property_locality}</span>
                    <span className="mt-0.5 inline-block rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-700 font-bold">
                      {r.unit_code} &bull; {r.unit_name}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="font-medium text-neutral-800 block">{r.host_name}</span>
                    <span className="text-[11px] text-neutral-400">{r.guest_count} occupant(s)</span>
                  </td>
                  <td className="p-4 text-neutral-600">
                    <span className="font-bold text-neutral-900 block">{r.start_date}</span>
                    <span className="text-[11px] text-neutral-500 block">to {r.end_date}</span>
                    <span className="text-[10px] text-neutral-400">{r.lease_duration_months ? `${r.lease_duration_months} mo` : `${r.total_nights} nights`}</span>
                  </td>
                  <td className="p-4">
                    <span className="font-bold text-amber-900 block">{formatPaise(r.deposit_amount_paise)}</span>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-black uppercase mt-0.5 ${
                        r.deposit?.status === "DISPUTED"
                          ? "bg-purple-100 text-purple-800"
                          : r.deposit?.status === "REFUNDED"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {r.deposit?.status ? formatStatusLabel(r.deposit.status) : "No deposit"}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                        r.status === "CONFIRMED" || r.status === "IN_STAY"
                          ? "bg-emerald-100 text-emerald-800"
                          : r.status === "DISPUTED"
                          ? "bg-purple-100 text-purple-800"
                          : r.status === "RECOVERY_REQUIRED"
                          ? "bg-red-100 text-red-800 animate-pulse"
                          : r.status === "CANCELLED"
                          ? "bg-neutral-100 text-neutral-600"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      ● {formatStatusLabel(r.status)}
                    </span>
                    {r.pending_settlement_approval && (
                      <span
                        title={`Proposed by ${r.pending_settlement_approval.proposed_by_name} — needs a different Operations user to approve`}
                        className="mt-1 flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800 w-fit"
                      >
                        <ShieldAlert className="h-2.5 w-2.5" /> Pending 2nd approval
                      </span>
                    )}
                  </td>
                  <td className="p-4 space-x-2">
                    {(r.status === "RECOVERY_REQUIRED" || r.status === "CONFIRMED") && (
                      <button
                        onClick={() => setReassignReservation(r)}
                        className="rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-800 hover:bg-neutral-200"
                      >
                        Reassign Unit
                      </button>
                    )}
                    {(r.status === "DISPUTED" || r.deposit?.status === "DISPUTED") && (
                      <button
                        onClick={() => {
                          setDisputeReservation(r);
                          setDisputeOutcome(null);
                          const pending = r.pending_settlement_approval;
                          // Pre-fill with the standing proposal so a second
                          // approver reviews the same numbers instead of
                          // re-typing them from scratch (the backend requires
                          // an exact match to approve -- see
                          // apps/cases/approvals.py::propose_or_approve_settlement).
                          if (pending) {
                            setFinalDeductionInr(pending.proposal.final_consumed_amount_paise / 100);
                            setResolutionNotes(pending.proposal.resolution_notes);
                            setRefundBalance(pending.proposal.refund_deposit);
                          } else {
                            setFinalDeductionInr(0);
                            setResolutionNotes(r.deposit?.dispute_reason || "");
                            setRefundBalance(true);
                          }
                        }}
                        className="rounded bg-purple-100 px-2.5 py-1 text-[11px] font-bold text-purple-800 hover:bg-purple-200"
                      >
                        {r.pending_settlement_approval ? "Review Proposed Settlement" : "Resolve Dispute"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* -------------------------------------------------------------
          Modal 1: Emergency Unit Reassignment Modal
          ------------------------------------------------------------- */}
      {reassignReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <DoorOpen className="h-5 w-5 text-action" /> Emergency Unit Reassignment
              </h3>
              <button
                onClick={() => setReassignReservation(null)}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-neutral-500">
              Reassign Reservation #{reassignReservation.id.slice(0, 8)} at <strong>{reassignReservation.property_title}</strong> to a compatible, vacant unit.
            </p>

            <div className="mt-3 rounded-xl bg-warm-50 p-3 border border-line">
              <div className="flex justify-between">
                <span className="text-neutral-500">Current Assigned Unit:</span>
                <span className="font-bold text-neutral-800">{reassignReservation.unit_code} ({reassignReservation.unit_name})</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-neutral-500">Dates:</span>
                <span className="font-bold text-neutral-800">{reassignReservation.start_date} &rarr; {reassignReservation.end_date}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="block font-semibold text-neutral-700">Target Replacement Room / Unit</label>
              {loadingUnits ? (
                <div className="mt-1 flex items-center gap-2 p-2 text-neutral-500 bg-neutral-50 rounded-lg">
                  <Clock className="h-4 w-4 animate-spin" /> Loading property rooms…
                </div>
              ) : propertyUnits.length > 0 ? (
                <select
                  value={newUnitId}
                  onChange={(e) => setNewUnitId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none bg-white font-medium"
                >
                  <option value="">-- Select a replacement room --</option>
                  {propertyUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_code} — {u.unit_type_name} ({u.floor || "Standard Floor"})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-1 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
                  No other vacant unit of this room configuration is available at this property right now.
                </div>
              )}
              <span className="mt-1 text-[10px] text-neutral-400 block">
                Overlapping bookings on the replacement room are blocked automatically -- it will only show as
                available here if it's genuinely free for these dates.
              </span>
            </div>

            <div className="mt-3">
              <label className="block font-semibold text-neutral-700">Reassignment Reason / Notes</label>
              <input
                type="text"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setReassignReservation(null)}
                className="rounded-lg px-3 py-1.5 font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                disabled={submittingReassign || !newUnitId.trim()}
                onClick={handleExecuteReassignment}
                className="rounded-lg bg-action px-4 py-1.5 font-bold text-white hover:bg-action-hover disabled:opacity-50"
              >
                {submittingReassign ? "Reassigning..." : "Execute Reassignment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          Modal 2: Maker-Checker Dispute Resolution Modal
          ------------------------------------------------------------- */}
      {disputeReservation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-purple-600" /> Maker-Checker Dispute Resolution
              </h3>
              <button
                onClick={() => { setDisputeReservation(null); setDisputeOutcome(null); }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-neutral-500">
              Operations override for deposit dispute on Reservation #{disputeReservation.id.slice(0, 8)} ({disputeReservation.property_title}).
            </p>

            {disputeReservation.pending_settlement_approval && (
              <div className="mt-3 rounded-xl bg-amber-50 p-3 border border-amber-200 text-amber-900">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert className="h-3.5 w-3.5" /> Awaiting a second approver
                </div>
                <p className="mt-1">
                  <strong>{disputeReservation.pending_settlement_approval.proposed_by_name}</strong>{" "}
                  proposed this settlement on{" "}
                  {new Date(disputeReservation.pending_settlement_approval.proposed_at).toLocaleString()}.
                  A <em>different</em> Operations user must submit the same figures below to approve
                  it — the amounts are pre-filled from the proposal and cannot be changed here.
                </p>
                {currentUserId === disputeReservation.pending_settlement_approval.proposed_by_id && (
                  <p className="mt-2 rounded-lg bg-white/70 p-2 font-semibold">
                    You proposed this settlement. Ask a different Operations teammate to review and
                    approve it — the system will not let you approve your own proposal.
                  </p>
                )}
              </div>
            )}

            {disputeOutcome?.kind === "proposed" && (
              <div className="mt-3 rounded-xl bg-emerald-50 p-3 border border-emerald-200 text-emerald-900 font-semibold">
                Proposal recorded. This settlement is not final yet — a different Operations user
                needs to open this dispute and submit the same figures to approve it.
              </div>
            )}

            {disputeOutcome?.kind === "self-approval-blocked" && (
              <div className="mt-3 rounded-xl bg-red-50 p-3 border border-red-200 text-red-900 font-semibold">
                You already proposed this settlement. A different Operations user must approve it —
                this action was not applied.
              </div>
            )}

            <div className="mt-3 rounded-xl bg-purple-50 p-3 border border-purple-200">
              <div className="flex justify-between font-bold text-purple-900">
                <span>Total Escrow Deposit:</span>
                <span>{formatPaise(disputeReservation.deposit_amount_paise)}</span>
              </div>
              {disputeReservation.deposit?.dispute_reason && (
                <div className="mt-2 text-[11px] text-purple-800">
                  <span className="font-semibold block">Customer Dispute Statement:</span>
                  <p className="mt-0.5 italic">"{disputeReservation.deposit.dispute_reason}"</p>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="block font-semibold text-neutral-700">
                Final Determined Damage Deduction (₹)
              </label>
              <input
                type="number"
                min={0}
                max={disputeReservation.deposit_amount_paise / 100}
                value={finalDeductionInr}
                onChange={(e) => setFinalDeductionInr(parseFloat(e.target.value) || 0)}
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
              />
              <span className="mt-1 text-[10px] text-neutral-400 block">
                Refund to customer: ₹{Math.max(0, disputeReservation.deposit_amount_paise / 100 - finalDeductionInr).toLocaleString("en-IN")}
              </span>
            </div>

            <div className="mt-3">
              <label className="block font-semibold text-neutral-700">Operations Maker-Checker Audit Notes</label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Explain the inspection evidence reviewed and reason for deduction ruling..."
                className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-xs focus:border-action focus:outline-none"
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                id="refundBalance"
                checked={refundBalance}
                onChange={(e) => setRefundBalance(e.target.checked)}
                className="rounded border-neutral-300 text-action focus:ring-action"
              />
              <label htmlFor="refundBalance" className="text-neutral-700 font-medium cursor-pointer">
                Immediately trigger refund of remaining balance to customer source account
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setDisputeReservation(null); setDisputeOutcome(null); }}
                className="rounded-lg px-3 py-1.5 font-semibold text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                disabled={
                  submittingDispute ||
                  !resolutionNotes.trim() ||
                  currentUserId === disputeReservation.pending_settlement_approval?.proposed_by_id
                }
                onClick={handleResolveDispute}
                className="rounded-lg bg-purple-600 px-4 py-1.5 font-bold text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {submittingDispute
                  ? disputeReservation.pending_settlement_approval
                    ? "Approving..."
                    : "Proposing..."
                  : disputeReservation.pending_settlement_approval
                  ? "Approve & Settle Deposit"
                  : "Propose Settlement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
