import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stories = await prisma.appStory.findMany({ orderBy: { sortOrder: 'asc' } });
  
  const imageUrls = [
    "url('https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=400&auto=format&fit=crop')", // Salon
    "url('https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?q=80&w=400&auto=format&fit=crop')", // AC
    "url('https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?q=80&w=400&auto=format&fit=crop')", // Room
    "url('https://images.unsplash.com/photo-1549465220-1a8b9238cd48?q=80&w=400&auto=format&fit=crop')"  // Gift
  ];

  for (let i = 0; i < stories.length; i++) {
    await prisma.appStory.update({
      where: { id: stories[i].id },
      data: { iconBg: imageUrls[i % imageUrls.length] }
    });
  }

  const promos = await prisma.appPromo.findMany({ orderBy: { sortOrder: 'asc' } });
  const promoImages = [
    "https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1570129477492-45c003edd2be?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1558236573-03058863f8d9?q=80&w=600&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1583337130417-3346a1be7dee?q=80&w=600&auto=format&fit=crop"
  ];

  for (let i = 0; i < promos.length; i++) {
    if (promos[i].type === 'spotlight') {
       await prisma.appPromo.update({
         where: { id: promos[i].id },
         data: { imageUrl: promoImages[i % promoImages.length] }
       });
    }
  }

  console.log('Successfully updated AppStory iconBg and AppPromo imageUrl with images');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
