"use client";

import React, { useState, useEffect } from "react";
import { Badge, Button, Card, Spinner } from "@vsolve/ui";
import {
  History,
  Search,
  RefreshCw,
  Eye,
  FileCode,
} from "lucide-react";

import { adminFetch } from "@/lib/api/admin-fetch";

interface AuditLogEntry {
  id: string;
  actor_phone: string;
  actor_role: string;
  target_entity_type: string;
  target_entity_id: string;
  action_type: string;
  summary: string;
  old_value: Record<string, any>;
  new_value: Record<string, any>;
  timestamp: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action_type", actionFilter);
      if (entityFilter) params.set("entity_type", entityFilter);
      if (searchQuery) params.set("search", searchQuery);

      const res = await adminFetch(`/api/v1/admin/audit-logs/?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotalCount(data.total || 0);
      }
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter, entityFilter]);

  const getActionTone = (action: string): "danger" | "warning" | "info" | "neutral" => {
    switch (action) {
      case "DELETE":
      case "REJECT":
        return "danger";
      case "OVERRIDE":
        return "warning";
      case "APPROVE":
      case "CREATE":
        return "info";
      default:
        return "neutral";
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-warm-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <History className="h-6 w-6 text-[#FF6500]" />
            <h1 className="text-2xl font-bold text-navy-900 tracking-tight">
              Enterprise Immutable Audit Log
            </h1>
          </div>
          <p className="text-sm text-warm-700 mt-1">
            Tamper-proof event stream recording every administrative configuration change, role mutation, and financial action.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Badge tone="info" className="font-mono text-xs">
            {totalCount} Total Recorded Events
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            className="flex items-center gap-1.5 text-xs border-warm-300"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Stream
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card className="p-4 border border-warm-200 bg-white shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-warm-400" />
            <input
              type="text"
              placeholder="Search summary or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchLogs()}
              className="w-full pl-8 pr-3 py-1.5 border border-warm-300 rounded-md text-xs focus:outline-none focus:border-[#FF6500]"
            />
          </div>

          <div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-warm-300 rounded-md text-xs bg-white text-navy-900 focus:outline-none focus:border-[#FF6500]"
            >
              <option value="">All Action Types</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="APPROVE">APPROVE</option>
              <option value="REJECT">REJECT</option>
              <option value="OVERRIDE">OVERRIDE</option>
            </select>
          </div>

          <div>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="w-full px-3 py-1.5 border border-warm-300 rounded-md text-xs bg-white text-navy-900 focus:outline-none focus:border-[#FF6500]"
            >
              <option value="">All Entity Types</option>
              <option value="user_role">User Role Grant</option>
              <option value="kill_switch">Kill Switch</option>
              <option value="refund">Refund / Payment</option>
              <option value="service_category">Service Category</option>
              <option value="payout_batch">Payout Batch</option>
            </select>
          </div>

          <div>
            <Button
              size="sm"
              onClick={fetchLogs}
              className="w-full text-xs bg-[#0B192C] text-white hover:bg-[#1E3E62]"
            >
              Filter Logs
            </Button>
          </div>
        </div>
      </Card>

      {/* Logs Table */}
      <Card className="border border-warm-200 bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-16 gap-3 text-warm-700">
            <Spinner size="md" />
            <span>Streaming audit records…</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-warm-600">
            <History className="h-10 w-10 text-warm-400 mb-2" />
            <p className="font-semibold text-sm">No audit logs matching criteria</p>
            <p className="text-xs text-warm-500 mt-1">
              Events are automatically recorded when administrative mutations occur.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-warm-200 bg-warm-50/80 text-warm-700 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Actor & Role</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target Entity</th>
                  <th className="py-2.5 px-3">Summary</th>
                  <th className="py-2.5 px-3 text-right">Inspection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-warm-50/50">
                    <td className="py-3 px-3 font-mono text-warm-600 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-semibold text-navy-900">{log.actor_phone}</span>
                        <span className="text-[10px] text-warm-500 font-mono">
                          {log.actor_role}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <Badge tone={getActionTone(log.action_type)}>
                        {log.action_type}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-navy-900">
                      {log.target_entity_type}
                    </td>
                    <td className="py-3 px-3 text-warm-700 max-w-xs truncate">
                      {log.summary || "—"}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        className="text-xs flex items-center gap-1 ml-auto"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Diff View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Diff Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col p-6 shadow-2xl bg-white border border-warm-300">
            <div className="flex items-center justify-between border-b border-warm-200 pb-4">
              <div className="flex items-center gap-2">
                <FileCode className="h-5 w-5 text-[#FF6500]" />
                <h3 className="font-bold text-base text-navy-900">
                  Audit Record Inspection: {selectedLog.target_entity_type}
                </h3>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)}>
                Close
              </Button>
            </div>

            <div className="my-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-warm-50 p-3 rounded-lg text-xs">
              <div>
                <span className="text-warm-500 block">Actor</span>
                <span className="font-bold text-navy-900">{selectedLog.actor_phone}</span>
              </div>
              <div>
                <span className="text-warm-500 block">Role</span>
                <span className="font-bold text-navy-900">{selectedLog.actor_role}</span>
              </div>
              <div>
                <span className="text-warm-500 block">Action</span>
                <span className="font-bold text-navy-900">{selectedLog.action_type}</span>
              </div>
              <div>
                <span className="text-warm-500 block">Timestamp</span>
                <span className="font-mono text-warm-700">
                  {new Date(selectedLog.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700 mb-1.5 flex items-center gap-1">
                  Previous State (Old Value)
                </span>
                <pre className="flex-1 p-3 bg-rose-50/50 border border-rose-200 rounded text-[11px] font-mono text-navy-900 overflow-x-auto">
                  {JSON.stringify(selectedLog.old_value, null, 2)}
                </pre>
              </div>

              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1.5 flex items-center gap-1">
                  Mutated State (New Value)
                </span>
                <pre className="flex-1 p-3 bg-emerald-50/50 border border-emerald-200 rounded text-[11px] font-mono text-navy-900 overflow-x-auto">
                  {JSON.stringify(selectedLog.new_value, null, 2)}
                </pre>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
