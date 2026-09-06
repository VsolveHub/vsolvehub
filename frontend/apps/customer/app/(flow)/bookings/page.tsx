import { redirect } from "next/navigation";

interface BookingsPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
}

export default async function BookingsPage({ searchParams }: BookingsPageProps): Promise<never> {
  const resolvedParams = searchParams ? await Promise.resolve(searchParams) : {};
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedParams)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) {
        params.append(key, v);
      }
    }
  }

  const queryString = params.toString();
  redirect(queryString ? `/activity?${queryString}` : "/activity");
}
