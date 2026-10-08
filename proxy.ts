import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims verifies the session token locally (refreshing it when it has
  // expired) instead of calling the auth service on every request.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;
  const pathname = request.nextUrl.pathname;
  const isProtectedRoute =
    pathname === "/" ||
    /^(?:\/dashboard|\/contacts|\/groups|\/investors|\/my-profile|\/broadcasts|\/templates|\/unread-messages)(?:\/|$)/.test(pathname);

  if (!user && isProtectedRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/contacts/:path*",
    "/groups/:path*",
    "/investors/:path*",
    "/my-profile/:path*",
    "/broadcasts/:path*",
    "/templates/:path*",
    "/unread-messages/:path*",
  ],
};
