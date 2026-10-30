"use client";

import { createElement } from "react";

import { useServiceDetail } from "@/features/catalog/client-queries";
import { iconForService } from "@/features/catalog/icon-catalogue/service-icon";

/** 64×64 service thumbnail for checkout summary rows. */
export function CheckoutServiceThumbnail({
  serviceSlug,
  iconKey,
}: {
  serviceSlug: string;
  iconKey?: string;
}) {
  const serviceQuery = useServiceDetail(serviceSlug);
  const service = serviceQuery.data;
  const imageUrl = service?.cover?.url || service?.variants?.[0]?.image_url || "";
  const resolvedIconKey = service?.icon_key ?? iconKey ?? serviceSlug;

  if (imageUrl !== "") {
    const isServiceCover =
      imageUrl.includes("/Service%20Cover/") || imageUrl.includes("/Service Cover/");

    return (
      <span className="relative block size-16 shrink-0 overflow-hidden rounded-xl bg-[#F4F1EC]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className={
            isServiceCover
              ? "size-full object-contain object-center p-2"
              : "size-full object-cover object-center"
          }
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#F4F1EC] text-navy-800"
    >
      {createElement(iconForService(resolvedIconKey), {
        className: "size-7",
        strokeWidth: 1.6,
      })}
    </span>
  );
}
