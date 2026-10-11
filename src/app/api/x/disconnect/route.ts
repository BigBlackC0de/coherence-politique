import { redirect } from "next/navigation";
import { disconnectX } from "@/lib/x/client";
import { assertAdmin } from "@/lib/auth";

export async function POST() {
  const denied = await assertAdmin();
  if (denied) return denied;
  disconnectX();
  redirect("/sources?x=" + encodeURIComponent("Compte X déconnecté."));
}
