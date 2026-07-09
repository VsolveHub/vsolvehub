export default function ServicesLoading() {
  return (
    <div className="services-page services-catalog-v2" aria-busy="true" aria-label="Loading services">
      <div className="services-page__hero services-page__hero--skeleton">
        <div className="skeleton" style={{ height: "2rem", width: "60%", marginBottom: "0.75rem", borderRadius: "8px" }} />
        <div className="skeleton" style={{ height: "1rem", width: "80%", borderRadius: "6px" }} />
      </div>
      <div className="services-page__body">
        <div className="catalog-photo-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="catalog-photo-card catalog-photo-card--skeleton">
              <div className="skeleton catalog-photo-card__image" />
              <div className="catalog-photo-card__body">
                <div className="skeleton" style={{ height: "0.875rem", width: "70%", marginBottom: "0.5rem" }} />
                <div className="skeleton" style={{ height: "0.75rem", width: "50%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
