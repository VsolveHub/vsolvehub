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
      <section className="settings-premium-card">
        <h2 className="settings-panel-title">Notifications</h2>
        <div className="settings-toggle-list">
          <label className="settings-toggle-row">
            <div className="settings-label-wrap">
              <span className="settings-icon">📱</span>
              <span>Push notifications</span>
            </div>
            <div className={`premium-toggle ${settings.pushNotifications ? "active" : ""}`}>
              <input type="checkbox" checked={settings.pushNotifications} onChange={() => toggle("pushNotifications")} className="sr-only" />
              <div className="premium-toggle-thumb" />
            </div>
          </label>
          <label className="settings-toggle-row">
            <div className="settings-label-wrap">
              <span className="settings-icon">💬</span>
              <span>SMS alerts</span>
            </div>
            <div className={`premium-toggle ${settings.smsAlerts ? "active" : ""}`}>
              <input type="checkbox" checked={settings.smsAlerts} onChange={() => toggle("smsAlerts")} className="sr-only" />
              <div className="premium-toggle-thumb" />
            </div>
          </label>
          <label className="settings-toggle-row">
            <div className="settings-label-wrap">
              <span className="settings-icon">✉️</span>
              <span>Email updates</span>
            </div>
            <div className={`premium-toggle ${settings.emailUpdates ? "active" : ""}`}>
              <input type="checkbox" checked={settings.emailUpdates} onChange={() => toggle("emailUpdates")} className="sr-only" />
              <div className="premium-toggle-thumb" />
            </div>
          </label>
        </div>
      </section>

      <section className="settings-premium-card">
        <h2 className="settings-panel-title">Preferences</h2>
        <div className="settings-info-list">
          <div className="settings-info-row">
            <div className="settings-label-wrap">
              <span className="settings-icon">🌐</span>
              <span className="settings-info-label">Language</span>
            </div>
            <span className="settings-info-value">English</span>
          </div>
          <div className="settings-info-row">
            <div className="settings-label-wrap">
              <span className="settings-icon">🏙️</span>
              <span className="settings-info-label">City</span>
            </div>
            <span className="settings-info-value">Hyderabad</span>
          </div>
          <div className="settings-info-row">
            <div className="settings-label-wrap">
              <span className="settings-icon">💵</span>
              <span className="settings-info-label">Currency</span>
            </div>
            <span className="settings-info-value">INR (₹)</span>
          </div>
        </div>
      </section>

      <section className="settings-premium-card">
        <h2 className="settings-panel-title">Account</h2>
        <div className="settings-info-list">
          <button type="button" className="settings-info-row settings-action-btn">
            <div className="settings-label-wrap">
              <span className="settings-icon">📞</span>
              <span>Change phone number</span>
            </div>
            <span className="settings-arrow">→</span>
          </button>
          <button type="button" className="settings-info-row settings-action-btn delete-account">
            <div className="settings-label-wrap">
              <span className="settings-icon">🗑️</span>
              <span>Delete account</span>
            </div>
            <span className="settings-arrow">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
