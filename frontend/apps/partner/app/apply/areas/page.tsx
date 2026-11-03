import { redirect } from "next/navigation";

/** Service areas are chosen on the work step, with the trades they are validated against. */
export default function AreasPage() {
  redirect("/apply/work");
}
