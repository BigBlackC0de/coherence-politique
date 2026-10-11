import { NextRequest, NextResponse } from "next/server";
import { adminMode, adminToken, loginAllowed, loginFailed, loginSucceeded, makeSessionValue, sessionCookie, tokenMatches } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const mode = adminMode();
  if (mode !== "token") return NextResponse.redirect(new URL(mode === "open" ? "/sources" : "/", req.url), 303);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const nextRaw = String(form.get("next") ?? "/sources");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/sources";
  if (!loginAllowed(ip)) return NextResponse.redirect(new URL(`/admin?error=locked&next=${encodeURIComponent(next)}`, req.url), 303);
  if (!tokenMatches(password, adminToken()!)) {
    loginFailed(ip);
    return NextResponse.redirect(new URL(`/admin?error=1&next=${encodeURIComponent(next)}`, req.url), 303);
  }
  loginSucceeded(ip);
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(sessionCookie(makeSessionValue(adminToken()!)));
  return res;
}
