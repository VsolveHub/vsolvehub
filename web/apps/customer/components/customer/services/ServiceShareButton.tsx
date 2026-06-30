"use client";

type Props = {
  title: string;
  url: string;
};

export function ServiceShareButton({ title, url }: Props) {
  async function handleShare() {
    const shareData = { title, text: `Check out ${title} on V Solve Hub`, url };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard.writeText(url);
    alert("Link copied to clipboard!");
  }

  return (
    <div className="sd-share">
      <p className="sd-share-label">Share this service with your loved ones</p>
      <button type="button" className="sd-share-btn" onClick={handleShare}>
        <ShareIcon />
        Share
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
