import { formatPrice } from "@/lib/format";
import { ServiceSketchImage } from "@/components/ui/ServiceSketchImage";
import type { FlowService } from "./types";

export function ServiceStep({
  services,
  onSelect,
}: {
  services: FlowService[];
  onSelect: (serviceId: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-4 text-xs font-black uppercase tracking-widest text-gray-500">
        Select a service
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {services.map((s) => {
          const isRecommended =
            s.name.toLowerCase().includes("deep") || s.name.toLowerCase().includes("premium");
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:shadow-md ${
                isRecommended ? "border-[var(--color-brand)]" : "border-gray-200"
              }`}
            >
              {isRecommended && (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-[var(--color-brand)] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                  <span>Recommended</span>
                  <span>✓</span>
                </div>
              )}
              <div className="aspect-[16/10] w-full overflow-hidden bg-gray-50">
                <ServiceSketchImage
                  slug={s.slug}
                  subCategorySlug={s.subCategory?.slug ?? s.slug}
                  categorySlug={s.category.slug}
                  serviceName={s.name}
                  variant="card"
                  alt={s.name}
                />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-gray-900">{s.name}</h3>
                  {!isRecommended && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">
                      Trending
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-gray-500">
                  {s.description}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm font-black text-gray-900">
                    <span className="text-[11px] font-semibold uppercase text-gray-400">Starts at </span>
                    {formatPrice(s.pricePaise)}
                  </div>
                  <span className="rounded-lg bg-[var(--color-brand)] px-3 py-1.5 text-xs font-black text-white transition-colors group-hover:bg-blue-900">
                    Select
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-start justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-brand-dark)] to-[var(--color-brand)] p-6 text-white sm:flex-row sm:items-center">
        <div className="max-w-md">
          <h2 className="text-lg font-black">Save up to 30% with ExpertPass</h2>
          <p className="mt-1 text-sm text-white/80">
            Get discounted rates and priority booking for all your home cleaning and maintenance needs.
          </p>
          <button
            type="button"
            className="mt-4 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[var(--color-brand)] transition-transform hover:scale-105"
          >
            Explore membership
          </button>
        </div>
        <div className="w-full max-w-[220px] rounded-2xl bg-white/10 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <strong className="text-sm">ExpertPass</strong>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-brand-accent)] text-[10px]">
              ✓
            </span>
          </div>
          <div className="my-4 h-px bg-white/20" />
          <div className="text-[11px] text-white/70">Membership ID: EE-0921-2024</div>
        </div>
      </div>
    </div>
  );
}
