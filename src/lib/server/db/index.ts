import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { AsyncLocalStorage } from "node:async_hooks";
import { requireEnv } from "$lib/server/env";
import * as schema from "./schema";

// Required for Node runtimes < 22; harmless on newer runtimes and at the edge.
neonConfig.webSocketConstructor = ws;

type Db = NeonDatabase<typeof schema>;

// On Cloudflare a Neon WebSocket connection is request-scoped: an I/O object
// created in one request can't be used by another ("Cannot perform I/O on behalf
// of a different request"). So each request gets its own pool + drizzle handle,
// held in async-local storage; hooks.server.ts opens one per request and closes
// it once the response is sent. The exported `db` proxies to the current
// request's handle, so call sites (and the WebSocket-only interactive
// transactions) stay unchanged.
const store = new AsyncLocalStorage<Db>();

/** Opens a fresh pool + drizzle handle for one request. Caller must close(). */
export function createRequestDb(): { db: Db; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}

/** Runs `fn` with the ambient `db` bound to this request's handle. */
export function runWithDb<T>(handle: Db, fn: () => T): T {
  return store.run(handle, fn);
}

export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const current = store.getStore();
    if (current === undefined) {
      throw new Error("db accessed outside of a request context");
    }
    const value = Reflect.get(current, prop, current) as unknown;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- forwards arbitrary drizzle members from the per-request handle
    return typeof value === "function" ? value.bind(current) : value;
  },
});
