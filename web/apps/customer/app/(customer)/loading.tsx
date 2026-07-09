export default function CustomerLoading() {
  return (
    <div className="home-skeleton" aria-busy="true" aria-label="Loading">
      <div className="skeleton home-skeleton__hero" />
      <div className="skeleton-line skeleton-line--title" />
      <div className="skeleton-line skeleton-line--short" />
      <div className="home-skeleton__grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton-line" />
      <div className="home-skeleton__grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`b-${i}`} className="skeleton skeleton-card" />
        ))}
      </div>
    </div>
  );
}
