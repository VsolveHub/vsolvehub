import Link from "next/link";

const NEW_SERVICES = [
  {
    id: "plumbing",
    title: "Plumbing repairs",
    image: "/plumbing_hd.jpg",
    href: "/services/home-services",
  },
  {
    id: "painting",
    title: "Home Painting",
    image: "/painting_hd.jpg",
    href: "/services/home-services",
  },
  {
    id: "salon",
    title: "Salon at home",
    image: "/beauty_hd.jpg",
    href: "/services/beauty-wellness",
  },
  {
    id: "appliance",
    title: "Appliance Repair",
    subtitle: "Available in 60 mins",
    image: "/appliance_hd.jpg",
    href: "/services/home-services",
  },
  {
    id: "cleaning",
    title: "Deep Cleaning",
    image: "/cleaner_illustration.jpg",
    href: "/services/home-services",
  },
];

export function NewAndNoteworthy() {
  return (
    <section className="nan-section">
      <div className="section-header-row">
        <h2 className="home-section-title">New and noteworthy</h2>
      </div>
      <div className="nan-scroll">
        {NEW_SERVICES.map((item) => (
          <Link key={item.id} href={item.href} className="nan-card">
            <div className="nan-image">
              <img src={item.image} alt={item.title} />
            </div>
            <h3 className="nan-title">{item.title}</h3>
            {item.subtitle && <p className="nan-subtitle">{item.subtitle}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}
