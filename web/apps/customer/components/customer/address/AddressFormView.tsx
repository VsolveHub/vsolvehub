import type { AddrForm } from "./model";

type Props = {
  form: AddrForm;
  setField: <K extends keyof AddrForm>(key: K, value: AddrForm[K]) => void;
  detectButton: React.ReactNode;
  saving: boolean;
  detecting: boolean;
  isLoggedIn: boolean;
  hasSavedAddresses: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
};

export function AddressFormView({ form, setField, detectButton, saving, detecting, isLoggedIn, hasSavedAddresses, onSubmit, onBack }: Props) {
  const showBackButton = isLoggedIn ? hasSavedAddresses : true;

  return (
    <form onSubmit={onSubmit} className="addr-modal-form" style={{ border: "none", paddingTop: 0 }}>
      {detectButton}

      <div className="addr-input-group">
        <label className="addr-input-label">Label</label>
        <input
          type="text"
          placeholder="Home, Office, Parent's house…"
          value={form.label}
          onChange={(e) => setField("label", e.target.value)}
          className="addr-input"
          required
        />
      </div>

      <div className="addr-form-row">
        <div className="addr-input-group">
          <label className="addr-input-label">House / flat no.</label>
          <input
            type="text"
            placeholder="Flat 204, Block B"
            value={form.houseNumber}
            onChange={(e) => setField("houseNumber", e.target.value)}
            className="addr-input"
          />
        </div>
        <div className="addr-input-group">
          <label className="addr-input-label">Pincode</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="500032"
            value={form.pincode}
            onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="addr-input"
          />
        </div>
      </div>

      <div className="addr-input-group">
        <label className="addr-input-label">Landmark</label>
        <input
          type="text"
          placeholder="Near metro station"
          value={form.landmark}
          onChange={(e) => setField("landmark", e.target.value)}
          className="addr-input"
        />
      </div>

      <div className="addr-form-row">
        <div className="addr-input-group">
          <label className="addr-input-label">Area / locality</label>
          <input
            type="text"
            placeholder="Gachibowli"
            value={form.area}
            onChange={(e) => setField("area", e.target.value)}
            className="addr-input"
          />
        </div>
        <div className="addr-input-group">
          <label className="addr-input-label">City</label>
          <input
            type="text"
            placeholder="Hyderabad"
            value={form.city}
            onChange={(e) => setField("city", e.target.value)}
            className="addr-input"
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="submit" className="addr-modal-btn" style={{ flexGrow: 1 }} disabled={saving || detecting}>
          {saving ? "Saving…" : "Save & select"}
        </button>
        {showBackButton && (
          <button
            type="button"
            className="addr-modal-btn"
            style={{
              background: "var(--m3-surface-variant, #e7e0ec)",
              color: "var(--m3-on-surface, #1d1b20)",
              width: "auto",
              boxShadow: "none",
            }}
            onClick={onBack}
          >
            {isLoggedIn && hasSavedAddresses ? "Back" : "Cancel"}
          </button>
        )}
      </div>
    </form>
  );
}
