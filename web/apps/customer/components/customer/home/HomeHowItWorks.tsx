import { HOW_IT_WORKS } from "@/lib/catalog/display-catalog";
import { SectionHeading } from "./SectionHeading";

export function HomeHowItWorks() {
  return (
    <div className="w-full" aria-labelledby="home-how-heading">
      <SectionHeading
        id="home-how-heading"
        eyebrow="Book in 3 steps"
        title="How it works"
      />
      <ol className="flex flex-col md:flex-row gap-6 md:gap-8">
        {HOW_IT_WORKS.map((step) => (
          <li key={step.step} className="flex-1 flex flex-col gap-4 group">
            <span className="flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)] text-lg font-black group-hover:scale-110 group-hover:bg-[var(--color-brand)] group-hover:text-white transition-all shadow-sm" aria-hidden="true">
              {step.step}
            </span>
            <div>
              <strong className="block text-base font-extrabold text-gray-900 mb-1">{step.title}</strong>
              <p className="text-sm text-gray-500 font-medium leading-relaxed">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
