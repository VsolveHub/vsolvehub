/**
 * Test stub for the `server-only` package.
 *
 * The real module throws on import so that server code pulled into a client
 * bundle fails the build. Under Vitest there is no such bundle, and the throw
 * would just make server modules untestable — so it is aliased to this no-op in
 * `vitest.config.ts`.
 */
export {};
