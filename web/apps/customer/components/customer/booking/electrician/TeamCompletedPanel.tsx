import Image from "next/image";

type Props = {
  bookingRef: string;
  crewTotal: string;
  rating: number;
  setRating: (val: number) => void;
  review: string;
  setReview: (val: string) => void;
};

export function TeamCompletedPanel({ bookingRef, crewTotal, rating, setRating, review, setReview }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Completed Banner */}
      <div className="bg-white border border-gray-150 rounded-3xl p-4 shadow-sm flex justify-between items-center select-none">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏗️</span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-sm text-purple-950 m-0">Work Completed!</h2>
              <span className="bg-amber-400 text-purple-950 text-[7px] font-black px-1.5 py-0.5 rounded uppercase">
                Paid
              </span>
            </div>
            <p className="text-[10px] text-gray-500 font-semibold mt-0.5 m-0">ID: #{bookingRef}</p>
          </div>
        </div>
        <p className="font-black text-sm text-purple-950 m-0">₹{crewTotal}</p>
      </div>

      {/* Visual Verification */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1 select-none">Visual Verification</p>
        <div className="grid grid-cols-2 gap-3.5">
          {/* BEFORE picture card */}
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-200 border border-gray-100 shadow-inner">
            <Image src="https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=250" alt="before" fill className="object-cover" />
            <span className="absolute top-2 left-2 bg-black/75 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
              Before
            </span>
          </div>
          {/* AFTER picture card */}
          <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-200 border border-gray-100 shadow-inner">
            <Image src="https://images.unsplash.com/photo-1558223180-113b869c647c?w=250" alt="after" fill className="object-cover" />
            <span className="absolute top-2 left-2 bg-purple-700 text-white text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
              After
            </span>
          </div>
        </div>
      </div>

      {/* Completion OTP Card */}
      <div className="bg-purple-100/30 border border-dashed border-purple-300 rounded-3xl p-5 flex flex-col items-center gap-3.5 select-none">
        <p className="text-[10px] font-bold text-purple-950 uppercase tracking-wide m-0">Completion OTP</p>
        <p className="text-[9px] text-gray-500 m-0">Ask your professional for the 4-digit code</p>
        <div className="flex gap-2.5 mt-0.5">
          {["7", "1", "•", "•"].map((char, index) => (
            <div
              key={index}
              className="w-9 h-11 bg-white border border-gray-250 rounded-xl flex items-center justify-center font-extrabold text-sm text-purple-950 shadow-sm"
            >
              {char}
            </div>
          ))}
        </div>
      </div>

      {/* Rate Service & Professional */}
      <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm text-center flex flex-col items-center gap-3">
        <p className="text-xs font-bold text-purple-955 m-0 uppercase tracking-wide">Rate Service & Professional</p>

        {/* Clickable Star Ratings */}
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className="text-3xl cursor-pointer focus:outline-none transition-transform hover:scale-110 active:scale-95"
              onClick={() => setRating(star)}
            >
              {star <= rating ? "★" : "☆"}
            </button>
          ))}
        </div>

        <div className="w-full flex flex-col gap-1 pt-1 text-left">
          <textarea
            placeholder="Optional: How was your experience with the team?"
            value={review}
            onChange={(e) => setReview(e.target.value)}
            className="w-full min-h-[80px] p-3 text-xs border border-gray-200 rounded-2xl focus:outline-none focus:border-purple-600 text-gray-800 bg-purple-50/10"
          />
        </div>
      </div>
    </div>
  );
}
