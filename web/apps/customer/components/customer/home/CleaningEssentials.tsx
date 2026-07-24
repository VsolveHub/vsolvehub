import Link from "next/link";
import Image from "next/image";

export function CleaningEssentials({ promos }: { promos: any[] }) {
  return (
    <div className={`grid gap-5 grid-cols-1 md:grid-cols-2 ${promos.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {promos.map((card) => (
          <Link key={card.id} href={card.href} className="block relative w-full h-[240px] shrink-0 rounded-[28px] overflow-hidden shadow-md group">
            <div className="w-full h-full relative transition-transform duration-300 group-hover:scale-[1.02]">
              <Image
                src={card.imageUrl}
                alt={card.title}
                fill
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A1629]/90 via-[#0A1629]/40 to-transparent" />
              <div className="absolute bottom-0 left-0 w-full p-5 text-white flex flex-col justify-end">
                <h3 className="text-xl font-black leading-tight tracking-tight">{card.title}</h3>
                {card.subtitle && <p className="text-xs text-white/80 font-medium mt-1">{card.subtitle}</p>}
              </div>
            </div>
          </Link>
        ))}
    </div>
  );
}
