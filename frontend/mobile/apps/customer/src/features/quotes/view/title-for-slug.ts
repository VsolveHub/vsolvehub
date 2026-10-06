// Ported from frontend/apps/customer/features/requirement/view/my-requests-screen.tsx
export function titleForSlug(categorySlug: string): string {
  const words = categorySlug.replace(/-/g, " ").trim();
  if (words.length === 0) return "Your request";
  return words.charAt(0).toUpperCase() + words.slice(1);
}
