"use client";

type Props = {
  title: string;
  url: string;
  variant?: "full" | "button";
};
export function ServiceShareButton({ title, url, variant = "button" }: Props) {
  async function handleShare() {
    const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    const shareData = { title, text: `Check out ${title} on V Solve Hub`, url: absoluteUrl };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard.writeText(absoluteUrl);
    alert("Link copied to clipboard!");
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 hover:text-[#ea580c] cursor-pointer shadow-xs"
      >
        <ShareIcon />
        <span>Share</span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-600">Share this service with your loved ones</p>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 hover:text-[#ea580c] cursor-pointer"
      >
        <ShareIcon />
        <span>Share</span>
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}
