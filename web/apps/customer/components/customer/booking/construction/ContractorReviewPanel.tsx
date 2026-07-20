import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

type Props = {
  reviewSubmitted: boolean;
  rating: number;
  setRating: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
  error: string;
  loading: boolean;
  onSubmit: () => void;
};

export function ContractorReviewPanel({ reviewSubmitted, rating, setRating, review, setReview, error, loading, onSubmit }: Props) {
  if (reviewSubmitted) {
    return (
      <div className="rounded-xl px-4 py-3 text-sm bg-green-50 text-green-700" style={{ fontSize: "0.8rem" }}>
        Thanks for your rating and feedback!
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#3f3f46", textAlign: "center", margin: 0 }}>Rate the Contractor Team</p>
      <div style={{ display: "flex", justifyContent: "center", gap: "0.375rem" }}>
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
      <Textarea
        placeholder="Write a review (optional)..."
        value={review}
        onChange={(e: any) => setReview(e.target.value)}
      />
      {error && <p style={{ color: "red", fontSize: "0.75rem", margin: 0 }}>{error}</p>}
      <Button onClick={onSubmit} loading={loading} block style={{ borderRadius: "12px", height: "42px" }}>
        Submit Feedback
      </Button>
    </div>
  );
}
