import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { requireEnv } from "$lib/server/env";
import * as schema from "./schema";

// Required for Node runtimes < 22; harmless on newer runtimes and at the edge.
neonConfig.webSocketConstructor = ws;

// Lazily created so DATABASE_URL is read at request time (runtime env), not at
// module load: on Cloudflare the platform env is only available during a
// request. The handle is built once per isolate on first use and reused.
function createDb(): NeonDatabase<typeof schema> {
  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
  return drizzle(pool, { schema });
}

let instance: ReturnType<typeof createDb> | null = null;
function resolveDb(): ReturnType<typeof createDb> {
  return (instance ??= createDb());
}

// A Proxy keeps `db` importable as a value (no call-site changes) while
// deferring the actual connection until the first member access, which always
// happens inside a request.
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop) {
    const target = resolveDb();
    const value = Reflect.get(target, prop, target) as unknown;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- forwards arbitrary drizzle members from the lazily-created handle
    return typeof value === "function" ? value.bind(target) : value;
  },
});
