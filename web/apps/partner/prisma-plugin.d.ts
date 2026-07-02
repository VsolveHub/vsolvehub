// The plugin ships without type declarations; declare the minimal surface we use.
declare module "@prisma/nextjs-monorepo-workaround-plugin" {
  export class PrismaPlugin {
    apply(compiler: unknown): void;
  }
}
