import { HOW_IT_WORKS } from "@/lib/catalog/display-catalog";

export function HomeHowItWorks() {
  return (
    <section className="home-section" aria-labelledby="home-how-heading">
      <h2 id="home-how-heading" className="home-section-title">
        How it works
      </h2>
      <ol className="home-steps">
        {HOW_IT_WORKS.map((step) => (
          <li key={step.step} className="home-step">
            <span className="home-step-num" aria-hidden="true">
              {step.step}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
