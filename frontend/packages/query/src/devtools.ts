export function shouldRenderQueryDevtools(environment: string | undefined, requested: boolean) {
  return environment === "development" && requested;
}
