"use client";

import { useState } from "react";
import { Card } from "@/components/ui/primitives";

const DEFAULT_SETTINGS = {
  pushNotifications: true,
  smsAlerts: true,
  emailUpdates: false,
};

const PANEL_TITLE = "mb-4 text-base font-bold text-gray-900";

function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
        on ? "bg-[var(--color-brand)]" : "bg-gray-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function ProfileSettingsForm() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  function toggle(key: keyof typeof DEFAULT_SETTINGS) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const notifRows: { key: keyof typeof DEFAULT_SETTINGS; icon: string; label: string }[] = [
    { key: "pushNotifications", icon: "📱", label: "Push notifications" },
    { key: "smsAlerts", icon: "💬", label: "SMS alerts" },
    { key: "emailUpdates", icon: "✉️", label: "Email updates" },
  ];

  const prefs = [
    { icon: "🌐", label: "Language", value: "English" },
    { icon: "🏙️", label: "City", value: "Hyderabad" },
    { icon: "💵", label: "Currency", value: "INR (₹)" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <h2 className={PANEL_TITLE}>Notifications</h2>
        <div className="divide-y divide-gray-100">
          {notifRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between py-3">
              <span className="flex items-center gap-3 text-sm font-medium text-gray-800">
                <span aria-hidden>{row.icon}</span>
                {row.label}
              </span>
              <Toggle on={settings[row.key]} onChange={() => toggle(row.key)} label={row.label} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className={PANEL_TITLE}>Preferences</h2>
        <div className="divide-y divide-gray-100">
          {prefs.map((p) => (
            <div key={p.label} className="flex items-center justify-between py-3">
              <span className="flex items-center gap-3 text-sm font-medium text-gray-800">
                <span aria-hidden>{p.icon}</span>
                {p.label}
              </span>
              <span className="text-sm font-semibold text-gray-500">{p.value}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className={PANEL_TITLE}>Account</h2>
        <div className="divide-y divide-gray-100">
          <button
            type="button"
            className="flex w-full items-center justify-between py-3 text-left transition-colors hover:text-[var(--color-brand)]"
          >
            <span className="flex items-center gap-3 text-sm font-medium text-gray-800">
              <span aria-hidden>📞</span>
              Change phone number
            </span>
            <span className="text-gray-400">→</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between py-3 text-left text-[var(--color-danger)] transition-colors hover:opacity-80"
          >
            <span className="flex items-center gap-3 text-sm font-medium">
              <span aria-hidden>🗑️</span>
              Delete account
            </span>
            <span>→</span>
          </button>
        </div>
      </Card>
    </div>
  );
}
