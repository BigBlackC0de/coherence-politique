import Link from "next/link";
import { memberParticipation, partyParticipation, participationSummary } from "@/lib/analysis/participation";
import { Card, Empty, PageHeader, LinkTabs, Stat, fmtDate, fmtPct, fmtInt } from "@/components/ui";
import { HBars } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function AssiduitePage(props: PageProps<"/assiduite">) {
  const sp = await props.searchParams;
  const chamber = ((Array.isArray(sp.chambre) ? sp.chambre[0] : sp.chambre) === "senat" ? "SENAT" : "AN") as "AN" | "SENAT";
  const all = memberParticipation(chamber, { minEligible: 1 });
  const summary = participationSummary(chamber, all);
  const parties = partyParticipation(
    chamber,
    all.filter((m) => m.eligible >= 20),
  );
  // Au Sénat, chaque scrutin liste tous les sénateurs (vote par délégation systématique) :
  // la présence n'est pas mesurable, on classe sur les votes exprimés.
  const isAN = chamber === "AN";
  const rate = (m: { presenceRate: number; voteRate: number }) => (isAN ? m.presenceRate : m.voteRate);
  const excluded = all.filter((m) => m.presidency);
  const members = all.filter((m) => m.eligible >= 50 && !m.presidency);
  const top = members.slice(0, 20);
  const bottom = [...members].reverse().slice(0, 20);
  const label = chamber === "AN" ? "députés" : "sénateurs";
  const bars = parties.map((p) => ({ id: p.partyId, name: p.shortName, value: rate(p), color: p.color, hint: `${p.name} · ${p.members} ${label} · ${fmtInt(isAN ? p.present : p.voted)} sur ${fmtInt(p.eligible)} votes possibles`, href: `/partis/${p.partyId}` }));

  const Row = ({ m, rank }: { m: (typeof members)[number]; rank: number }) => (
    <li className="flex items-center gap-3 text-sm py-1.5 border-b border-border last:border-0">
      <span className="w-6 shrink-0 text-right num text-ink-3 text-xs">{rank}</span>
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.partyColor ?? "var(--neutral)" }} title={m.partyShort ?? "sans parti suivi"} />
      <Link href={`/parlementaires/${m.id}`} className="font-medium hover:underline truncate w-32 sm:w-44 shrink-0">
        {m.fullName}
      </Link>
      <span className="text-xs text-ink-3 truncate hidden md:inline w-40">
        {m.groupAbbrev ?? "—"} · {m.department ?? ""}
      </span>
      <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden" title={`Présent à ${m.present} votes sur ${m.eligible} possibles ; a voté ${m.voted} fois`}>
        <div className="h-full rounded-full" style={{ width: `${rate(m) * 100}%`, background: m.partyColor ?? "var(--neutral)" }} />
      </div>
      <span className="w-12 sm:w-14 text-right num font-medium">{fmtPct(rate(m))}</span>
      <span className="w-28 text-right num text-xs text-ink-3 hidden sm:inline">
        {fmtInt(isAN ? m.present : m.voted)} / {fmtInt(m.eligible)}
      </span>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Au Parlement"
        title="Présence aux votes"
        description={
          isAN
            ? "Sur 100 votes nom par nom, combien de fois chaque député était là. Lisez les précautions en bas de page avant de conclure."
            : "Au Sénat, un élu peut voter à la place d'un collègue absent. On ne peut donc pas savoir qui était là. On montre la part des votes où chaque sénateur a voté pour, contre ou s'est abstenu."
        }
        actions={
          <LinkTabs
            items={[
              { href: "/assiduite", label: "Assemblée", active: isAN },
              { href: "/assiduite?chambre=senat", label: "Sénat", active: !isAN },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat label="Votes enregistrés" value={fmtInt(summary.scrutins)} hint={`${summary.from ? fmtDate(summary.from) : "—"} → ${summary.to ? fmtDate(summary.to) : "—"}`} />
        <Stat label={`${label[0].toUpperCase() + label.slice(1)} en fonction`} value={fmtInt(summary.members)} />
        <Stat label={isAN ? "Présence moyenne" : "Votes exprimés (moyenne)"} value={fmtPct(isAN ? summary.meanPresence : summary.meanVote)} hint="sur l'ensemble des votes possibles" tone="accent" />
        <Stat label="Classés" value={fmtInt(members.length)} hint={`${label} avec au moins 50 votes possibles`} />
      </div>

      <Card title={isAN ? "La présence, parti par parti" : "Les votes exprimés, parti par parti"} subtitle={`sur 100 votes possibles, combien de fois les ${label} du parti ${isAN ? "étaient là" : "ont voté"} · cliquez sur une barre pour voir le parti`}>
        {bars.length === 0 ? <Empty>Pas encore de données.</Empty> : <HBars data={bars} max={1} format="pct" />}
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={isAN ? "📈 Les plus présents" : "📈 Ceux qui votent le plus"}>
          {top.length === 0 ? <Empty>Pas encore de données.</Empty> : <ul>{top.map((m, i) => <Row key={m.id} m={m} rank={i + 1} />)}</ul>}
          {excluded.length > 0 && (
            <p className="text-xs text-ink-3 mt-3">
              Hors classement :{" "}
              {excluded.map((m) => (
                <Link key={m.id} href={`/parlementaires/${m.id}`} className="underline">
                  {m.fullName}
                </Link>
              ))}{" "}
              — la personne qui préside la séance ne vote pas.
            </p>
          )}
        </Card>
        <Card title={isAN ? "📉 Les moins présents" : "📉 Ceux qui votent le moins"}>
          {bottom.length === 0 ? (
            <Empty>Pas encore de données.</Empty>
          ) : (
            <ul>
              {bottom.map((m, i) => (
                <Row key={m.id} m={m} rank={members.length - i} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Avant de juger : comment lire ces chiffres" id="precautions">
        <ul className="text-sm space-y-1.5 text-ink-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong>Seulement les votes nom par nom.</strong> La plupart des votes se font à main levée, sans noter qui a voté quoi. On compte seulement les votes où chaque nom est noté : les grands votes solennels, ou ceux qu&apos;un groupe a demandés.
          </li>
          <li>
            <strong>Seulement depuis son arrivée.</strong> Un élu arrivé en cours de route (remplaçant, élection partielle) n&apos;est compté qu&apos;à partir de son arrivée. {isAN ? "Cette date vient des données publiques de l'Assemblée." : "Sans date officielle, son premier vote sert de point de départ."} Les élus avec moins de 50 votes possibles ne sont pas classés.
          </li>
          <li>
            <strong>« Non votant » ne veut pas dire absent.</strong> L&apos;élu est noté dans le vote mais ne vote pas, par exemple parce qu&apos;il préside la séance. Il compte comme présent, mais pas comme ayant voté.
          </li>
          <li>
            <strong>Ce que ça ne montre pas.</strong> Le travail en commission (les petits groupes qui préparent les lois), les rapports, les questions écrites et le travail sur le terrain n&apos;apparaissent pas. Un taux bas peut aussi venir d&apos;une fonction particulière ou d&apos;un congé.
          </li>
        </ul>
      </Card>
    </div>
  );
}
