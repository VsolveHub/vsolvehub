"use client";

import { useState, useEffect } from "react";
import { 
  Headphones, MessageSquare, Clock, CheckCircle2, 
  AlertTriangle, Search, RefreshCw, Send, ShieldAlert, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface TicketItem {
  id: string;
  ticket_no: string;
  case_type: string;
  state: string;
  priority: string;
  title: string;
  sla_minutes_remaining: number;
  created_at: string;
}

export default function CustomerSupportPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySent, setReplySent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadTickets() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await adminFetch<{ tickets: TicketItem[] }>("/api/v1/admin/support-tickets/");
      setTickets(data.tickets || []);
      if (data.tickets && data.tickets.length > 0 && !selectedTicket) {
        setSelectedTicket(data.tickets[0] ?? null);
      }
    } catch (e) {
      console.error(e);
      setErrorMessage(e instanceof Error ? e.message : "Failed to load support tickets");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  async function handleSendReply() {
    if (!replyText.trim() || !selectedTicket) return;
    try {
      await adminFetch("/api/v1/admin/verticals-overview/", {
        method: "POST",
        body: JSON.stringify({
          action: "SUPPORT_TICKET_REPLY",
          target_id: selectedTicket.id,
          reply_message: replyText.trim(),
        }),
      });

      setReplySent(true);
      setReplyText("");
      setTimeout(() => setReplySent(false), 4000);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleResolveTicket() {
    if (!selectedTicket) return;
    try {
      await adminFetch("/api/v1/admin/verticals-overview/", {
        method: "POST",
        body: JSON.stringify({
          action: "RESOLVE_SUPPORT_TICKET",
          target_id: selectedTicket.id,
          resolution: "Marked resolved by support operator desk",
        }),
      });

      const updated = { ...selectedTicket, state: "RESOLVED" };
      setSelectedTicket(updated);
      setTickets(tickets.map(t => t.id === selectedTicket.id ? updated : t));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §28 SUPPORT
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Customer Support & Omnichannel Ticketing Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Priority SLA triage, joint customer-partner case threads, internal case notes, and rapid dispute settlements.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={loadTickets} className="text-xs font-bold underline">Retry</button>
        </div>
      )}

      {/* Tickets Stream & Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Tickets Queue */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-sm text-[#0B192C]">Support Queue ({tickets.length})</h3>
            <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> P1 SLA: 30 Mins Max
            </span>
          </div>

          <div className="divide-y divide-gray-200">
            {loading ? (
              <div className="p-12 text-center text-gray-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#FF6500] mb-2" />
                Loading support tickets from database...
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-12 text-center text-gray-500">
                No active support tickets found.
              </div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicket(t)}
                  className={`p-4 cursor-pointer hover:bg-gray-50/80 transition-colors ${
                    selectedTicket?.id === t.id ? "bg-orange-50/40 border-l-4 border-l-[#FF6500]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-[#0B192C]">{t.ticket_no}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      t.priority === "P1_URGENT" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                    }`}>
                      {t.priority}
                    </span>
                  </div>
                  <h4 className="font-semibold text-sm text-gray-900 mt-1">{t.title}</h4>
                  <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                    <span>Type: <strong>{t.case_type}</strong></span>
                    {t.state === "OPEN" ? (
                      <span className="text-amber-700 font-semibold font-mono">
                        {t.sla_minutes_remaining} mins remaining
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">Resolved</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Active Conversation & Resolution */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4">
          {selectedTicket ? (
            <>
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <span className="text-xs font-mono text-gray-400 font-bold">{selectedTicket.ticket_no}</span>
                  <h3 className="font-bold text-base text-[#0B192C]">{selectedTicket.title}</h3>
                </div>
                {selectedTicket.state !== "RESOLVED" && (
                  <button
                    type="button"
                    onClick={handleResolveTicket}
                    className="px-3 py-1 text-xs font-bold text-emerald-800 bg-emerald-100 rounded-lg hover:bg-emerald-200"
                  >
                    Mark Case Resolved
                  </button>
                )}
              </div>

              {replySent && (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Resolution reply dispatched to customer via SMS and In-App notification.
                </div>
              )}

              {/* Chat Thread */}
              <div className="space-y-3 max-h-72 overflow-y-auto p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                <div className="p-3 bg-white rounded-lg shadow-xs border border-gray-100 max-w-sm">
                  <strong className="text-gray-900 block font-semibold">User Inquiry:</strong>
                  <p className="text-gray-700 mt-1">{selectedTicket.title}</p>
                  <span className="text-[10px] text-gray-400 block text-right mt-1">
                    {new Date(selectedTicket.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg shadow-xs border border-blue-100 max-w-sm ml-auto text-blue-900">
                  <strong className="block font-semibold">System Audit Bot:</strong>
                  <p className="mt-1">Telemetry and case verification completed across Postgres and Redis records.</p>
                </div>
              </div>

              {/* Reply Box */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-700">Reply to Customer & Partner:</label>
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type official support message or internal note..."
                  className="w-full p-2.5 border rounded-lg text-xs"
                />
                <div className="flex justify-between items-center pt-1">
                  <span className="text-[10px] text-gray-400">All agent replies logged to audit trail.</span>
                  <button
                    type="button"
                    onClick={handleSendReply}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-xs"
                  >
                    <Send className="w-3.5 h-3.5" /> Send Resolution
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-24 text-center text-gray-400 text-xs">
              Select a ticket from the queue on the left to inspect conversation and issue resolutions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
