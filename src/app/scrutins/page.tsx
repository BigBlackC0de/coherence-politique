import Link from "next/link";
import { MessageCircleQuestion, Search } from "lucide-react";
import { debateHeadlines } from "@/lib/queries-debates";
import { listScrutins, allParties } from "@/lib/queries";
import { THEMES } from "@/lib/config/themes";
import { Card, PageHeader, Position, Salience, ThemeChip, fmtDate, fmtInt } from "@/components/ui";
import { Help } from "@/components/help";

export const dynamic = "force-dynamic";

export default async function ScrutinsPage(props: PageProps<"/scrutins">) {
  const sp = await props.searchParams;
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const q = get("q") ?? "";
  const theme = get("theme") ?? "";
  const chamber = get("chamber") ?? "";
  const party = get("party") ?? "";
  const position = get("position") ?? "";
  const major = get("major") === "1";
  const explained = get("explique") === "1";
  const page = Number(get("page") ?? 1);
  const res = listScrutins({ q, theme: theme || undefined, chamber: chamber || undefined, party: party || undefined, position: position || undefined, page, minSalience: major ? 4 : undefined, explained });
  const heads = debateHeadlines(res.rows.map((r) => r.uid));
  const parties = allParties();
  const pages = Math.ceil(res.total / res.pageSize);
  const qs = (patch: Record<string, string>) => {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, theme, chamber, party, position, major: major ? "1" : "", explique: explained ? "1" : "", ...patch })) if (v) usp.set(k, v);
    return `/scrutins?${usp}`;
  };
  const link = (p: number) => qs({ page: p > 1 ? String(p) : "" });
  const toggleMajor = qs({ major: major ? "" : "1" });
  const toggleExplained = qs({ explique: explained ? "" : "1" });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Au Parlement"
        title={
          <>
            Les votes <Help k="scrutin" />
          </>
        }
        description="Les votes de l'Assemblée et du Sénat, résumés en une phrase. Cherchez un mot, un sujet, ou ce qu'a voté un parti."
      />
      <Card>
        <form className="grid md:grid-cols-2 xl:grid-cols-6 gap-2 text-sm" method="get">
          <label className="md:col-span-2 relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input name="q" defaultValue={q} placeholder="Un mot : retraites, loyers, police…" className="input w-full !pl-9" />
          </label>
          <select name="theme" defaultValue={theme} className="input">
            <option value="">Tous les sujets</option>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.label}
              </option>
            ))}
          </select>
          <select name="chamber" defaultValue={chamber} className="input">
            <option value="">Assemblée + Sénat</option>
            <option value="AN">Assemblée</option>
            <option value="SENAT">Sénat</option>
          </select>
          <div className="flex gap-1">
            <select name="party" defaultValue={party} className="input flex-1">
              <option value="">Un parti…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.shortName}
                </option>
              ))}
            </select>
            <select name="position" defaultValue={position} className="input">
              <option value="">a voté…</option>
              <option value="pour">pour</option>
              <option value="contre">contre</option>
              <option value="abstention">abstention</option>
            </select>
          </div>
          {major && <input type="hidden" name="major" value="1" />}
          {explained && <input type="hidden" name="explique" value="1" />}
          <button className="btn-primary">Chercher</button>
        </form>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-3">
        <span>
          {fmtInt(res.total)} votes · page {res.page} sur {Math.max(1, pages)}
        </span>
        <span className="flex flex-wrap gap-2">
          <Link href={toggleExplained} className={`pill ${explained ? "pill-active" : ""}`}>
            <MessageCircleQuestion size={13} /> {explained ? "Tous les votes" : "Votes expliqués"}
          </Link>
          <Link href={toggleMajor} className={`pill ${major ? "pill-active" : ""}`}>
            {major ? "Tous les votes" : "Votes importants"}
          </Link>
        </span>
      </div>

      <ul className="space-y-3">
        {res.rows.map((r) => {
          const total = r.pour + r.contre + r.abstentions || 1;
          const h = heads.get(r.uid);
          return (
            <li key={r.uid} className="card card-hover p-4 md:p-5">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                <div className="sm:w-24 shrink-0 text-xs text-ink-3 flex flex-wrap sm:block items-center gap-x-2">
                  <div className="font-semibold text-ink-2">{fmtDate(r.date)}</div>
                  <div>{r.chamber === "SENAT" ? "Sénat" : "Assemblée"}</div>
                  {r.sort && <div className={`sm:mt-2 inline-flex rounded-full px-2 py-0.5 font-bold ${r.sort === "adopté" ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>{r.sort}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/scrutins/${r.uid}`} className="font-semibold text-[15px] hover:underline leading-snug break-words">
                    {h?.titre ?? r.summary ?? r.title}
                  </Link>
                  {h?.enjeu && <p className="text-sm text-ink-2 mt-1 line-clamp-2">{h.enjeu}</p>}
                  {h && (
                    <Link href={`/scrutins/${r.uid}#pourquoi`} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent-ink px-2.5 py-1 text-xs font-semibold hover:underline">
                      <MessageCircleQuestion size={13} /> Lire pourquoi ils ont voté comme ça
                    </Link>
                  )}
                  {(h?.titre || r.summary) && <div className="text-xs text-ink-3 truncate mt-1">Titre officiel : {r.title}</div>}
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-ink-3">
                    <Salience s={r.salience} />
                    {r.theme && <ThemeChip id={r.theme} />}
                    {r.procedural ? <span className="pill" title="Un vote sur la façon de débattre (par exemple rejeter le texte sans l'examiner), pas sur son contenu.">vote de procédure</span> : null}
                    {!r.salience && <span className="italic">pas encore lu</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3">
                    <div className="flex h-2 w-32 sm:w-44 rounded-full overflow-hidden gap-px shrink-0" title={`${r.pour} pour · ${r.contre} contre · ${r.abstentions} abstentions`}>
                      <span className="bg-good" style={{ width: `${(r.pour / total) * 100}%` }} />
                      <span className="bg-bad" style={{ width: `${(r.contre / total) * 100}%` }} />
                      <span className="bg-warn" style={{ width: `${(r.abstentions / total) * 100}%` }} />
                    </div>
                    <span className="text-xs text-ink-3 num">
                      <span className="text-good font-semibold">{r.pour} pour</span> · <span className="text-bad font-semibold">{r.contre} contre</span> · {r.abstentions} abstentions
                    </span>
                    <div className="hidden md:flex flex-wrap gap-x-3 gap-y-0.5 text-xs ml-auto">
                      {r.groups
                        .filter((g) => g.position && g.party_id)
                        .sort((a, b) => (parties.find((p) => p.id === a.party_id)?.lrIndex ?? 999) - (parties.find((p) => p.id === b.party_id)?.lrIndex ?? 999))
                        .map((g) => (
                          <span key={g.group_abbrev ?? g.party_id ?? ""} className="inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: parties.find((p) => p.id === g.party_id)?.color }} />
                            <span className="text-ink-3">{parties.find((p) => p.id === g.party_id)?.shortName ?? g.group_abbrev}</span>
                            <Position p={g.position} />
                          </span>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <div className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={link(page - 1)} className="btn-secondary">
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          {page < pages && (
            <Link href={link(page + 1)} className="btn-secondary">
              Suivant →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
