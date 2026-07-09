export default function NotificationsLoading() {
  return (
    <div className="page-skeleton" aria-busy="true" aria-label="Loading notifications">
      <div className="skeleton page-skeleton__header" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton page-skeleton__card" />
      ))}
    </div>
  );
}
