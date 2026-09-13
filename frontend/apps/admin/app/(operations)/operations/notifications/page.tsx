"use client";

import { useState } from "react";
import { 
  Bell, MessageSquare, Smartphone, Mail, Plus, 
  CheckCircle2, Send, Sliders, X, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface NotificationTemplate {
  id: string;
  name: string;
  trigger_event: string;
  channels: ("PUSH" | "SMS" | "WHATSAPP" | "EMAIL")[];
  body_template: string;
  is_active: boolean;
}

export default function NotificationCenterPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([
    { id: "nt_1", name: "Booking Start OTP Alert", trigger_event: "BOOKING_PARTNER_ARRIVED", channels: ["SMS", "WHATSAPP", "PUSH"], body_template: "Hi {{customer_name}}, your partner {{partner_name}} has arrived. Share Start-OTP {{otp}} to commence work.", is_active: true },
    { id: "nt_2", name: "Quotation Bid Received", trigger_event: "QUOTE_VENDOR_BID", channels: ["PUSH", "WHATSAPP"], body_template: "New quote proposal of ₹{{amount}} received for project '{{project_name}}'. Tap to inspect line items.", is_active: true },
    { id: "nt_3", name: "Partner Payout Disbursed", trigger_event: "SETTLEMENT_NEFT_SUCCESS", channels: ["SMS", "WHATSAPP"], body_template: "Dear {{partner_name}}, your net payout of ₹{{amount}} for 12 jobs has been transferred to bank account ending in {{bank_last4}}.", is_active: true },
    { id: "nt_4", name: "Emergency SOS Operator Alert", trigger_event: "SAFETY_SOS_TRIGGERED", channels: ["PUSH", "SMS"], body_template: "URGENT: SOS triggered on booking #{{booking_id}} near {{location}}. Operations team is in touch with authorities.", is_active: true },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"PUSH" | "SMS" | "WHATSAPP" | "EMAIL">("PUSH");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function openCreateModal() {
    setSelectedTemplate(null);
    setName("");
    setChannel("PUSH");
    setBody("");
    setIsModalOpen(true);
  }

  function openEditModal(t: NotificationTemplate) {
    setSelectedTemplate(t);
    setName(t.name);
    setChannel(t.channels[0] || "PUSH");
    setBody(t.body_template);
    setIsModalOpen(true);
  }

  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;

    setSubmitting(true);
    try {
      await adminFetch("/api/v1/admin/growth/", {
        method: "POST",
        body: JSON.stringify({
          action: "SAVE_NOTIFICATION_TEMPLATE",
          name: name.trim(),
          channel: channel,
          body_template: body.trim(),
        }),
      });

      if (selectedTemplate) {
        setTemplates(templates.map(t => 
          t.id === selectedTemplate.id ? { ...t, name: name.trim(), body_template: body.trim(), channels: [channel] } : t
        ));
      } else {
        setTemplates([
          {
            id: `nt_${Date.now()}`,
            name: name.trim(),
            trigger_event: "CUSTOM_EVENT",
            channels: [channel],
            body_template: body.trim(),
            is_active: true,
          },
          ...templates,
        ]);
      }

      setIsModalOpen(false);
      setSuccessMsg("Notification template persisted and configured for live dispatch.");
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §29 GROWTH
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              Multi-Channel Notification Center
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Author and orchestrate automated communications across Mobile Push (FCM), DLT SMS, WhatsApp Business, and Email.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Templates List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((t) => (
          <div key={t.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-gray-400 uppercase tracking-wide">
                  {t.trigger_event}
                </span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                  Live Active
                </span>
              </div>
              <h3 className="text-base font-bold text-[#0B192C] mt-1">{t.name}</h3>

              <div className="flex gap-1.5 mt-2">
                {t.channels.map((ch) => (
                  <span key={ch} className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">
                    {ch}
                  </span>
                ))}
              </div>

              <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs font-mono text-gray-800">
                &quot;{t.body_template}&quot;
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs">
              <span className="text-gray-400">Tokens: &#123;&#123;name&#125;&#125;, &#123;&#123;amount&#125;&#125;</span>
              <button 
                onClick={() => openEditModal(t)}
                className="text-[#FF6500] font-semibold hover:underline"
              >
                Edit Template
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Template Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs">
          <form onSubmit={handleSaveTemplate} className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-[#0B192C]">
                {selectedTemplate ? "Edit Template" : "New Notification Template"}
              </h3>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Template Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Booking Confirmation SMS"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                >
                  <option value="PUSH">Mobile Push Notification (FCM)</option>
                  <option value="WHATSAPP">WhatsApp Business API</option>
                  <option value="SMS">DLT Registered SMS</option>
                  <option value="EMAIL">Transactional Email</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Body Text Template (supports &#123;&#123;tokens&#125;&#125;)</label>
                <textarea
                  rows={4}
                  required
                  placeholder="e.g., Hi {{customer_name}}, your booking #{{booking_id}} has been confirmed."
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#FF6500] hover:bg-[#E35B00] rounded-lg disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save Template"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
