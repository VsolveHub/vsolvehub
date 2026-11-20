import { redirect } from "next/navigation";

/**
 * The old single "Business details" step. What an employer is asked now depends on who is hiring,
 * so a saved link to it goes to that choice.
 */
export default function EmployerPage(): never {
  redirect("/apply/hiring-as");
}
