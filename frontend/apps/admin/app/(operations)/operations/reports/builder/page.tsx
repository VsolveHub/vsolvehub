"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  FileSpreadsheet, Play, Download, ArrowLeft, 
  CheckCircle2, Sliders, BarChart2, Table 
} from "lucide-react";

export default function CustomReportBuilderPage() {
  const [dataSource, setDataSource] = useState("bookings");
  const [dimension, setDimension] = useState("city");
  const [metric, setMetric] = useState("count");
  const [ranQuery, setRanQuery] = useState(false);

  const sampleResults = [
    { label: "Hyderabad — West IT Corridor", count: 1840, sum_inr: "₹18,42,000", avg_ticket: "₹1,001" },
    { label: "Hyderabad — Central Commercial", count: 1240, sum_inr: "₹14,20,000", avg_ticket: "₹1,145" },
    { label: "Hyderabad — North Residential", count: 980, sum_inr: "₹8,90,000", avg_ticket: "₹908" },
    { label: "Warangal — Urban Hub", count: 420, sum_inr: "₹3,78,000", avg_ticket: "₹900" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/operations/reports" className="text-gray-400 hover:text-gray-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §37 ANALYTICS
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Custom Ad-Hoc Report & Query Builder
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Build custom cross-vertical tabular reports: Select Data Source → Columns → Group By → Filter → Visualize & Export.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRanQuery(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
          >
            <Play className="w-4 h-4" />
            Execute Ad-Hoc Query
          </button>
        </div>
      </div>

      {/* Query Configuration Matrix */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">1. Master Data Source</label>
          <select
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white font-medium text-gray-800"
          >
            <option value="bookings">Universal Bookings Lifecycle (Fulfilment)</option>
            <option value="payouts">Partner Settlements & Net Payouts</option>
            <option value="quotes">13-Vertical RFQ Quotations & BOQ</option>
            <option value="customers">Customer 360 & Loyalty Profiles</option>
            <option value="payments">Payment Gateway Transactions</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">2. Group By Dimension</label>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white font-medium text-gray-800"
          >
            <option value="city">Geographic Zone / City Territory</option>
            <option value="category">Catalog Service Category</option>
            <option value="status">Booking Lifecycle Status</option>
            <option value="persona">Partner Provider Persona</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">3. Aggregate Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg bg-white font-medium text-gray-800"
          >
            <option value="count">Record Count & Sum(Gross Value)</option>
            <option value="avg">Average Order Ticket Value (AOV)</option>
            <option value="take_rate">Net Platform Fee Take-Rate</option>
          </select>
        </div>
      </div>

      {/* Results View */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-[#0B192C] flex items-center gap-2">
            <Table className="w-4 h-4 text-[#FF6500]" />
            Query Output Data Matrix
          </h3>
          <button
            type="button"
            onClick={() => {
              const headers = "GroupingDimension,TotalVolume,AggregateGMV,AverageTicket\n";
              const rows = sampleResults.map(r => `"${r.label}",${r.count},"${r.sum_inr}","${r.avg_ticket}"`).join("\n");
              const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.setAttribute("download", `custom_report_${dataSource}_${dimension}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Grouping Dimension</th>
              <th className="px-5 py-3.5">Total Volume</th>
              <th className="px-5 py-3.5">Aggregate GMV</th>
              <th className="px-5 py-3.5 text-right">Average Ticket Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sampleResults.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                <td className="px-5 py-3.5 font-bold text-[#0B192C]">{row.label}</td>
                <td className="px-5 py-3.5 font-mono text-gray-700">{row.count.toLocaleString()}</td>
                <td className="px-5 py-3.5 font-mono font-semibold text-emerald-700">{row.sum_inr}</td>
                <td className="px-5 py-3.5 font-mono text-right text-gray-800">{row.avg_ticket}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
