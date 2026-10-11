import { redirect } from "next/navigation";
import { buildAuthorizeUrl } from "@/lib/x/client";
import { assertAdmin } from "@/lib/auth";

export async function GET() {
  const denied = await assertAdmin();
  if (denied) return denied;
  let url: string;
  try {
    url = buildAuthorizeUrl().url;
  } catch (e) {
    redirect(`/sources?x=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(url);
}
