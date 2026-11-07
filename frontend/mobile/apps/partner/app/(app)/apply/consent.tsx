import { Redirect } from "expo-router";

/** The agreements are accepted on "Agree & send", as on the website. */
export default function ConsentPage() {
  return <Redirect href="/apply/review" />;
}
