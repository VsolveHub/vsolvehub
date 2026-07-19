import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/client";
import { serializeService, serviceInclude } from "@/lib/catalog/queries";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { CategorySlugPageClient } from "./CategorySlugPageClient";
import { FlaticonIcon } from "@/components/ui/FlaticonIcon";

type PageProps = {
  params: Promise<{ category: string }>;
};



const HERO_DETAILS: Record<string, {
  title: string;
  description: string;
  badges: { label: string; icon: string }[];
  image: string;
}> = {
  "home-services": {
    title: "Expert Cleaning, Effortless Living.",
    description: "Experience the gold standard in professional cleaning. Eco-friendly solutions, verified pros, and guaranteed satisfaction.",
    badges: [
      { label: "Verified Pros", icon: "shield-check" },
      { label: "Eco-Safe Chemicals", icon: "leaf" }
    ],
    image: "/basic_home_cleaning_hd.jpg"
  },
  "technician": {
    title: "Expert Repairs, At Your Doorstep.",
    description: "Connect with certified electricians, plumbers, and appliance technicians. Quick response and upfront pricing guaranteed.",
    badges: [
      { label: "Verified Pros", icon: "shield-check" },
      { label: "30-Day Warranty", icon: "shield-check" }
    ],
    image: "/ac_technician_hd.jpg"
  },
  "beauty-wellness": {
    title: "Salon & Spa, at Your Home.",
    description: "Indulge in professional beauty, grooming, and wellness services. Premium products, certified experts, and complete hygiene.",
    badges: [
      { label: "Certified Experts", icon: "badge" },
      { label: "100% Hygienic", icon: "shield-check" }
    ],
    image: "/beauty_hd.jpg"
  },
  "pet-services": {
    title: "Professional Care, Happy Pets.",
    description: "Top-rated grooming, training, and veterinary checkups at home. Loving care for your furry family members.",
    badges: [
      { label: "Certified Vets", icon: "heart" },
      { label: "Safe Handling", icon: "shield-check" }
    ],
    image: "/pet_hd.jpg"
  }
};

function getCategoryHeroImage(slug: string): string {
  switch (slug) {
    case "technician":
      return "/ac_technician_hd.jpg";
    case "home-services":
      return "/basic_home_cleaning_hd.jpg";
    case "beauty-wellness":
      return "/beauty_hd.jpg";
    case "pet-services":
      return "/pet_hd.jpg";
    case "accommodation-services":
      return "/luxury_stay_hd.jpg";
    case "construction-services":
      return "/painting_hd.jpg";
    default:
      return "/basic_home_cleaning_hd.jpg";
  }
}

function getHeroDetails(slug: string, name: string, tagline: string | null) {
  return HERO_DETAILS[slug] ?? {
    title: `Premium ${name} Services.`,
    description: tagline ?? `Expertly managed solutions for your everyday needs. Safe, verified, and reliable professional services.`,
    badges: [
      { label: "Verified Pros", icon: "shield-check" },
      { label: "100% Satisfaction", icon: "heart" }
    ],
    image: getCategoryHeroImage(slug)
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category: categorySlug } = await params;

  // Fetch the category, its subcategories and services
  const category = await prisma.serviceCategory.findUnique({
    where: { slug: categorySlug },
    include: {
      subCategories: {
        orderBy: { sortOrder: "asc" },
        include: {
          services: {
            include: serviceInclude,
            orderBy: { name: "asc" },
          },
        },
      },
      services: {
        where: { subCategoryId: null },
        include: serviceInclude,
        orderBy: { name: "asc" },
      },
    },
  });

  if (!category) {
    notFound();
  }

  // Map database model to serialized props
  const serializedSubCategories = category.subCategories.map((sub) => ({
    id: sub.id,
    name: sub.name,
    slug: sub.slug,
    services: sub.services.map(serializeService),
  }));

  const serializedStandaloneServices = category.services.map(serializeService);
  const hero = getHeroDetails(category.slug, category.name, category.tagline);

  return (
    <div className="bg-white min-h-screen pb-16">
      {/* Breadcrumbs */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-[10px] sm:text-xs font-bold tracking-widest text-gray-400 uppercase flex items-center space-x-2">
          <Link href="/" className="hover:text-gray-800 transition-colors">Home</Link>
          <span className="text-gray-300 font-normal">›</span>
          <span className="text-amber-800/80">{category.name}</span>
        </div>
      </div>

      {/* Styled Hero Banner */}
      <header className="relative bg-gradient-to-r from-orange-50 via-orange-100/50 to-amber-50/30 overflow-hidden py-12 sm:py-16 lg:py-20 px-4 sm:px-6 lg:px-8">
        {/* Abstract background blobs for premium aesthetic */}
        <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-orange-200/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-8 lg:gap-12 items-center relative z-10">
          <div className="lg:col-span-7 text-left space-y-4 sm:space-y-6">
            <div className="inline-flex items-center space-x-2 text-xs font-bold tracking-widest text-orange-600 uppercase">
              <span>{category.name}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-orange-600" />
              <span>Verified Hub</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1] max-w-xl">
              {hero.title}
            </h1>
            
            <p className="text-sm sm:text-base text-gray-600 max-w-xl leading-relaxed">
              {hero.description}
            </p>

            {/* Badges */}
            <div className="flex flex-wrap gap-3 pt-2">
              {hero.badges.map((badge) => (
                <div 
                  key={badge.label} 
                  className="flex items-center space-x-2 bg-white/95 border border-orange-100/70 shadow-sm rounded-full px-4 py-2"
                >
                  <span className="text-orange-600 flex items-center justify-center">
                    <FlaticonIcon name={badge.icon} size={15} color="#ea580c" />
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-700">{badge.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right framed image */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-md aspect-[4/3] sm:aspect-[1.4] lg:aspect-[4/3]">
              {/* Peach decorative shadow background */}
              <div className="absolute inset-0 bg-orange-200/50 rounded-[32px] sm:rounded-[40px] translate-x-3 translate-y-3 sm:translate-x-4 sm:translate-y-4 rounded-tl-[64px] rounded-br-[64px] sm:rounded-tl-[80px] sm:rounded-br-[80px]" />
              
              {/* Image card with white frame */}
              <div className="absolute inset-0 bg-white p-3 sm:p-4 rounded-[32px] sm:rounded-[40px] rounded-tl-[64px] rounded-br-[64px] sm:rounded-tl-[80px] sm:rounded-br-[80px] shadow-md border border-orange-100/50 overflow-hidden">
                <div className="relative w-full h-full rounded-[20px] sm:rounded-[28px] rounded-tl-[48px] rounded-br-[48px] sm:rounded-tl-[64px] sm:rounded-br-[64px] overflow-hidden bg-gray-100">
                  <img
                    src={hero.image}
                    alt={category.name}
                    className="w-full h-full object-cover transition-transform duration-700 hover:scale-105"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <CategorySlugPageClient
        categorySlug={category.slug}
        categoryName={category.name}
        subCategories={serializedSubCategories}
        standaloneServices={serializedStandaloneServices}
      />
    </div>
  );
}
