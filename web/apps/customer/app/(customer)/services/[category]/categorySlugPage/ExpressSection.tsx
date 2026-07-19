import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";
import { getServiceCardMeta } from "@/lib/catalog/service-card-meta";

type ServiceCardData = {
  id: string;
  name: string;
  slug: string;
  pricePaise: number;
};

type Props = {
  services: ServiceCardData[];
  categorySlug: string;
  onBook: (service: ServiceCardData) => void;
};

export function ExpressSection({ services, categorySlug, onBook }: Props) {
  if (services.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between border-b border-gray-100 pb-3">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Express Solutions</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">Quick fixes for busy households. Done in under 2 hours.</p>
        </div>
        <Link href="#" className="text-xs sm:text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {services.map((service) => {
          const rating = (4.5 + (service.id.charCodeAt(service.id.length - 1) % 5) * 0.1).toFixed(1);
          const cardMeta = getServiceCardMeta(service.slug, categorySlug, service.name);

          return (
            <div
              key={service.id}
              className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md hover:border-gray-200 transition-all duration-200 min-h-[165px]"
            >
              <div>
                {/* Icon & Rating Row */}
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100/50">
                    <FlaticonIcon name={cardMeta.icon} size={18} color={cardMeta.color} />
                  </div>
                  <span className="bg-gray-50 text-gray-600 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 border border-gray-100">
                    <span className="text-amber-500">★</span>
                    <span>{rating}</span>
                  </span>
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-gray-900 mt-3.5 leading-snug">
                  <Link href={`/services/${categorySlug}/${service.slug}`} className="hover:text-orange-600 transition-colors line-clamp-2">
                    {service.name}
                  </Link>
                </h4>
              </div>

              {/* Price & Action Row */}
              <div className="flex items-center justify-between pt-3.5 mt-3 border-t border-gray-50">
                <span className="text-base font-extrabold text-gray-900">{formatPrice(service.pricePaise)}</span>

                <button
                  onClick={() => onBook(service)}
                  className="px-4 py-1.5 rounded-xl font-extrabold text-xs border transition-all duration-200 cursor-pointer bg-white border-gray-200 text-slate-800 hover:border-orange-500 hover:text-orange-600"
                >
                  Book
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
