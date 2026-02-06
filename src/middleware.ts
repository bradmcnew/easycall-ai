import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const protectedRoutes = ["/select-isp", "/select-issue", "/confirm", "/call"];

// Routes where we check for an active call and redirect
const activeCallCheckRoutes = ["/select-isp", "/select-issue", "/confirm"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  if (isProtected) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Check for active call redirect (only on ISP selection flow routes)
    const shouldCheckActiveCall = activeCallCheckRoutes.some((route) =>
      pathname.startsWith(route)
    );

    if (shouldCheckActiveCall) {
      try {
        const activeCallUrl = new URL("/api/call/active", request.url);
        const res = await fetch(activeCallUrl.toString(), {
          headers: {
            cookie: request.headers.get("cookie") ?? "",
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.hasActiveCall && data.callId) {
            return NextResponse.redirect(
              new URL(`/call/${data.callId}`, request.url)
            );
          }
        }
      } catch {
        // If active call check fails, continue normally
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/select-isp", "/select-issue", "/confirm", "/call/:path*"],
};
