import type { RequestHandler } from "./$types";
import { authService, OAuthStateMismatchError, PKCECookieMissingError } from "$lib/server/auth";

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

    const response = new Response(null, {
      status: 302,
      headers: { Location: result.returnPathname },
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
        headers: { Location: "/signin?error=state_mismatch" },
      });
    }
    throw err;
  }
};
