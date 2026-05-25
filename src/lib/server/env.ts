import { env } from "$env/dynamic/private";

// Runtime environment access. Using $env/dynamic/private (not $env/static/private)
// means secrets are read from the platform env at request time, set in the
// Cloudflare Pages dashboard and rotated without a rebuild, rather than inlined
// at build. In dev these still come from .env. Read inside request handlers or
// lazily, never at module load: on Cloudflare the platform env is request-scoped.

export { env };

// Reads a required variable, throwing a clear error if it is missing or empty.
// Use for values the app cannot run without (DATABASE_URL, the WORKOS_* set);
// for optional ones (GITHUB_TOKEN, CLOUDFLARE_*) read `env.X` directly and
// handle undefined.
export function requireEnv(name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
