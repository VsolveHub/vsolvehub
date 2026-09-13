"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Wallet, Download, CheckCircle2, RefreshCw, 
  ArrowDownRight, FileSpreadsheet, ShieldAlert, X, Eye
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface SettlementRecord {
  id: string;
  partner_name: string;
  partner_phone: string;
  gross_paise: number;
  tds_deducted_paise: number;
  platform_fee_paise: number;
  net_payout_inr: number;
  status: string;
  created_at: string;
}

export default function SettlementsWaterfallPage() {
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batchGenerated, setBatchGenerated] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementRecord | null>(null);

  async function loadSettlements() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<{ settlements: SettlementRecord[] }>("/api/v1/admin/settlements/");
      setSettlements(data.settlements || []);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load settlement waterfall");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettlements();
  }, []);

  function handleExportNeftBatch() {
    if (settlements.length === 0) return;
    const headers = "SettlementID,PartnerName,PartnerPhone,GrossINR,PlatformFeeINR,TDS_1PctINR,NetPayoutINR,Status\n";
    const rows = settlements.map(s => 
      `"${s.id}","${s.partner_name}","${s.partner_phone}",${(s.gross_paise / 100).toFixed(2)},${(s.platform_fee_paise / 100).toFixed(2)},${(s.tds_deducted_paise / 100).toFixed(2)},${s.net_payout_inr.toFixed(2)},"${s.status}"`
    ).join("\n");

    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `NEFT_BATCH_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setBatchGenerated(true);
    setTimeout(() => setBatchGenerated(false), 5000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §15 MONEY
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Automated Settlement Waterfall & NEFT Batch Engine
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            End-to-end deduction accounting: Customer Gross → Platform Fee → GST 18% → Section 194O TDS 1% → Net Payout.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportNeftBatch}
            disabled={settlements.length === 0}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#0B192C] hover:bg-[#1E3E62] rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Generate NEFT Batch File
          </button>
          <Link
            href="/operations/payouts"
            className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-sm transition-colors"
          >
            <Wallet className="w-4 h-4 text-[#FF6500]" />
            Partner Payouts Board
          </Link>
        </div>
      </div>

      {batchGenerated && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          HDFC / ICICI Corporate Banking NEFT CSV batch file exported successfully. Total {settlements.length} payouts scheduled.
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadSettlements} className="text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* Waterfall Formula Banner */}
      <div className="bg-[#0B192C] text-white p-4 rounded-xl shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-mono">
          <span className="text-[#FF6500] font-bold">WATERFALL FORMULA:</span>
          <span>Gross Bill - (Fee + GST) - TDS 1% - Penalty = Net Bank Transfer</span>
        </div>
        <span className="px-2.5 py-1 bg-white/10 rounded-full font-semibold">
          Daily Auto-Settlement Cycle: 11:30 PM IST
        </span>
      </div>

      {/* Settlements Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Partner</th>
              <th className="px-5 py-3.5">Gross Booking Value</th>
              <th className="px-5 py-3.5">Platform Fee</th>
              <th className="px-5 py-3.5">TDS (1%)</th>
              <th className="px-5 py-3.5">Net Payout</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                  Loading settlement waterfall...
                </td>
              </tr>
            ) : settlements.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                  No active settlement cycles found.
                </td>
              </tr>
            ) : (
              settlements.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-bold text-[#0B192C]">{s.partner_name}</div>
                    <div className="text-xs text-gray-500">{s.partner_phone}</div>
                  </td>
                  <td className="px-5 py-3.5 font-mono font-medium text-gray-800">
                    ₹{(s.gross_paise / 100).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-red-600">
                    -₹{(s.platform_fee_paise / 100).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-amber-700">
                    -₹{(s.tds_deducted_paise / 100).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-emerald-700 text-base">
                    ₹{s.net_payout_inr.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      s.status === "PAID" ? "bg-emerald-100 text-emerald-800" :
                      s.status === "READY_FOR_DISBURSAL" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button 
                      onClick={() => setSelectedSettlement(s)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Ledger
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Ledger Modal */}
      {selectedSettlement && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-[#0B192C]">Partner Settlement Breakdown</h3>
                <p className="text-xs text-gray-500">ID: {selectedSettlement.id}</p>
              </div>
              <button 
                onClick={() => setSelectedSettlement(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-gray-500">Partner</span>
                <span className="font-semibold text-gray-900">{selectedSettlement.partner_name} ({selectedSettlement.partner_phone})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50">
                <span className="text-gray-500">Gross Service Total</span>
                <span className="font-mono font-medium text-gray-900">₹{(selectedSettlement.gross_paise / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50 text-red-600">
                <span>Platform Commission Fee</span>
                <span className="font-mono">-₹{(selectedSettlement.platform_fee_paise / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50 text-amber-700">
                <span>TDS Deduction (Sec 194O - 1%)</span>
                <span className="font-mono">-₹{(selectedSettlement.tds_deducted_paise / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 border-t-2 border-gray-200 text-base font-bold text-emerald-700">
                <span>Net Transfer Amount</span>
                <span className="font-mono">₹{selectedSettlement.net_payout_inr.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1.5 text-xs text-gray-500">
                <span>Status</span>
                <span className="font-bold text-gray-700">{selectedSettlement.status}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Link
                href="/operations/payouts"
                className="px-4 py-2 text-sm font-semibold text-white bg-[#0B192C] hover:bg-[#1E3E62] rounded-xl transition-colors"
              >
                Open in Payouts Desk
              </Link>
              <button
                onClick={() => setSelectedSettlement(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
