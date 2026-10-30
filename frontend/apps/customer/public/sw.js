// V Solve Hub Service Worker
//
// Deliberately has no "fetch" handler. A worker without one is skipped by the
// browser for every request, which is the fastest a page can load.
//
// The previous worker answered every navigation, script, font and image itself.
// That cost more than it gave:
//   - every cached file was downloaded again in the background on each visit
//     ("stale-while-revalidate"), competing with the page on slow connections;
//   - catalogue images come from another origin, so the worker could never cache
//     them and only added a hop to all of them;
//   - the offline fallback looked for a cached "/" that was never stored.
// `/_next/static` files are already cached for a year by the browser itself
// (`immutable`), so nothing is lost.
//
// This version replaces the old one on every phone that already has it: the
// browser re-checks this file on each visit, and the new worker takes over
// immediately and deletes the old caches. Registration stays in
// `offline-banner.tsx` so that hand-over keeps happening.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
