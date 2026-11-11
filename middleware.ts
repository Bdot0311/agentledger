import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Only pages need session refresh; API routes authenticate themselves.
  matcher: ["/app/:path*", "/onboarding/:path*", "/login", "/signup"],
};
