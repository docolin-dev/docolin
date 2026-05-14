import type { RequestHandler } from "./$types";
import { authService } from "$lib/server/auth";

export const GET: RequestHandler = async ({ url }) => {
  const returnPathname = url.searchParams.get("returnTo") ?? "/";
  const { url: authorizationUrl, headers } = await authService.createSignIn(undefined, {
    returnPathname,
  });

  const response = new Response(null, {
    status: 302,
    headers: { Location: authorizationUrl },
  });

  const setCookie = headers?.["Set-Cookie"] ?? headers?.["set-cookie"];
  if (setCookie) {
    for (const value of Array.isArray(setCookie) ? setCookie : [setCookie]) {
      response.headers.append("Set-Cookie", value);
    }
  }

  return response;
};
