import type { RequestHandler } from "./$types";
import { authService, OAuthStateMismatchError, PKCECookieMissingError } from "$lib/server/auth";
import { findUserByWorkosId } from "$lib/server/users";
import { safeReturnPathname } from "$lib/return-to";

export const GET: RequestHandler = async ({ request, url }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? undefined;

  if (!code) {
    if (state) {
      await authService.clearPendingVerifier(undefined, { state });
    }
    return new Response("Missing authorization code", { status: 400 });
  }

  try {
    const result = await authService.handleCallback(request, new Response(), { code, state });

    // First-time visitors land on /onboarding so they pick a handle before
    // anything else. Returning users go straight to wherever they came from.
    // Re-guard the pathname at the exit too: it round-tripped through the
    // OAuth state, and this Location header is the actual open-redirect sink.
    const returnPathname = safeReturnPathname(result.returnPathname);
    const dbUser = await findUserByWorkosId(result.authResponse.user.id);
    const location = dbUser
      ? returnPathname
      : `/onboarding?returnTo=${encodeURIComponent(returnPathname)}`;

    // OAuth code is single-use and the session cookie is per-user. Never cache.
    const response = new Response(null, {
      status: 302,
      headers: {
        Location: location,
        "Cache-Control": "private, no-store",
      },
    });

    const setCookie = result.headers?.["Set-Cookie"] ?? result.headers?.["set-cookie"];
    if (setCookie) {
      for (const value of Array.isArray(setCookie) ? setCookie : [setCookie]) {
        response.headers.append("Set-Cookie", value);
      }
    }

    return response;
  } catch (err) {
    if (err instanceof OAuthStateMismatchError || err instanceof PKCECookieMissingError) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: "/signin?error=state_mismatch",
          "Cache-Control": "private, no-store",
        },
      });
    }
    throw err;
  }
};
