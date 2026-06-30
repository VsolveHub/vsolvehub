type Props = {
  serviceCount: number;
  categoryCount: number;
};

export function HomeStatsStrip({ serviceCount, categoryCount }: Props) {
  return (
    <section className="home-stats-strip" aria-label="Platform highlights">
      <div className="home-stat-pill">
        <strong>{serviceCount}+</strong>
        <span>Services</span>
      </div>
      <div className="home-stat-pill">
        <strong>{categoryCount}</strong>
        <span>Categories</span>
      </div>
      <div className="home-stat-pill">
        <strong>4.8★</strong>
        <span>Avg rating</span>
      </div>
      <div className="home-stat-pill">
        <strong>30m</strong>
        <span>Callback</span>
      </div>
    </section>
  );
}
