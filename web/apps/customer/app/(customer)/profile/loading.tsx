export default function ProfileLoading() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label="Loading profile">
      <div className="skeleton page-skeleton__header" />
      <div className="home-skeleton__grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={`m-${i}`} className="skeleton page-skeleton__card" />
      ))}
    </div>
  );
}
