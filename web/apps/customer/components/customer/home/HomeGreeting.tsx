function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

type Props = {
  name?: string | null;
};

export function HomeGreeting({ name }: Props) {
  const displayName = name?.trim() || "there";

  return (
    <section className="home-greeting" aria-label="Welcome">
      <h1 className="home-greeting-title">
        {greeting()}, {displayName}
      </h1>
      <p className="home-greeting-sub">What service do you need today?</p>
    </section>
  );
}
