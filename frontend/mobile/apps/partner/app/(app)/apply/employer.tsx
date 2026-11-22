import { Redirect } from "expo-router";

/** The old single "Business details" step: an employer now starts by saying who is hiring. */
export default function EmployerPage() {
  return <Redirect href="/apply/hiring-as" />;
}
