import { hireCardStyle, hireSubStyle, recommendedPillStyle } from "./shared";

type Props = {
  bookingType: "individual" | "team";
  setBookingType: (val: "individual" | "team") => void;
};

export function BookingTypeStep({ bookingType, setBookingType }: Props) {
  return (
    <div className="flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p style={{ color: "#666", fontSize: "0.85rem", margin: 0 }}>How do you want to hire?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <button
          type="button"
          className={`card address-card ${bookingType === "individual" ? "selected" : ""}`}
          style={hireCardStyle}
          onClick={() => setBookingType("individual")}
        >
          <input type="radio" checked={bookingType === "individual"} readOnly />
          <div>
            <p style={{ fontWeight: 700, margin: 0, fontSize: "0.95rem" }}>Individual Worker</p>
            <p style={hireSubStyle}>Hire one worker — a single mason, helper or carpenter for small tasks</p>
          </div>
        </button>

        <button
          type="button"
          className={`card address-card ${bookingType === "team" ? "selected" : ""}`}
          style={hireCardStyle}
          onClick={() => setBookingType("team")}
        >
          <input type="radio" checked={bookingType === "team"} readOnly />
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ fontWeight: 700, margin: 0, fontSize: "0.95rem" }}>Team Requirement</p>
              <span style={recommendedPillStyle}>Recommended</span>
            </div>
            <p style={hireSubStyle}>Hire an entire crew for large slab / wall projects</p>
          </div>
        </button>
      </div>
    </div>
  );
}
