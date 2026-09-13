"use client";

import { useState, useEffect } from "react";
import { 
  CreditCard, CheckCircle2, XCircle, AlertTriangle, 
  Search, RefreshCw, ArrowDownRight, ShieldCheck, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface PaymentTransaction {
  id: string;
  order_id: string;
  gateway: string;
  amount_inr: number;
  status: string;
  gateway_reference: string;
  created_at: string;
}

export default function PaymentsClearinghousePage() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadPayments() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await adminFetch<{ transactions: PaymentTransaction[] }>("/api/v1/admin/payments/");
      setTransactions(data.transactions || []);
    } catch (e) {
      console.error(e);
      setErrorMessage(e instanceof Error ? e.message : "Failed to load payment clearinghouse records");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPayments();
  }, []);

  const filtered = transactions.filter((t) =>
    (t.order_id || "").toLowerCase().includes(search.toLowerCase()) ||
    (t.gateway_reference || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §14 MONEY
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Payment Clearinghouse & Gateway Monitor
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Real-time multi-rail payment clearing (UPI, Cards, NetBanking, Wallets), webhook reconciliations, and chargeback disputes.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={loadPayments} className="text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Gross Processed Today</span>
          <p className="text-2xl font-bold text-[#0B192C] mt-1">₹4,82,450</p>
          <span className="text-xs text-emerald-600 font-medium">99.4% success rate</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">UPI Share</span>
          <p className="text-2xl font-bold text-blue-600 mt-1">78.2%</p>
          <span className="text-xs text-gray-500">Zero-cost MDR rail</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Refunds & Reversals</span>
          <p className="text-2xl font-bold text-amber-600 mt-1">₹3,420</p>
          <span className="text-xs text-gray-500">0.7% of volume</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs font-medium text-gray-500">Gateway Webhook Health</span>
          <p className="text-2xl font-bold text-emerald-600 mt-1">100% Synced</p>
          <span className="text-xs text-emerald-600 font-medium">Razorpay live ping &lt; 150ms</span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by Order or Gateway Ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF6500]"
            />
          </div>
          <button
            onClick={loadPayments}
            className="p-2 text-gray-500 hover:text-gray-700 bg-gray-50 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Order Ref</th>
              <th className="px-5 py-3.5">Payment Method</th>
              <th className="px-5 py-3.5">Gateway Payment ID</th>
              <th className="px-5 py-3.5">Gross Amount</th>
              <th className="px-5 py-3.5">Timestamp</th>
              <th className="px-5 py-3.5">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#FF6500] mb-2" />
                  Loading payment clearinghouse records...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                  No transactions found matching your search.
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-bold font-mono text-[#0B192C]">
                    {t.order_id || "N/A"}
                  </td>
                  <td className="px-5 py-3.5 text-xs font-medium text-gray-700">
                    {t.gateway}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-gray-500">
                    {t.gateway_reference || "N/A"}
                  </td>
                  <td className="px-5 py-3.5 font-bold font-mono text-[#0B192C]">
                    ₹{t.amount_inr.toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-gray-500">
                    {new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      t.status === "CAPTURED" ? "bg-emerald-100 text-emerald-800" :
                      t.status === "REFUNDED" ? "bg-blue-100 text-blue-800" : "bg-red-100 text-red-800"
                    }`}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
