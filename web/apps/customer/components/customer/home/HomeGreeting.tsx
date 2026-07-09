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
    <section className="home-greeting home-hero-block" aria-label="Welcome">
      <p className="home-greeting-eyebrow">V Solve Hub · Premium home services</p>
      <h1 className="home-greeting-title">
        {greeting()}, {displayName}
      </h1>
      <p className="home-greeting-sub">Book trusted professionals in minutes — at your doorstep.</p>
    </section>
  );
}
