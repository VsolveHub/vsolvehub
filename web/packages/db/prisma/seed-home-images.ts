import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding home page image URLs and dynamic content...");

  // 1. Update Service Categories with Images
  const categoryImages: Record<string, string> = {
    "cleaning": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=800&auto=format&fit=crop",
    "beauty-wellness": "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=800&auto=format&fit=crop",
    "ac-repair": "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=800&auto=format&fit=crop",
    "electrician": "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=800&auto=format&fit=crop",
    "plumbing": "https://images.unsplash.com/photo-1607472586893-edb57cb31322?q=80&w=800&auto=format&fit=crop",
  };

  for (const [slug, imageUrl] of Object.entries(categoryImages)) {
    await prisma.serviceCategory.updateMany({
      where: { slug },
      data: { imageUrl },
    });
  }

  // 2. Update Specific Services with Images
  const serviceImages: Record<string, string> = {
    "home-cleaning": "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=600&auto=format&fit=crop",
    "deep-cleaning": "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?q=80&w=600&auto=format&fit=crop",
    "plumber": "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?q=80&w=600&auto=format&fit=crop",
    "electrician": "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=600&auto=format&fit=crop",
    "ac-technician": "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=600&auto=format&fit=crop",
    "salon-at-home": "https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=600&auto=format&fit=crop",
    "facial-and-cleanup": "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=600&auto=format&fit=crop",
  };

  for (const [slug, imageUrl] of Object.entries(serviceImages)) {
    await prisma.service.updateMany({
      where: { slug },
      data: { imageUrl },
    });
  }

  // 3. Clear existing stories and promos to prevent duplicates
  await prisma.appStory.deleteMany();
  await prisma.appPromo.deleteMany();

  // 4. Seed AppPromos
  await prisma.appPromo.createMany({
    data: [
      // Spotlight (2x2 Grid)
      {
        title: "Home Services On Demand",
        subtitle: "Professional and reliable experts arriving at your doorstep in 60 mins.",
        imageUrl: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=800&auto=format&fit=crop",
        href: "/services",
        badge: "Most Popular",
        badgeColor: "blue",
        type: "spotlight",
        sortOrder: 1,
      },
      {
        title: "Beauty & Wellness At Home",
        subtitle: "Massages, facials, haircuts, and spa treatments. Top rated artists.",
        imageUrl: "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?q=80&w=800&auto=format&fit=crop",
        href: "/services/beauty-wellness",
        badge: "Trending",
        badgeColor: "pink",
        type: "spotlight",
        sortOrder: 2,
      },
      {
        title: "Smart Home Setup",
        subtitle: "Smart home installation, networking, TVs, audio setups and more.",
        imageUrl: "https://images.unsplash.com/photo-1558002038-1055907df827?q=80&w=800&auto=format&fit=crop",
        href: "/services/electrician",
        badge: null,
        type: "spotlight",
        sortOrder: 3,
      },
      {
        title: "Pet Grooming & More",
        subtitle: "Grooming, salon, vaccines, boarding, and daycare at home.",
        imageUrl: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?q=80&w=800&auto=format&fit=crop",
        href: "/services/pet-grooming",
        badge: null,
        type: "spotlight",
        sortOrder: 4,
      },
      // Cleaning Essentials (Banner)
      {
        title: "Cleaning Essentials",
        subtitle: "Comprehensive home cleaning, sofa washing, and bathroom cleaning.",
        imageUrl: "https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?q=80&w=1200&auto=format&fit=crop",
        href: "/services/cleaning",
        badge: null,
        type: "banner",
        sortOrder: 5,
      },
      {
        title: "Appliance Repair",
        subtitle: "Fast service for your washing machines, fridges, and microwaves.",
        imageUrl: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=1200&auto=format&fit=crop",
        href: "/services/ac-repair",
        badge: null,
        type: "banner",
        sortOrder: 6,
      },
    ],
  });

  // 5. Seed AppStories
  const STORY_DATA = [
    {
      title: "Salon Glow",
      icon: "beauty",
      iconBg: "linear-gradient(135deg, #ec4899, #db2777)",
      borderGlow: "from-pink-500 to-rose-600",
      ctaText: "Book Salon At Home",
      ctaHref: "/services/beauty-wellness",
      sortOrder: 1,
      slidesJson: JSON.stringify([
        {
          title: "Salon At Your Doorstep",
          desc: "Skip the waiting room. Top-rated artists and stylists arrive in 60 mins.",
          imageBg: "linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)",
        },
        {
          title: "Wedding & Party Packages",
          desc: "Stunning makeovers, facials, and hair design. 100% hygienic.",
          imageBg: "linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)",
        },
      ]),
    },
    {
      title: "AC Jet Care",
      icon: "ac-unit",
      iconBg: "linear-gradient(135deg, #0ea5e9, #2563eb)",
      borderGlow: "from-sky-400 to-blue-600",
      ctaText: "Book AC Clean",
      ctaHref: "/services/ac-repair",
      sortOrder: 2,
      slidesJson: JSON.stringify([
        {
          title: "Jet-Pump AC Cleaning",
          desc: "Enhance cooling efficiency by 40% and lower electricity bills.",
          imageBg: "linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)",
        },
      ]),
    },
    {
      title: "Luxury Stays",
      icon: "house",
      iconBg: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
      borderGlow: "from-purple-500 to-indigo-600",
      ctaText: "Explore PGs & Stays",
      ctaHref: "/accommodation",
      sortOrder: 3,
      slidesJson: JSON.stringify([
        {
          title: "Premium PGs & Rooms",
          desc: "Cozy rooms with zero broker fees. Wi-Fi, food, AC.",
          imageBg: "linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)",
        },
      ]),
    },
    {
      title: "Rewards",
      icon: "diamond",
      iconBg: "linear-gradient(135deg, #eab308, #ca8a04)",
      borderGlow: "from-yellow-400 to-amber-600",
      ctaText: "View Rewards",
      ctaHref: "/profile/rating",
      sortOrder: 4,
      slidesJson: JSON.stringify([
        {
          title: "V Coins & Free Stays",
          desc: "Earn V Coins on every booking. Use them to redeem free services.",
          imageBg: "linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)",
        },
      ]),
    },
  ];

  for (const story of STORY_DATA) {
    await prisma.appStory.create({
      data: story,
    });
  }

  console.log("Successfully seeded dynamic UI components and images!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
