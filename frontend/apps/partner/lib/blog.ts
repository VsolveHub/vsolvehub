// File-based blog content. Each post is authored in Markdown and rendered
// server-side (SSG) for SEO. Add a new entry to POSTS to publish a post.

export interface BlogPost {
  slug: string;
  title: string;
  /** Meta description — keep ~150–160 chars, unique per post. */
  description: string;
  /** ISO date (YYYY-MM-DD) first published. */
  date: string;
  /** ISO date last updated; defaults to `date`. */
  updated?: string;
  author: string;
  tags: string[];
  body: string; // Markdown
  /** Post-specific FAQs — rendered on the page and emitted as FAQPage JSON-LD. */
  faqs?: { q: string; a: string }[];
}

export const BLOG_AUTHOR = "V Solve Hub Team";

const POSTS: BlogPost[] = [
  {
    slug: "earn-more-as-a-home-services-partner",
    title: "How to Earn More as a Home Services Partner in India",
    description:
      "Practical, proven ways to increase your daily earnings as an electrician, plumber, cleaner or driver on V Solve Hub — from staying online at the right times to building repeat customers.",
    date: "2026-06-10",
    author: BLOG_AUTHOR,
    tags: ["Earnings", "Tips", "Partners"],
    body: `Every skilled professional wants the same thing: **more jobs, better pay, and less time wasted**. On V Solve Hub, your earnings are directly in your control. Here are the habits that separate top earners from the rest.

## 1. Be online during peak demand

Most home-service bookings land in two windows — **9am–12pm** and **6pm–9pm**. Staying online during these hours dramatically increases the number of jobs offered to you. A partner who is online for the right 4 hours often earns more than one online for a scattered 8.

## 2. Keep your acceptance rate high

The dispatch engine favours reliable partners. Every time you accept and complete a job on time, you become more likely to be offered the next one nearby. Declining frequently pushes offers to other partners in your area.

## 3. Widen your skills

Partners who list more verified services get matched to more jobs. If you're an electrician who can also mount TVs or install fans, add those skills in your profile — each one opens a new stream of bookings.

## 4. Turn one job into ten

The cheapest customer to win is the one you already served. Show up on time, keep the workspace clean, and finish with a quick "call me directly next time through the app." Repeat customers and referrals are the real compounding of this work.

## 5. Get paid faster

Add your bank or UPI details in the app so daily payouts settle without delay. Money in your account the same day means you can take on more work without cash-flow stress.

> The partners earning the most aren't working the longest hours — they're working the *right* hours, accepting reliably, and turning first-time customers into regulars.

Ready to grow? Open the V Solve Hub partner app, top up your skills, and go online during the next peak window.`,
    faqs: [
      {
        q: "When are the best hours to be online?",
        a: "Demand peaks between 9am–12pm and 6pm–9pm. Staying online during those windows gets you the most job offers.",
      },
      {
        q: "Does accepting more jobs get me more offers?",
        a: "Yes. The dispatch engine favours reliable partners, so a high acceptance and on-time completion rate makes you more likely to be offered the next nearby job.",
      },
      {
        q: "How do I build repeat customers?",
        a: "Arrive on time, keep the workspace clean, do quality work, and invite customers to book you again through the app. Referrals and repeat bookings are the most reliable way to grow your income.",
      },
    ],
  },
  {
    slug: "kyc-verification-guide",
    title: "Your KYC & Verification Guide: Get Approved Faster",
    description:
      "A step-by-step guide to passing V Solve Hub partner verification the first time — which documents to upload, how to photograph them, and the common mistakes that slow approvals.",
    date: "2026-06-18",
    author: BLOG_AUTHOR,
    tags: ["Onboarding", "KYC", "Guide"],
    body: `Verification protects both you and your customers — it's what lets people trust a professional arriving at their home. Most applications are reviewed within 24 hours. Here's how to get approved on the first try.

## What you'll need

- A clear **profile photo** of your face
- Your **Aadhaar** (optional, but it speeds up trust and matching)
- A **trade certificate** or proof of skill, if you have one
- For drivers: **driving licence** and **vehicle registration (RC)**

## How to photograph documents

Blurry or cropped photos are the number-one reason a document gets sent back. Before you upload:

1. Lay the document flat on a plain surface.
2. Use good, even light — daylight near a window is perfect.
3. Make sure **all four corners** are inside the frame.
4. Check that the text is sharp and readable before submitting.

## After you submit

Your status moves to **Pending** while our team reviews it. You'll be notified the moment a decision is made. If something needs fixing, the app shows exactly which document and why — just re-upload it and the review runs again automatically.

## Common mistakes to avoid

| Mistake | Fix |
| --- | --- |
| Glare hiding the details | Tilt away from direct light |
| Only half the document visible | Include all four corners |
| Screenshot of a screenshot | Photograph the original |
| Wrong document type | Match the upload label |

Take two minutes to get your photos right and you'll usually be **active within a day** — ready to receive your first jobs.`,
    faqs: [
      {
        q: "How long does verification take?",
        a: "Most applications are reviewed within 24 hours. You'll be notified in the app as soon as a decision is made.",
      },
      {
        q: "Is Aadhaar mandatory to sign up?",
        a: "No — Aadhaar is optional and you can add it later. Providing it does help build trust and can speed up job matching.",
      },
      {
        q: "What happens if a document is rejected?",
        a: "The app shows exactly which document was flagged and why. Just re-upload a clearer copy and the review runs again automatically.",
      },
    ],
  },
  {
    slug: "get-five-star-ratings",
    title: "5 Ways to Get 5-Star Ratings and More Repeat Customers",
    description:
      "Your rating decides how many jobs you're offered. Here are five simple, repeatable habits that keep customers happy and your rating high on V Solve Hub.",
    date: "2026-06-28",
    author: BLOG_AUTHOR,
    tags: ["Ratings", "Tips", "Customers"],
    body: `On a marketplace, your **rating is your reputation** — and it directly affects how many jobs you're offered. The good news: five-star service is mostly about small, consistent habits, not talent.

## 1. Communicate before you arrive

A quick "On my way, reaching in 15 minutes" message removes the customer's biggest worry — *will they actually show up?* Predictability feels like professionalism.

## 2. Respect the home

Carry a mat or cloth, remove your shoes when asked, and clean up any mess before you leave. Customers rarely remember the exact repair — they remember whether their home was left tidy.

## 3. Explain what you're doing

A short, plain-language explanation of the problem and the fix builds trust and reduces disputes. People happily pay more when they understand the value.

## 4. Finish what you started

Test your work in front of the customer. Flip the switch, run the tap, start the AC. A job that visibly works is a job that earns five stars.

## 5. End on a warm note

A genuine "Thank you, call me anytime through the app" turns a one-time job into a regular customer — and regulars are the foundation of a steady income.

> Ratings compound. A month of consistent five-star jobs quietly becomes a stream of better offers and repeat bookings.

Keep these five habits on every job and your rating will take care of itself.`,
    faqs: [
      {
        q: "Why does my rating matter?",
        a: "Your rating is your reputation on the marketplace and directly affects how many jobs you're offered. Higher-rated partners get more and better bookings.",
      },
      {
        q: "How can I improve a low rating?",
        a: "Focus on communication, punctuality, tidiness, and finishing work you can demonstrate. Consistent five-star jobs raise your average over time.",
      },
      {
        q: "Do repeat customers help my rating?",
        a: "Every completed job can be rated, so building regulars who consistently rate you well is one of the best ways to keep your rating high.",
      },
    ],
  },
];

/** Approximate reading time in minutes (~200 wpm), min 1. */
export function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function getAllPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function formatBlogDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
