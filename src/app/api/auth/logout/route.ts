import { NextResponse } from "next/server";
import { COOKIE } from "@/lib/reddit/config";

/** Clear the session cookie (ADR-0008). POST so it is not triggerable by a link. */
export async function POST(): Promise<NextResponse> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE.session, "", { path: "/", maxAge: 0, httpOnly: true });
  return res;
}
