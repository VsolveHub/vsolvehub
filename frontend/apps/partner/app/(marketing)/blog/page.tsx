import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock } from "lucide-react";
import { getAllPosts, formatBlogDate, readingMinutes } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const siteUrl = SITE_URL;

export const metadata: Metadata = {
  title: "Blog — Tips & Guides for Service Partners",
  description:
    "Earning tips, verification guides, and advice for electricians, plumbers, cleaners, and drivers partnering with V Solve Hub across India.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "V Solve Hub Blog — Tips & Guides for Service Partners",
    description:
      "Earning tips, verification guides, and advice for service partners across India.",
    type: "website",
    url: `${siteUrl}/blog`,
  },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "V Solve Hub Blog",
    url: `${siteUrl}/blog`,
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.description,
      datePublished: p.date,
      dateModified: p.updated ?? p.date,
      url: `${siteUrl}/blog/${p.slug}`,
      author: { "@type": "Organization", name: p.author },
    })),
  };

  return (
    <main className="px-5 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-ink-900 sm:text-4xl">V Solve Hub Blog</h1>
        <p className="mt-3 text-lg text-gray-500">
          Tips, guides, and stories to help you earn more and grow as a service partner.
        </p>

        <div className="mt-10 space-y-5">
          {posts.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="block">
              <article className="rounded-[var(--radius-card)] border border-border bg-white p-6 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <h2 className="mt-3 text-xl font-bold text-ink-900">{p.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{p.description}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <time dateTime={p.date}>{formatBlogDate(p.date)}</time>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {readingMinutes(p.body)} min read
                  </span>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
