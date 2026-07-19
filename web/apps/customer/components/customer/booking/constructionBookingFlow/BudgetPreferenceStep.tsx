import { Input } from "@/components/ui/Input";
import { hireCardStyle, hireSubStyle } from "./shared";

type Props = {
  budget: string;
  setBudget: (v: string) => void;
  baseDailyRate: number;
  workPriority: "urgent" | "sameday" | "scheduled";
  setWorkPriority: (v: "urgent" | "sameday" | "scheduled") => void;
  bookingType: "individual" | "team";
  proceedChoice: "auto" | "quotes";
  setProceedChoice: (v: "auto" | "quotes") => void;
};

const PRIORITIES = ["urgent", "sameday", "scheduled"] as const;

export function BudgetPreferenceStep({
  budget,
  setBudget,
  baseDailyRate,
  workPriority,
  setWorkPriority,
  bookingType,
  proceedChoice,
  setProceedChoice,
}: Props) {
  return (
    <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Input label="Budget per day (Optional ₹)" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))} placeholder={`Suggested ₹${baseDailyRate}`} inputMode="numeric" />
        <div>
          <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#4b5563", margin: "0 0 0.375rem 0" }}>Work Priority</p>
          <div className="booking-mode-tabs" style={{ display: "flex", gap: "0.5rem" }}>
            {PRIORITIES.map((p) => {
              const label = p === "urgent" ? "Urgent" : p === "sameday" ? "Same Day" : "Scheduled";
              return (
                <button key={p} type="button" className={`booking-mode-tab ${workPriority === p ? "active" : ""}`} style={{ flex: 1, borderRadius: "10px", fontSize: "0.75rem" }} onClick={() => setWorkPriority(p)}>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "#3f3f46", margin: "0 0 0.125rem 0" }}>How do you want to proceed?</p>
        <button type="button" className={`card address-card ${proceedChoice === "auto" ? "selected" : ""}`} style={{ ...hireCardStyle, padding: "1rem" }} onClick={() => setProceedChoice("auto")}>
          <input type="radio" checked={proceedChoice === "auto"} readOnly />
          <div>
            <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>Auto Assign {bookingType === "individual" ? "Worker" : "Team"} (Faster)</p>
            <p style={hireSubStyle}>Instantly assign our top-rated {bookingType === "individual" ? "worker" : "contractor team"}</p>
          </div>
        </button>
        <button type="button" className={`card address-card ${proceedChoice === "quotes" ? "selected" : ""}`} style={{ ...hireCardStyle, padding: "1rem" }} onClick={() => setProceedChoice("quotes")}>
          <input type="radio" checked={proceedChoice === "quotes"} readOnly />
          <div>
            <p style={{ fontWeight: 700, margin: 0, fontSize: "0.9rem" }}>Receive Quotes (Compare & Select)</p>
            <p style={hireSubStyle}>Compare bids from local {bookingType === "individual" ? "workers" : "contractor teams"}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
