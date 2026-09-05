import { permanentRedirect } from "next/navigation";

/**
 * `/catalog` *is* the flat icon catalogue now, so this address has nothing of
 * its own left to say. It stays routable because it was shared and bookmarked
 * while it was the only flat listing; a permanent redirect moves those links —
 * and the search engines that indexed them — to the one canonical page instead
 * of maintaining two copies of the same screen.
 */
export default function AllServicesPage() {
  permanentRedirect("/catalog");
}
