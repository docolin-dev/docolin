import { requireEnv } from "$lib/server/env";
import {
  CookieSessionStorage,
  configure,
  createAuthService,
  type AuthService,
  OAuthStateMismatchError,
  PKCECookieMissingError,
} from "@workos/authkit-session";

class SvelteKitCookieStorage extends CookieSessionStorage<Request, Response> {
  // eslint-disable-next-line @typescript-eslint/require-await -- interface requires Promise return; body is sync
  async getCookie(request: Request, name: string): Promise<string | null> {
    const header = request.headers.get("cookie");
    if (!header) return null;
    for (const pair of header.split(/;\s*/)) {
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      if (pair.slice(0, eq) === name) {
        return decodeURIComponent(pair.slice(eq + 1));
      }
    }
    return null;
  }
}

// Lazily configured so the WORKOS_* secrets are read at request time (runtime
// env), not at module load: on Cloudflare the platform env is only available
// during a request. configure() runs once per isolate on first use, before the
// service is created.
function createService(): AuthService<Request, Response> {
  configure({
    clientId: requireEnv("WORKOS_CLIENT_ID"),
    apiKey: requireEnv("WORKOS_API_KEY"),
    redirectUri: requireEnv("WORKOS_REDIRECT_URI"),
    cookiePassword: requireEnv("WORKOS_COOKIE_PASSWORD"),
  });
  return createAuthService<Request, Response>({
    sessionStorageFactory: (config) => new SvelteKitCookieStorage(config),
  });
}

let instance: ReturnType<typeof createService> | null = null;
function resolveService(): ReturnType<typeof createService> {
  return (instance ??= createService());
}

// A Proxy keeps `authService` importable as a value while deferring configure()
// until the first member access, which always happens inside a request.
export const authService = new Proxy({} as ReturnType<typeof createService>, {
  get(_target, prop) {
    const target = resolveService();
    const value = Reflect.get(target, prop, target) as unknown;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- forwards arbitrary auth-service members from the lazily-created instance
    return typeof value === "function" ? value.bind(target) : value;
  },
});

export { OAuthStateMismatchError, PKCECookieMissingError };
