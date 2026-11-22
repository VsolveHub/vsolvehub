/**
 * Hero slide data configuration for Customer Mobile (Expo).
 *
 * NOTE: Keep in sync with the web customer equivalent at:
 * `frontend/apps/customer/features/home/hero-slides.ts`
 */

import type { ImageSource } from "expo-image";

const diwaliHeroAsset = require("../../../assets/hero/diwali-home-care.webp");
const cleaningHeroAsset = require("../../../assets/hero/professional-home-cleaning.webp");
const acRepairHeroAsset = require("../../../assets/hero/ac-repair-service.webp");
const plumbingHeroAsset = require("../../../assets/hero/professional-plumbing.webp");

export interface HeroSlide {
  id: string;
  word: string;
  description: string;
  badge: string;
  mobilePill: string;
  mobileHeadline: string;
  thumbIcon: "gift" | "sparkles" | "snowflake" | "wrench";
  desktopImage?: ImageSource | string | number;
  mobileImage?: ImageSource | string | number;
  imagePosition?: string;
  alt: string;
  href: string;
  /**
   * ISO 8601 date string (e.g. "2026-10-15T00:00:00Z").
   * Slide will be hidden before this date. Leave undefined to activate immediately.
   */
  activeFrom?: string;
  /**
   * ISO 8601 date string (e.g. "2026-11-20T23:59:59Z").
   * Slide will be hidden after this date. Leave undefined for no expiration.
   */
  activeUntil?: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "festive-diwali",
    word: "Festively",
    description: "Festive offers on cleaning, AC service and plumbing. Get your home festival-ready.",
    badge: "Festive offers",
    mobilePill: "Festive offers",
    mobileHeadline: "Festive offers on home services",
    thumbIcon: "gift",
    desktopImage: diwaliHeroAsset,
    mobileImage: diwaliHeroAsset,
    imagePosition: "70% 50%",
    alt: "Festive home care professional arranging traditional brass diyas",
    href: "/catalog",
    // Set activeFrom / activeUntil ISO strings here to schedule or expire the Diwali campaign
    activeFrom: undefined,
    activeUntil: undefined,
  },
  {
    id: "home-cleaning",
    word: "Masterfully",
    description: "Spotless homes, deep-cleaned by trained and background-checked professionals.",
    badge: "ID-verified pros",
    mobilePill: "Premium quality",
    mobileHeadline: "Elite Home Cleaning, at Your Doorstep",
    thumbIcon: "sparkles",
    desktopImage: cleaningHeroAsset,
    mobileImage: cleaningHeroAsset,
    imagePosition: "70% 50%",
    alt: "Professional home cleaning specialist wiping a quartz kitchen countertop",
    href: "/catalog",
  },
  {
    id: "ac-repair",
    word: "Reliably",
    description: "AC service and repair at your door, backed by our service guarantee on every job.",
    badge: "Instant booking",
    mobilePill: "Instant booking",
    mobileHeadline: "Expert AC Repair, at Your Doorstep",
    thumbIcon: "snowflake",
    desktopImage: acRepairHeroAsset,
    mobileImage: acRepairHeroAsset,
    imagePosition: "70% 50%",
    alt: "Certified HVAC technician inspecting a modern split AC unit with diagnostic tools",
    href: "/catalog",
  },
  {
    id: "plumbing",
    word: "Affordably",
    description: "Plumbing fixes done right the first time, with clear pricing before work starts.",
    badge: "Service guarantee",
    mobilePill: "Service guarantee",
    mobileHeadline: "Trusted Plumbers, at Your Doorstep",
    thumbIcon: "wrench",
    desktopImage: plumbingHeroAsset,
    mobileImage: plumbingHeroAsset,
    imagePosition: "70% 50%",
    alt: "Professional plumber servicing a modern kitchen sink chrome fixture",
    href: "/catalog",
  },
];

/**
 * Filter slides based on current timestamp and active date window.
 * Ensures the counter, dots, and navigation reflect only currently active slides.
 */
export function getActiveHeroSlides(now: Date = new Date()): HeroSlide[] {
  return HERO_SLIDES.filter((slide) => {
    if (slide.activeFrom && new Date(slide.activeFrom) > now) {
      return false;
    }
    if (slide.activeUntil && new Date(slide.activeUntil) < now) {
      return false;
    }
    return true;
  });
}

