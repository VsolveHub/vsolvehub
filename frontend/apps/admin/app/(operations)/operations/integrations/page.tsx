"use client";

import { useState } from "react";
import { 
  Key, ShieldCheck, CheckCircle2, RefreshCw, 
  ExternalLink, Lock, Eye, EyeOff, AlertCircle 
} from "lucide-react";
import { adminFetch } from "@/lib/api/admin-fetch";

interface IntegrationRecord {
  id: string;
  name: string;
  category: string;
  masked_key: string;
  status: "ACTIVE" | "CONNECTED" | "RATE_LIMITED";
  usage_quota: string;
}

export default function IntegrationsManagementPage() {
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([
    { id: "int_rzp", name: "Razorpay Payment Gateway", category: "Payments", masked_key: "rzp_live_••••••••9482", status: "CONNECTED", usage_quota: "1,420 / Unlimited" },
    { id: "int_maps", name: "Google Maps & Geocoding API", category: "GIS & Maps", masked_key: "AIzaSy••••••••8120", status: "CONNECTED", usage_quota: "42,000 / 100,000 requests" },
    { id: "int_supa", name: "Supabase Cloud Storage & Auth", category: "Storage", masked_key: "eyJhbGciOi••••••••3821", status: "CONNECTED", usage_quota: "12.8 GB / 100 GB" },
    { id: "int_waba", name: "WhatsApp Cloud Business API", category: "Messaging", masked_key: "EAAQ••••••••4902", status: "CONNECTED", usage_quota: "8,920 / 50,000 msgs" },
    { id: "int_fcm", name: "Firebase Cloud Messaging (FCM)", category: "Push Alerts", masked_key: "AAAA••••••••1120", status: "CONNECTED", usage_quota: "Unlimited" },
    { id: "int_ses", name: "Amazon SES Transactional Email", category: "Email", masked_key: "AKIA••••••••7712", status: "CONNECTED", usage_quota: "1,200 / 50,000 emails" },
  ]);

  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleRotateKey(item: IntegrationRecord) {
    setRotatingId(item.id);
    try {
      const res = await adminFetch<{ masked_key: string }>("/api/v1/admin/system-health/", {
        method: "POST",
        body: JSON.stringify({
          action: "ROTATE_KEY",
          gateway: item.id,
        }),
      });

      setIntegrations(prev => prev.map(i => 
        i.id === item.id ? { ...i, masked_key: res.masked_key || i.masked_key } : i
      ));

      setSuccessMsg(`API secret rotated and stored in vault for ${item.name}.`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      console.error(err);
    } finally {
      setRotatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#FF6500]/10 text-[#FF6500]">
              §42 SYSTEM
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-[#0B192C]">
              API & Third-Party Integration Vault
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Enterprise credential vault, rate-limit monitors, and secure keys across payment gateways, map engines, and messaging APIs.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          {successMsg}
        </div>
      )}

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((item) => (
          <div key={item.id} className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-gray-400">{item.category}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> {item.status}
                </span>
              </div>
              <h3 className="font-bold text-sm text-[#0B192C] mt-1">{item.name}</h3>

              <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-between mt-3">
                <span className="font-mono text-xs text-gray-600">{item.masked_key}</span>
                <Lock className="w-3.5 h-3.5 text-gray-400" />
              </div>

              <div className="text-xs text-gray-500 pt-2 flex justify-between">
                <span>Usage Quota:</span>
                <strong className="text-gray-800 font-mono">{item.usage_quota}</strong>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                disabled={rotatingId === item.id}
                onClick={() => handleRotateKey(item)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${rotatingId === item.id ? "animate-spin" : ""}`} />
                {rotatingId === item.id ? "Rotating..." : "Rotate Key"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
