import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cache } from "react";

type RuntimeEnv = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
};

/**
 * Create a Prisma client for the current request. On Cloudflare, use the
 * Hyperdrive binding. In local Node.js development, fall back to DATABASE_URL.
 */
export const getPrisma = cache((): PrismaClient => {
  let connectionString: string | undefined;

  try {
    const { env } = getCloudflareContext();
    const runtimeEnv = env as unknown as RuntimeEnv;
    connectionString = runtimeEnv.HYPERDRIVE?.connectionString ?? runtimeEnv.DATABASE_URL;
  } catch {
    // Normal `next dev` runs outside the Workers runtime.
  }

  connectionString ||= process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Database belum dikonfigurasi. Atur binding HYPERDRIVE di Cloudflare atau DATABASE_URL untuk local development.",
    );
  }

  const adapter = new PrismaPg({ connectionString, maxUses: 1 });
  return new PrismaClient({ adapter });
});

// Keep the existing `prisma.model.*` call sites intact while resolving the
// request-scoped Prisma client lazily inside the active Workers request.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrisma();
    const value = Reflect.get(client, property, client) as unknown;
    return typeof value === "function" ? value.bind(client) : value;
  },
});
