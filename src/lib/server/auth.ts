import {
  WORKOS_API_KEY,
  WORKOS_CLIENT_ID,
  WORKOS_COOKIE_PASSWORD,
  WORKOS_REDIRECT_URI,
} from "$env/static/private";
import {
  CookieSessionStorage,
  configure,
  createAuthService,
  OAuthStateMismatchError,
  PKCECookieMissingError,
} from "@workos/authkit-session";

configure({
  clientId: WORKOS_CLIENT_ID,
  apiKey: WORKOS_API_KEY,
  redirectUri: WORKOS_REDIRECT_URI,
  cookiePassword: WORKOS_COOKIE_PASSWORD,
});

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

export const authService = createAuthService<Request, Response>({
  sessionStorageFactory: (config) => new SvelteKitCookieStorage(config),
});

export { OAuthStateMismatchError, PKCECookieMissingError };
