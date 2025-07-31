import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/",
  "/(projects|profile|billing)(.*)",
]);
const isSignInRoute = createRouteMatcher(["/sign-in"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  if (isProtectedRoute(req)) await auth.protect();

  if (isSignInRoute(req) && userId) {
    return NextResponse.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!.*\\..*|_next).*)",
    "/",
    "/.redwood(.*)",
    "/.netlify(.*)",
    "/(api|trpc)(.*)",
  ],
};
