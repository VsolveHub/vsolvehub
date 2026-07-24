import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { getServiceBullets, getServiceImage } from "./serviceMeta";

type ServiceCardData = {
  id: string;
  name: string;
  slug: string;
  description: string;
  pricePaise: number;
};

type Props = {
  services: ServiceCardData[];
  categorySlug: string;
  onBook: (service: ServiceCardData) => void;
};

export function BestValueSection({ services, categorySlug, onBook }: Props) {
  if (services.length === 0) return null;

  return (
    <section>
      <div className="flex items-end justify-between border-b border-gray-100 pb-3 mb-5">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Best Value Packages</h2>
          <p className="text-xs text-gray-500 mt-0.5">Our most requested bundles for a complete home makeover.</p>
        </div>
        <Link href="#" className="text-xs sm:text-sm font-bold text-orange-600 hover:text-orange-700 transition-colors">
          View all
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {services.map((service) => {
          const bullets = getServiceBullets(service.slug, service.description);
          const serviceImg = getServiceImage(service.slug, categorySlug);
          const rating = (4.5 + (service.id.charCodeAt(service.id.length - 1) % 5) * 0.1).toFixed(1);

          return (
            <div
              key={service.id}
              className="group bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-md hover:shadow-lg transition-all duration-300 flex flex-col h-full"
            >
              {/* Card Image */}
              <div className="relative aspect-[16/7] w-full overflow-hidden bg-slate-50">
                <Image
                  src={serviceImg}
                  alt={service.name}
                  fill
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Floating Badges */}
                <div className="absolute top-4 left-4">
                  <span className="bg-orange-500 text-white text-[10px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-md shadow-sm">
                    Best Seller
                  </span>
                </div>
                <div className="absolute top-4 right-4">
                  <span className="bg-white/95 backdrop-blur-sm text-gray-800 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm flex items-center space-x-1 border border-gray-100/50">
                    <span className="text-amber-500">★</span>
                    <span>{rating}</span>
                  </span>
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 sm:p-5 flex flex-col flex-grow justify-between">
                <div className="space-y-4">
                  <h3 className="text-base font-extrabold text-gray-900 leading-snug group-hover:text-orange-600 transition-colors">
                    <Link href={`/services/${categorySlug}/${service.slug}`}>
                      {service.name}
                    </Link>
                  </h3>

                  {/* Bullet points — show max 2 to keep card compact */}
                  <ul className="space-y-1.5 text-xs text-gray-500">
                    {bullets.slice(0, 2).map((bullet, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pricing and Action */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-50 mt-4">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-gray-400 tracking-wider uppercase">Starting At</span>
                    <span className="text-lg font-extrabold text-gray-900">{formatPrice(service.pricePaise)}</span>
                  </div>

                  <button
                    onClick={() => onBook(service)}
                    className="px-6 py-2.5 rounded-2xl font-extrabold text-sm shadow-sm transition-all duration-200 cursor-pointer bg-[#8b3d1b] hover:bg-[#6b2f15] text-white shadow-orange-100"
                  >
                    Book now
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
