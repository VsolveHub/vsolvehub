import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";
import { getAllPosts, getPost, formatBlogDate, readingMinutes } from "@/lib/blog";
import { Markdown } from "@/components/markdown";
import { Faq, faqJsonLd } from "@/components/faq";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const siteUrl = SITE_URL;

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Post not found" };

  const url = `${siteUrl}/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    keywords: post.tags,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      url,
      siteName: "V Solve Hub",
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      authors: [post.author],
      tags: post.tags,
      images: [{ url: `${siteUrl}/logo.jpeg` }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
      images: [`${siteUrl}/logo.jpeg`],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const url = `${siteUrl}/blog/${post.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Organization", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "V Solve Hub",
      logo: { "@type": "ImageObject", url: `${siteUrl}/logo-mark.png` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: post.tags.join(", "),
    image: `${siteUrl}/logo.jpeg`,
  };

  return (
    <main className="px-5 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {post.faqs?.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(post.faqs)) }}
        />
      ) : null}
      <article className="mx-auto max-w-2xl">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" /> All posts
        </Link>

        <div className="mt-6 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
            >
              {t}
            </span>
          ))}
        </div>

        <h1 className="mt-3 text-3xl font-bold leading-tight text-ink-900 sm:text-4xl">
          {post.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            <time dateTime={post.date}>{formatBlogDate(post.date)}</time>
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {readingMinutes(post.body)} min read
          </span>
          <span>By {post.author}</span>
        </div>

        <p className="mt-6 border-l-4 border-brand-200 pl-4 text-lg leading-relaxed text-gray-600">
          {post.description}
        </p>

        <div className="mt-8">
          <Markdown>{post.body}</Markdown>
        </div>

        {post.faqs?.length ? (
          <section className="mt-12">
            <h2 className="text-xl font-bold text-ink-900">Frequently asked questions</h2>
            <div className="mt-4">
              <Faq items={post.faqs} />
            </div>
          </section>
        ) : null}

        <div className="mt-12 rounded-[var(--radius-card)] border border-border bg-surface-muted/60 p-6 text-center">
          <p className="text-lg font-semibold text-ink-900">Ready to start earning?</p>
          <p className="mt-1 text-sm text-gray-500">
            Join thousands of verified partners across Telangana.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Become a Partner
          </Link>
        </div>
      </article>
    </main>
  );
}
