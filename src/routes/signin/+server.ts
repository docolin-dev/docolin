import type { RequestHandler } from "./$types";
import { authService } from "$lib/server/auth";
import { safeReturnPathname } from "$lib/return-to";

export const GET: RequestHandler = async ({ url }) => {
  const returnPathname = safeReturnPathname(url.searchParams.get("returnTo"));
  const { url: authorizationUrl, headers } = await authService.createSignIn(undefined, {
    returnPathname,
  });

  // PKCE cookie is set here and the location URL is one-shot, scoped to this
  // user's flow. Never cache anywhere along the chain.
  const response = new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl,
      "Cache-Control": "private, no-store",
    },
  });

  const setCookie = headers?.["Set-Cookie"] ?? headers?.["set-cookie"];
  if (setCookie) {
    for (const value of Array.isArray(setCookie) ? setCookie : [setCookie]) {
      response.headers.append("Set-Cookie", value);
    }
  }

  return response;
};
