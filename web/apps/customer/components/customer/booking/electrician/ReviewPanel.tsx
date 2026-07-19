import { getRatingLabel } from "./steps";

type Props = {
  rating: number;
  setRating: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
  reviewSubmitted: boolean;
  error: string;
  loading: boolean;
  onSubmit: () => void;
};

export function ReviewPanel({ rating, setRating, review, setReview, reviewSubmitted, error, loading, onSubmit }: Props) {
  return (
    <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm text-center flex flex-col items-center gap-3">
      <p className="text-xs font-bold text-purple-955 m-0 uppercase tracking-wide">
        {reviewSubmitted ? "Your rating" : "How was your experience?"}
      </p>

      <div className="flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={reviewSubmitted}
            className="text-3xl focus:outline-none transition-transform hover:scale-110 active:scale-95 disabled:cursor-default"
            onClick={() => setRating(star)}
          >
            {star <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>

      <span className="bg-amber-100 border border-amber-200/50 text-amber-800 text-[10px] font-extrabold px-3 py-1 rounded-full mt-1">
        {getRatingLabel(rating)}
      </span>

      {reviewSubmitted ? (
        <p className="text-[11px] text-emerald-600 font-bold m-0">
          ✓ Thanks! Your feedback is shared with the professional.
        </p>
      ) : (
        <div className="w-full flex flex-col gap-2 mt-1">
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            placeholder="Add a few words about the professional (optional)"
            className="w-full min-h-[60px] p-2.5 text-xs border border-gray-200 rounded-2xl focus:outline-none focus:border-purple-500 text-left"
          />
          {error && <p className="text-[11px] text-red-600 m-0">{error}</p>}
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading}
            className="w-full py-2.5 bg-purple-900 hover:bg-purple-950 text-white text-xs font-bold rounded-full disabled:opacity-60"
          >
            {loading ? "Submitting…" : "Submit rating"}
          </button>
        </div>
      )}
    </div>
  );
}
