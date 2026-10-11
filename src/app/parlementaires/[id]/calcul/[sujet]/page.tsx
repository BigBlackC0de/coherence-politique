import Link from "next/link";
import { notFound } from "next/navigation";
import { politicianThemeCalc } from "@/lib/queries-calcul";
import { THEME_BY_ID } from "@/lib/config/themes";
import { stanceWords, themePlain } from "@/lib/config/plain";
import { Card, Empty, PageHeader, Position, Salience, fmtDate, fmtInt } from "@/components/ui";
import { KIND_LABEL, VoteCalc, dec, signed } from "@/components/calc";

export const dynamic = "force-dynamic";

const SHOWN = 300;

export default async function PoliticianCalcPage(props: PageProps<"/parlementaires/[id]/calcul/[sujet]">) {
  const { id, sujet } = await props.params;
  const d = politicianThemeCalc(id, sujet);
  const theme = THEME_BY_ID[sujet];
  if (!d || !theme) notFound();
  const { politician: p, votes, num, den, stance } = d;
  const pl = themePlain(sujet);
  const differs = votes.filter((v) => v.groupPosition && v.groupPosition !== "abstention" && v.position !== v.groupPosition).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <>
            <Link href={`/parlementaires/${p.id}`} className="hover:underline">
              {p.fullName}
            </Link>{" "}
            · le calcul
          </>
        }
        title={`${theme.emoji} ${theme.label} : comment sa position est calculée`}
        description={pl.question}
      />

      <Card title="Le résultat">
        {stance === null ? (
          <Empty>Aucun de ses votes n&apos;est classé sur ce sujet.</Empty>
        ) : (
          <div className="space-y-2 text-sm text-ink-2 leading-relaxed">
            <p className="text-lg font-semibold text-ink">{stanceWords(sujet, stance)?.text}</p>
            <p className="num">
              Somme des contributions {signed(num)} ÷ somme des poids {dec(den)} = <strong className="text-ink">{signed(stance)}</strong>, sur une échelle de −1 (« {pl.left} ») à +1 (« {pl.right} »).
            </p>
            <p>
              {fmtInt(votes.length)} votes comptés. Chaque vote : sa position (pour +1, contre −1, abstention 0) × le sens du « pour » sur ce sujet × son poids (part du sujet
              dans le vote × importance de 1 à 5). Les absences ne comptent pas. Il a voté autrement que son groupe {fmtInt(differs)} fois sur ce sujet.
            </p>
          </div>
        )}
      </Card>

      {votes.length > 0 && (
        <Card title="Vote par vote" subtitle={`du plus lourd au plus léger${votes.length > SHOWN ? ` · les ${SHOWN} premiers` : ""}`}>
          <ul className="space-y-3 text-sm">
            {votes.slice(0, SHOWN).map((v) => (
              <li key={v.uid} className="border-b border-border pb-2.5 last:border-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                  <span>{fmtDate(v.date)}</span>
                  <span>{v.chamber === "SENAT" ? "Sénat" : "Assemblée"}</span>
                  <Position p={v.position} badge />
                  <Salience s={v.salience} />
                  {v.groupPosition && v.groupPosition !== v.position && <span>son groupe : {v.groupPosition}</span>}
                </div>
                <Link href={`/scrutins/${v.uid}#calcul`} className="block mt-1 hover:underline font-medium leading-snug">
                  {v.summary ?? v.title}
                </Link>
                <div className="text-xs text-ink-2 mt-0.5">
                  {KIND_LABEL[v.kind]} · <VoteCalc themeId={sujet} position={v.position} direction={v.direction} weight={v.themeWeight} salience={v.salience} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
