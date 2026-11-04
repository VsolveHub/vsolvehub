import { Redirect } from "expo-router";

/** The application and its documents live on one page, as on the web. */
export default function Screen() {
  return <Redirect href={"/me/documents" as never} />;
}
