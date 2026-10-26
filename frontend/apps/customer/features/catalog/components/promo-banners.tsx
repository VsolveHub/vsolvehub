import type { PromoBanner } from "../queries";

/**
 * Operations' promotional banners, laid out like a marketplace offer card: a large title,
 * one line of detail, the small print, and artwork on the right.
 *
 * Display-only. The copy comes from `/api/v1/promo-banners/`; nothing here touches price,
 * and checkout does not read banners. A banner without its own image uses the category's
 * 3D artwork from the catalogue, so every card has a picture without inventing one.
 *
 * Several banners scroll sideways with snap points — no script, so it works before
 * hydration — with a thin indicator per card.
 */
export function PromoBanners({
  banners,
  fallbackImageUrl,
}: {
  banners: PromoBanner[];
  fallbackImageUrl: string;
}) {
  if (banners.length === 0) return null;
  const several = banners.length > 1;

  return (
    <section aria-label="Offers" className="mt-8">
      <ul
        className={
          several
            ? "no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0"
            : "flex"
        }
      >
        {banners.map((banner) => {
          const imageUrl = banner.image_url?.trim() ? banner.image_url : fallbackImageUrl;
          return (
            <li
              key={banner.id}
              className={several ? "w-[88%] shrink-0 snap-start sm:w-[70%]" : "w-full"}
            >
              <article className="flex h-full items-center justify-between gap-4 overflow-hidden rounded-[1rem] bg-[#F5F5F5] p-6 sm:p-8">
                <div className="min-w-0">
                  <h2 className="text-[1.6rem] font-extrabold leading-tight tracking-tight text-[#0F0F0F] sm:text-[2rem]">
                    {banner.title}
                  </h2>
                  {banner.subtitle ? (
                    <p className="mt-2 text-[1rem] leading-snug text-[#0F0F0F] sm:text-[1.1rem]">
                      {banner.subtitle}
                    </p>
                  ) : null}
                  {banner.terms ? (
                    <p className="mt-5 text-[0.9rem] text-[#545454]">{banner.terms}</p>
                  ) : null}
                </div>
                {imageUrl !== "" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt=""
                    className="size-28 shrink-0 rounded-xl object-contain sm:size-40"
                  />
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>
      {several ? (
        <div aria-hidden className="mt-3 flex justify-center gap-1.5">
          {banners.map((banner) => (
            <span key={banner.id} className="h-1 w-6 rounded-full bg-line" />
          ))}
        </div>
      ) : null}
    </section>
  );
}
