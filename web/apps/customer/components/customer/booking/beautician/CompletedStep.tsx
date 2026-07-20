import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

type Props = {
  partnerName: string;
  rating: number;
  setRating: (val: number) => void;
  tip: number;
  setTip: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
  error: string;
  loading: boolean;
  onSubmit: () => void;
};

export function CompletedStep({ partnerName, rating, setRating, tip, setTip, review, setReview, error, loading, onSubmit }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4 text-center" style={{ padding: "1.5rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <span style={{ fontSize: "2.5rem" }}>🌸</span>
      <h3 style={{ fontWeight: 800, marginTop: "0.5rem", marginBottom: "0.25rem", fontSize: "1.15rem" }}>Service Completed!</h3>
      <p style={{ color: "#666", fontSize: "0.75rem", marginBottom: "1.25rem" }}>
        How was your facial session with {partnerName}?
      </p>

      <div style={{ textAlign: "left", width: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Rating */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                style={{ background: "none", border: "none", fontSize: "1.75rem", color: n <= rating ? "#ca8a04" : "#d4d4d8", cursor: "pointer" }}
                onClick={() => setRating(n)}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        {/* Tip */}
        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "0.875rem" }}>
          <p style={{ fontWeight: 700, fontSize: "0.8rem", color: "#3f3f46", margin: "0 0 0.5rem 0", textAlign: "center" }}>Add tip for {partnerName}</p>
          <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem" }}>
            {[30, 50, 100].map((val) => (
              <button
                key={val}
                type="button"
                className={`btn ${tip === val ? "btn-primary" : "btn-secondary"}`}
                style={{ padding: "0.375rem 0.75rem", fontSize: "0.8rem", borderRadius: "8px" }}
                onClick={() => setTip(tip === val ? 0 : val)}
              >
                + ₹{val}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          placeholder="Write a review (optional)..."
          value={review}
          onChange={(e: any) => setReview(e.target.value)}
        />
        {error && <p style={{ color: "red", fontSize: "0.75rem", margin: 0 }}>{error}</p>}
        <Button onClick={onSubmit} loading={loading} block style={{ borderRadius: "12px", height: "42px" }}>
          Submit & View Invoice
        </Button>
      </div>
    </div>
  );
}
