import Link from "next/link";
import { redirect } from "next/navigation";
import { adminMode, isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage(props: PageProps<"/admin">) {
  const sp = await props.searchParams;
  const next = (Array.isArray(sp.next) ? sp.next[0] : sp.next) ?? "/sources";
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const mode = adminMode();
  if (mode === "locked") redirect("/");
  if (await isAdmin()) redirect(next.startsWith("/") ? next : "/sources");

  return (
    <div className="max-w-md mx-auto mt-10">
      <div className="card p-6 md:p-8">
        <div className="eyebrow">Espace réservé</div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">Administration</h1>
        <p className="text-sm text-ink-2 mt-2">Cette zone permet de lancer les analyses, d&apos;ajouter des sources et d&apos;interroger Cohérence-Politique. Elle est réservée au propriétaire du site. Les visiteurs ont accès à toutes les données en lecture.</p>
        <form method="post" action="/api/admin/login" className="mt-5 space-y-3">
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm">
            <span className="text-ink-2">Clé d&apos;administration</span>
            <input name="password" type="password" autoComplete="current-password" required autoFocus className="input mt-1 w-full" />
          </label>
          {error === "1" && <p className="text-sm text-bad">Clé incorrecte.</p>}
          {error === "locked" && <p className="text-sm text-bad">Trop de tentatives : réessayez dans quinze minutes.</p>}
          <button className="btn-primary w-full">Se connecter</button>
        </form>
        <p className="text-xs text-ink-3 mt-4">
          <Link href="/" className="underline">
            Retour au site
          </Link>
        </p>
      </div>
    </div>
  );
}
