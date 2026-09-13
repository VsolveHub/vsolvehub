"use client";

import { useState } from "react";
import { 
  FileSpreadsheet, Plus, Trash2, Printer, CheckCircle2, 
  IndianRupee, Download, Share2, ArrowLeft, RefreshCw, AlertCircle 
} from "lucide-react";
import Link from "next/link";
import { adminFetch } from "@/lib/api/admin-fetch";

interface BOQItem {
  id: string;
  category: "MATERIAL" | "LABOUR" | "EQUIPMENT" | "TRANSPORT";
  description: string;
  qty: number;
  unit: string;
  unit_rate: number;
}

export default function QuotationBuilderPage() {
  const [projectTitle, setProjectTitle] = useState("3BHK Interior & Modular Kitchen BOQ");
  const [clientName, setClientName] = useState("K. V. Rao");
  const [clientPhone, setClientPhone] = useState("+919876500112");
  const [marginPct, setMarginPct] = useState(12); // 12% platform margin
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [items, setItems] = useState<BOQItem[]>([
    { id: "1", category: "MATERIAL", description: "Waterproof Marine Ply (18mm Greenply)", qty: 24, unit: "Sheets", unit_rate: 2200 },
    { id: "2", category: "MATERIAL", description: "Anti-Scratch Acrylic Laminate Sheets", qty: 16, unit: "Sheets", unit_rate: 1850 },
    { id: "3", category: "MATERIAL", description: "Hafele Soft-Close Tandem Drawer Channels", qty: 8, unit: "Sets", unit_rate: 3400 },
    { id: "4", category: "LABOUR", description: "Master Carpenter & 2 Helpers (Fabrication)", qty: 12, unit: "Days", unit_rate: 2500 },
    { id: "5", category: "EQUIPMENT", description: "Industrial Edge-Banding & Laser Cut Machine", qty: 2, unit: "Sessions", unit_rate: 4500 },
    { id: "6", category: "TRANSPORT", description: "Factory to Site Logistics & Offloading", qty: 2, unit: "Trips", unit_rate: 1800 },
  ]);

  function addItem() {
    const newId = String(Date.now());
    setItems([
      ...items,
      { id: newId, category: "MATERIAL", description: "New BOQ Line Item", qty: 1, unit: "Unit", unit_rate: 1000 },
    ]);
  }

  function updateItem(id: string, updates: Partial<BOQItem>) {
    setItems(items.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  }

  function removeItem(id: string) {
    setItems(items.filter((i) => i.id !== id));
  }

  const rawSubtotal = items.reduce((acc, i) => acc + i.qty * i.unit_rate, 0);
  const platformMargin = Math.round((rawSubtotal * marginPct) / 100);
  const netBeforeTax = rawSubtotal + platformMargin;
  const gst18 = Math.round(netBeforeTax * 0.18);
  const grandTotal = netBeforeTax + gst18;

  async function handleSaveAndExport() {
    setSaving(true);
    setErrorMessage(null);
    try {
      await adminFetch("/api/v1/admin/quotes/", {
        method: "POST",
        body: JSON.stringify({
          action: "SAVE_BOQ",
          title: projectTitle,
          client_name: clientName,
          client_phone: clientPhone,
          items: items,
          margin_pct: marginPct,
          grand_total: grandTotal,
        }),
      });

      setSavedSuccess(true);
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Failed to persist BOQ quotation");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 print:p-0 print:space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/operations/quotes" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §11 MARKETPLACE
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Universal Bill of Quantities (BOQ) Builder
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Standardized line-item quotation generator: Materials, Labour, Equipment, Transport, Margin & GST 18%.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSaveAndExport}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {saving ? "Persisting BOQ..." : "Save & Export PDF"}
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2 print:hidden">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Quotation BOQ snapshot saved to database and logged to audit trail. Printable presentation ready.
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-2 print:hidden">
          <AlertCircle className="w-4 h-4 text-red-600" />
          {errorMessage}
        </div>
      )}

      {/* Project Meta Card */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Project / Requirement Title</label>
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg font-medium text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Client Name</label>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg font-medium text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Client Contact</label>
          <input
            type="text"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg font-mono text-gray-900"
          />
        </div>
      </div>

      {/* BOQ Line Items Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0B192C] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-[#FF6500]" />
            Itemized Cost Breakdown ({items.length} line items)
          </h2>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#FF6500] bg-[#FF6500]/10 hover:bg-[#FF6500]/20 rounded-lg transition-colors print:hidden"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Line Item
          </button>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Item Description</th>
              <th className="px-4 py-3 w-24">Qty</th>
              <th className="px-4 py-3 w-28">Unit</th>
              <th className="px-4 py-3 w-32">Rate (₹)</th>
              <th className="px-4 py-3 w-32 text-right">Total (₹)</th>
              <th className="px-4 py-3 w-16 text-center print:hidden"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item, idx) => (
              <tr key={item.id} className="hover:bg-gray-50/60">
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">{idx + 1}</td>
                <td className="px-4 py-3">
                  <select
                    value={item.category}
                    onChange={(e) => updateItem(item.id, { category: e.target.value as BOQItem["category"] })}
                    className="px-2 py-1 text-xs border rounded bg-white text-gray-700 font-semibold"
                  >
                    <option value="MATERIAL">Material</option>
                    <option value="LABOUR">Labour</option>
                    <option value="EQUIPMENT">Equipment</option>
                    <option value="TRANSPORT">Transport</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(item.id, { description: e.target.value })}
                    className="w-full px-2 py-1 text-xs border rounded font-medium text-gray-800"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={item.qty}
                    min="1"
                    onChange={(e) => updateItem(item.id, { qty: Number(e.target.value) })}
                    className="w-full px-2 py-1 text-xs border rounded font-mono text-center"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="text"
                    value={item.unit}
                    onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                    className="w-full px-2 py-1 text-xs border rounded text-center text-gray-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    value={item.unit_rate}
                    onChange={(e) => updateItem(item.id, { unit_rate: Number(e.target.value) })}
                    className="w-full px-2 py-1 text-xs border rounded font-mono text-right"
                  />
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                  ₹{(item.qty * item.unit_rate).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-center print:hidden">
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-gray-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Calculation Summary Footer */}
        <div className="bg-gray-50/80 p-5 border-t border-gray-200 flex flex-col sm:flex-row items-end justify-end gap-6 text-sm">
          <div className="w-full sm:w-80 space-y-2">
            <div className="flex justify-between text-gray-600">
              <span>Raw Material & Labour Subtotal:</span>
              <span className="font-mono font-medium">₹{rawSubtotal.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-gray-600">
              <span className="flex items-center gap-1">
                Platform Service Margin:
                <input
                  type="number"
                  value={marginPct}
                  onChange={(e) => setMarginPct(Number(e.target.value))}
                  className="w-12 px-1 py-0.5 text-xs border rounded text-center font-mono ml-1"
                />
                %
              </span>
              <span className="font-mono font-medium text-emerald-700">+₹{platformMargin.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>GST (18% Reverse Charge):</span>
              <span className="font-mono font-medium text-gray-700">+₹{gst18.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-[#0B192C] border-t border-gray-300 pt-2">
              <span>Final Grand Total:</span>
              <span className="font-mono text-lg text-[#FF6500]">₹{grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
