import type { QuoteOption } from "./model";

type Props = {
  bookingType: "individual" | "team";
  quoteOptions: QuoteOption[];
  selectedQuoteId: string;
  setSelectedQuoteId: (id: string) => void;
  duration: number;
};

export function QuotesStep({ bookingType, quoteOptions, selectedQuoteId, setSelectedQuoteId, duration }: Props) {
  return (
    <div className="stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p style={{ color: "#666", fontSize: "0.8rem", margin: 0 }}>
        {bookingType === "individual" ? "Choose the best worker for your task:" : "Choose the best team for your work:"}
      </p>
      {bookingType === "team" && quoteOptions.length === 0 && (
        <div className="vsh-card" style={{ textAlign: "center", padding: "1.5rem", color: "#71717a", fontSize: "0.85rem" }}>
          No verified teams are available for this requirement right now. Try adjusting your crew or pick
          “Auto Assign”.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {quoteOptions.map((q) => (
          <div key={q.id} className={`vsh-quote-card ${selectedQuoteId === q.id ? "selected" : ""}`} onClick={() => setSelectedQuoteId(q.id)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h4 style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", color: "#18181b" }}>
                  {q.name}
                  {!q.covers ? <span style={{ marginLeft: 6, fontSize: "0.65rem", color: "#b45309" }}>partial match</span> : null}
                </h4>
                <p style={{ margin: "0.125rem 0 0 0", fontSize: "0.75rem", color: "#71717a" }}>★ {q.rating.toFixed(1)} ({q.reviews} reviews)</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: "1.05rem", color: "var(--color-brand)" }}>₹{q.dailyRate}/day</p>
                <p style={{ margin: 0, fontSize: "0.7rem", color: "#71717a" }}>Total: ₹{q.dailyRate * duration}</p>
              </div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.02)", borderRadius: "8px", padding: "0.375rem 0.5rem", fontSize: "0.7rem", color: "#52525b", marginTop: "0.5rem" }}>
              {q.breakdown}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
