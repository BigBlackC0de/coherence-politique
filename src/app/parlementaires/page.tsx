import Link from "next/link";
import { Search } from "lucide-react";
import { searchPoliticians, seatCounts } from "@/lib/queries";
import { Card, Empty, PageHeader } from "@/components/ui";
import { Hemicycle } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function PoliticiansPage(props: PageProps<"/parlementaires">) {
  const sp = await props.searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "";
  const results = q ? searchPoliticians(q) : [];
  const an = seatCounts("AN");
  const senat = seatCounts("SENAT");
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${an.total} députés · ${senat.total} sénateurs`} title="Les élus" description="Tapez le nom d'un député ou d'un sénateur, ou votre département. Vous verrez ses votes, sa présence et ses prises de parole." />
      <Card>
        <form method="get" className="flex gap-2 text-sm">
          <label className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={q} placeholder="Nom ou département (ex. Dupont, Gironde)" className="input w-full !pl-9 !py-2.5" />
          </label>
          <button className="btn-primary">Chercher</button>
        </form>
      </Card>
      {q && results.length === 0 && <Empty>Aucun élu trouvé pour « {q} ».</Empty>}
      {results.length > 0 && (
        <ul className="grid md:grid-cols-2 gap-2">
          {results.map((p) => (
            <li key={p.id} className="card card-hover p-3 text-sm flex items-center gap-3">
              <span className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-semibold" style={{ background: p.color ?? "var(--neutral)" }}>
                {p.firstName[0]}
                {p.lastName[0]}
              </span>
              <div className="min-w-0">
                <Link href={`/parlementaires/${p.id}`} className="font-medium hover:underline block truncate">
                  {p.fullName}
                </Link>
                <span className="text-xs text-ink-3">
                  {p.chamber === "AN" ? "Député·e" : "Sénateur·rice"} · {p.short_name ?? p.groupAbbrev ?? "sans groupe"} · {p.department ?? ""}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!q && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card title="L'Assemblée nationale" subtitle="les députés, par parti">
            <Hemicycle data={an.slices} total={an.total} title="députés" />
          </Card>
          <Card title="Le Sénat" subtitle="les sénateurs, par parti">
            <Hemicycle data={senat.slices} total={senat.total} title="sénateurs" />
          </Card>
        </div>
      )}
    </div>
  );
}
