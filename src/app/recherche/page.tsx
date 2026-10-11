import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Building2, FileText, Landmark, MessageSquareQuote, Tags, Users } from "lucide-react";
import { globalSearch, highlight } from "@/lib/search";
import { SearchBox } from "@/components/search-box";
import { Card, Empty, OfficialLink, PageHeader, Salience, ThemeChip, fmtDate, fmtInt } from "@/components/ui";
import { POST_KIND_PLAIN as KIND_LABEL } from "@/lib/config/plain";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Recherche" };

const EXAMPLES = ["retraites", "Gironde", "49.3", "immigration", "Bardella", "nucléaire", "SMIC", "fin de vie"];

/** Texte avec les mots recherchés surlignés. */
function Hl({ text, words }: { text: string; words: string[] }) {
  return (
    <>
      {highlight(text, words).map((s, i) =>
        s.hit ? (
          <mark key={i} className="bg-accent-soft text-ink rounded-sm px-0.5">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function Section({ id, icon, title, total, capped, more, children }: { id: string; icon: ReactNode; title: string; total: number; capped?: boolean; more?: { href: string; label: string }; children: ReactNode }) {
  return (
    <Card
      id={id}
      title={
        <span className="flex items-center gap-2">
          <span className="text-ink-3">{icon}</span>
          {title}
          <span className="pill">{capped ? `${fmtInt(total)}+` : fmtInt(total)}</span>
        </span>
      }
      action={
        more ? (
          <Link href={more.href} className="text-sm font-semibold text-accent-ink hover:underline inline-flex items-center gap-1 shrink-0">
            {more.label} <ArrowRight size={14} />
          </Link>
        ) : undefined
      }
    >
      {children}
    </Card>
  );
}

export default async function SearchPage(props: PageProps<"/recherche">) {
  const sp = await props.searchParams;
  const q = ((Array.isArray(sp.q) ? sp.q[0] : sp.q) ?? "").slice(0, 120);
  const r = globalSearch(q);
  const { words } = r;
  const enc = encodeURIComponent(q.trim());
  const groups = [
    { id: "elus", label: "Élus", n: r.politicians.total, capped: false },
    { id: "partis", label: "Partis", n: r.parties.total, capped: false },
    { id: "sujets", label: "Sujets", n: r.themes.total, capped: false },
    { id: "votes", label: "Votes", n: r.scrutins.total, capped: false },
    { id: "programmes", label: "Programmes", n: r.programmes.total, capped: false },
    { id: "prises-de-parole", label: "Prises de parole", n: r.posts.total, capped: r.posts.capped },
  ];
  const nothing = words.length > 0 && groups.every((g) => g.n === 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Recherche" title={q.trim() ? <>Résultats pour « {q.trim()} »</> : "Rechercher"} description="Un élu, un département, un parti, un sujet ou un mot : la recherche porte sur tout le site." />

      <SearchBox size="lg" defaultValue={q} autoFocus={!q} placeholder="Ex. retraites, Gironde, 49.3, Bardella…" className="max-w-3xl" />

      {!words.length ? (
        <Card title="Quelques idées pour commencer">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <Link key={ex} href={`/recherche?q=${encodeURIComponent(ex)}`} className="rounded-full border border-border bg-surface hover:bg-surface-2 hover:border-accent px-3 py-1.5 text-sm font-medium">
                {ex}
              </Link>
            ))}
          </div>
          <p className="text-sm text-ink-3 mt-4">Astuce : avec plusieurs mots, seuls les résultats qui les contiennent tous restent. Par exemple « RN Gironde » ou « retraites 64 ans ».</p>
        </Card>
      ) : nothing ? (
        <Empty>
          Aucun résultat pour « {q.trim()} ». Vérifiez l&apos;orthographe ou essayez un mot plus court (par exemple « retraite » plutôt que « retraites anticipées »).
        </Empty>
      ) : (
        <>
          <nav aria-label="Catégories de résultats" className="flex flex-wrap gap-2 text-sm">
            {groups
              .filter((g) => g.n > 0)
              .map((g) => (
                <a key={g.id} href={`#${g.id}`} className="rounded-full border border-border bg-surface hover:bg-surface-2 px-3 py-1">
                  {g.label} <span className="text-ink-3 num">{g.capped ? `${fmtInt(g.n)}+` : fmtInt(g.n)}</span>
                </a>
              ))}
          </nav>

          {r.politicians.total > 0 && (
            <Section id="elus" icon={<Users size={16} />} title="Élus" total={r.politicians.total} more={r.politicians.total > r.politicians.items.length ? { href: `/parlementaires?q=${enc}`, label: "Tous les élus" } : undefined}>
              <ul className="grid md:grid-cols-2 gap-2">
                {r.politicians.items.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl border border-border p-2.5 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.partyColor ?? "var(--neutral)" }} />
                    <div className="min-w-0">
                      <Link href={`/parlementaires/${p.id}`} className="font-semibold hover:underline block truncate">
                        <Hl text={p.fullName} words={words} />
                      </Link>
                      <span className="text-xs text-ink-3">
                        {p.chamber === "AN" ? "Député·e" : "Sénateur·rice"}
                        {p.partyShort || p.groupAbbrev ? ` · ${p.partyShort ?? p.groupAbbrev}` : ""}
                        {p.department ? (
                          <>
                            {" · "}
                            <Hl text={p.department} words={words} />
                          </>
                        ) : null}
                        {!p.active && " · ancien mandat"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {r.parties.total > 0 && (
            <Section id="partis" icon={<Building2 size={16} />} title="Partis" total={r.parties.total}>
              <ul className="grid md:grid-cols-2 gap-2">
                {r.parties.items.map((p) => (
                  <li key={p.id} className="rounded-xl border border-border p-3 text-sm">
                    <Link href={`/partis/${p.id}`} className="font-semibold hover:underline inline-flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                      <Hl text={p.name} words={words} /> ({p.shortName})
                    </Link>
                    <div className="text-xs text-ink-3 mt-0.5">
                      {p.family}
                      {p.leaders.length > 0 && (
                        <>
                          {" · dirigé par "}
                          <Hl text={p.leaders.join(", ")} words={words} />
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {r.themes.total > 0 && (
            <Section id="sujets" icon={<Tags size={16} />} title="Sujets" total={r.themes.total}>
              <ul className="grid md:grid-cols-2 gap-2">
                {r.themes.items.map((t) => (
                  <li key={t.id} className="rounded-xl border border-border p-3 text-sm">
                    <Link href={`/themes/${t.id}`} className="font-semibold hover:underline">
                      <span aria-hidden>{t.emoji}</span> <Hl text={t.label} words={words} />
                    </Link>
                    <p className="text-ink-2 mt-0.5">{t.question}</p>
                    {t.examples && (
                      <p className="text-xs text-ink-3 mt-0.5">
                        Par exemple : <Hl text={t.examples} words={words} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {r.scrutins.total > 0 && (
            <Section id="votes" icon={<Landmark size={16} />} title="Votes" total={r.scrutins.total} more={r.scrutins.total > r.scrutins.items.length ? { href: `/scrutins?q=${enc}`, label: "Tous les votes" } : undefined}>
              <ul className="space-y-3 text-sm">
                {r.scrutins.items.map((s) => (
                  <li key={s.uid} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <Link href={`/scrutins/${s.uid}`} className="font-semibold hover:underline leading-snug">
                      <Hl text={s.summary ?? s.title} words={words} />
                    </Link>
                    {s.summary && (
                      <div className="text-xs text-ink-3 mt-0.5 line-clamp-2">
                        Titre officiel : <Hl text={s.title} words={words} />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3 mt-1">
                      <span>{fmtDate(s.date)}</span>
                      <span>{s.chamber === "SENAT" ? "Sénat" : "Assemblée"}</span>
                      {s.sort && <span className={s.sort === "adopté" ? "text-good font-semibold" : "text-bad font-semibold"}>{s.sort}</span>}
                      <Salience s={s.salience} />
                      {s.theme && <ThemeChip id={s.theme} />}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {r.programmes.total > 0 && (
            <Section id="programmes" icon={<FileText size={16} />} title="Programmes" total={r.programmes.total}>
              <ul className="space-y-3 text-sm">
                {r.programmes.items.map((d) => (
                  <li key={d.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ background: d.partyColor ?? "var(--neutral)" }} />
                      <div className="min-w-0">
                        <Link href={`/programmes/${d.id}`} className="font-semibold hover:underline leading-snug">
                          <Hl text={d.title} words={words} />
                        </Link>
                        <div className="text-xs text-ink-3 mt-0.5">{d.partyShort ?? d.partyId}</div>
                        {d.excerpt && (
                          <p className="text-ink-2 mt-1">
                            <Hl text={d.excerpt} words={words} />
                          </p>
                        )}
                        {d.themes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {d.themes.map((t) => (
                              <ThemeChip key={t} id={t} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {r.posts.total > 0 && (
            <Section id="prises-de-parole" icon={<MessageSquareQuote size={16} />} title="Prises de parole" total={r.posts.total} capped={r.posts.capped} more={{ href: `/prises-de-parole?q=${enc}`, label: "Toutes les prises de parole" }}>
              <ul className="space-y-3 text-sm">
                {r.posts.items.map((p) => (
                  <li key={p.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="text-xs text-ink-3 flex gap-2 flex-wrap items-center">
                      {p.partyColor && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.partyColor }} />}
                      {p.politicianId ? (
                        <Link href={`/parlementaires/${p.politicianId}`} className="font-semibold text-ink-2 hover:underline">
                          {p.handle}
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink-2">{p.kind === "tweet" ? `@${p.handle}` : p.handle}</span>
                      )}
                      {p.partyShort && p.partyShort !== p.handle && <span>{p.partyShort}</span>}
                      <span className="rounded-full bg-accent-soft text-accent-ink px-2 py-0.5 font-semibold">{KIND_LABEL[p.kind] ?? p.kind}</span>
                      <span>{fmtDate(p.createdAt)}</span>
                      {p.url && (
                        <OfficialLink href={p.url} an={p.kind !== "communique" && p.kind !== "tweet"} className="underline ml-auto">
                          source officielle
                        </OfficialLink>
                      )}
                    </div>
                    {p.title && (
                      <div className="text-xs font-medium text-ink-2 mt-1 line-clamp-1">
                        <Hl text={p.title} words={words} />
                      </div>
                    )}
                    <p className="mt-1 leading-relaxed text-ink-2">
                      <Hl text={p.excerpt} words={words} />
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
