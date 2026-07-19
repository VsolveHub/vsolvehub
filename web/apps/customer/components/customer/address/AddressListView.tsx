import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import type { Address } from "./model";

type Props = {
  isLoggedIn: boolean;
  addresses: Address[];
  redirectAfterLogin: string;
  detectButton: React.ReactNode;
  onSelectAddress: (id: string) => void;
  onAddNew: () => void;
  onClose: () => void;
};

export function AddressListView({ isLoggedIn, addresses, redirectAfterLogin, detectButton, onSelectAddress, onAddNew, onClose }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {detectButton}

      {isLoggedIn ? (
        <>
          <div className="addr-modal-list">
            {addresses.map((addr) => {
              const active = getCookie("location_id") === addr.id || addr.isDefault;
              return (
                <div
                  key={addr.id}
                  className={`addr-item ${active ? "addr-item--active" : ""}`}
                  onClick={() => onSelectAddress(addr.id)}
                >
                  <span className="addr-item__icon">📍</span>
                  <div className="addr-item__info">
                    <span className="addr-item__label">{addr.label}</span>
                    <span className="addr-item__text">{addr.fullAddress}</span>
                  </div>
                  {active && <span className="addr-item__check">✓</span>}
                </div>
              );
            })}
            {addresses.length === 0 && (
              <p className="text-muted" style={{ textAlign: "center", fontSize: "0.875rem", margin: 0 }}>
                No saved addresses yet.
              </p>
            )}
          </div>

          <button
            className="addr-modal-btn"
            style={{
              background: "transparent",
              color: "var(--color-brand)",
              border: "1.5px dashed var(--color-brand)",
              boxShadow: "none",
            }}
            onClick={onAddNew}
          >
            + Add new address
          </button>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", textAlign: "center" }}>
          <p className="text-muted" style={{ fontSize: "0.825rem", margin: 0 }}>
            Log in to save addresses to your account, or set one for this session below.
          </p>
          <Link
            href={`/booking/otp?redirect=${encodeURIComponent(redirectAfterLogin)}`}
            className="addr-modal-btn"
            style={{ textDecoration: "none" }}
            onClick={onClose}
          >
            Log In / Register
          </Link>
          <button
            className="addr-modal-btn"
            style={{
              background: "transparent",
              color: "var(--color-brand)",
              border: "1.5px dashed var(--color-brand)",
              boxShadow: "none",
            }}
            onClick={onAddNew}
          >
            Enter address manually
          </button>
        </div>
      )}
    </div>
  );
}
