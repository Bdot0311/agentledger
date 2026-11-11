import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { sessionWorkspace } from "@/lib/route-auth";
import { gmailAuthUrl } from "@/lib/gmail";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await sessionWorkspace();
  if ("response" in auth) return NextResponse.redirect(new URL("/login", req.url));
  if (!process.env.GOOGLE_CLIENT_ID) return NextResponse.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 501 });
  const next = new URL(req.url).searchParams.get("next") ?? "/app/settings";
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(gmailAuthUrl(state));
  res.cookies.set("al_gmail_oauth", JSON.stringify({ state, next: next.startsWith("/") ? next : "/app/settings" }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
