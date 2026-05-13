import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { DATABASE_URL } from "$env/static/private";
import * as schema from "./schema";

// Required for Node runtimes < 22; harmless on newer runtimes and at the edge.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: DATABASE_URL });

export const db = drizzle(pool, { schema });
