"use client";

import { useState } from "react";

const DEFAULT_SETTINGS = {
  pushNotifications: true,
  smsAlerts: true,
  emailUpdates: false,
};

export function ProfileSettingsForm() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  function toggle(key: keyof typeof DEFAULT_SETTINGS) {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="profile-panel-stack">
      <section className="profile-panel">
        <h2 className="profile-panel-title">Notifications</h2>
        <div className="profile-toggle-list">
          <label className="profile-toggle-row">
            <span>Push notifications</span>
            <input
              type="checkbox"
              checked={settings.pushNotifications}
              onChange={() => toggle("pushNotifications")}
            />
          </label>
          <label className="profile-toggle-row">
            <span>SMS alerts</span>
            <input type="checkbox" checked={settings.smsAlerts} onChange={() => toggle("smsAlerts")} />
          </label>
          <label className="profile-toggle-row">
            <span>Email updates</span>
            <input
              type="checkbox"
              checked={settings.emailUpdates}
              onChange={() => toggle("emailUpdates")}
            />
          </label>
        </div>
      </section>

      <section className="profile-panel">
        <h2 className="profile-panel-title">Preferences</h2>
        <div className="profile-info-list">
          <div className="profile-info-row">
            <span className="profile-info-label">Language</span>
            <span className="profile-info-value">English</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-label">City</span>
            <span className="profile-info-value">Hyderabad</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-label">Currency</span>
            <span className="profile-info-value">INR (₹)</span>
          </div>
        </div>
      </section>

      <section className="profile-panel">
        <h2 className="profile-panel-title">Account</h2>
        <div className="profile-info-list">
          <button type="button" className="profile-info-row profile-info-link profile-info-btn">
            <span>Change phone number</span>
            <span>→</span>
          </button>
          <button type="button" className="profile-info-row profile-info-link profile-info-btn">
            <span>Delete account</span>
            <span>→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
