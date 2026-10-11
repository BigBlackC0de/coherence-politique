import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import { searchPosts, partiesLite, politicianName, type PostFilters, type PostRow } from "@/lib/queries-library";
import { PageHeader, Empty, OfficialLink, ThemeChip, fmtDate, fmtInt } from "@/components/ui";
import { Help } from "@/components/help";
import { POST_KIND_PLAIN as KIND_LABEL } from "@/lib/config/plain";

export const dynamic = "force-dynamic";

const PER_PAGE = 20;
const EXCERPT = 600;
const KIND_ORDER = ["qag", "explication-vote", "discussion-generale", "motion", "qosd", "debat", "communique", "tweet"];
const CHAMBERS: { id: string; label: string }[] = [
  { id: "AN", label: "Assemblée nationale" },
  { id: "SENAT", label: "Sénat" },
  { id: "none", label: "Communiqués des partis" },
];

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Coupe proprement le texte à une fin de mot. */
function cut(text: string, n: number): [string, string] {
  if (text.length <= n + 80) return [text, ""];
  const i = text.lastIndexOf(" ", n);
  const at = i > n * 0.7 ? i : n;
  return [text.slice(0, at), text.slice(at)];
}

export default async function PrisesDeParolePage(props: PageProps<"/prises-de-parole">) {
  const sp = await props.searchParams;
  const f: PostFilters = { q: str(sp.q), party: str(sp.parti), kind: str(sp.nature), chamber: str(sp.chambre), elu: str(sp.elu), from: str(sp.du), to: str(sp.au) };
  const page = Number(str(sp.page) ?? 1) || 1;
  const { rows, total, page: cur, pages, facets } = searchPosts(f, page, PER_PAGE);
  const parties = partiesLite();
  const elu = f.elu ? politicianName(f.elu) : null;

  /** Lien qui conserve les filtres courants en remplaçant certains (undefined = retirer). */
  const href = (patch: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = { q: f.q, parti: f.party, nature: f.kind, chambre: f.chamber, elu: f.elu, du: f.from, au: f.to, ...patch };
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) usp.set(k, v);
    const s = usp.toString();
    return s ? `/prises-de-parole?${s}` : "/prises-de-parole";
  };
  const anyFilter = Boolean(f.q || f.party || f.kind || f.chamber || f.elu || f.from || f.to);
  const kinds = KIND_ORDER.filter((k) => (facets.byKind[k] ?? 0) > 0 || f.kind === k);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ce qu'ils disent"
        title="Les prises de parole"
        description={
          <>
            Ce que les élus disent au Parlement, mot pour mot, et les communiqués des partis.{" "}
            <Help k="prise-de-parole" />
          </>
        }
      />

      {/* ---- Recherche ---- */}
      <form action="/prises-de-parole" method="get" className="card p-4 md:p-5 space-y-3">
        {f.party && <input type="hidden" name="parti" value={f.party} />}
        {f.kind && <input type="hidden" name="nature" value={f.kind} />}
        {f.chamber && <input type="hidden" name="chambre" value={f.chamber} />}
        {f.elu && <input type="hidden" name="elu" value={f.elu} />}
        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1 min-w-0">
            <span className="sr-only">Mot ou nom à chercher</span>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
            <input type="search" name="q" defaultValue={f.q} placeholder="Un mot, un sujet, un nom… (ex. : hôpital, Bayrou, smic)" className="input w-full pl-9" />
          </label>
          <button type="submit" className="btn-primary justify-center">
            Chercher
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-3">Depuis le</span>
            <input type="date" name="du" defaultValue={f.from} className="input" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-3">Jusqu&apos;au</span>
            <input type="date" name="au" defaultValue={f.to} className="input" />
          </label>
          {anyFilter && (
            <Link href="/prises-de-parole" className="btn-ghost text-sm">
              <X size={14} /> Tout effacer
            </Link>
          )}
        </div>
      </form>

      {/* ---- Filtres en pilules ---- */}
      <div className="space-y-3">
        {elu && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-3">Élu :</span>
            <Link href={href({ elu: undefined, page: undefined })} className="pill pill-active">
              {elu.fullName} <X size={12} />
            </Link>
            <Link href={`/parlementaires/${elu.id}`} className="text-xs text-accent-ink hover:underline">
              voir sa fiche
            </Link>
          </div>
        )}
        <FilterRow label="Parti">
          <Link href={href({ parti: undefined })} className={`pill ${!f.party ? "pill-active" : ""}`}>
            Tous
          </Link>
          {parties.map((p) => (
            <Link key={p.id} href={href({ parti: f.party === p.id ? undefined : p.id })} className={`pill ${f.party === p.id ? "pill-active" : ""}`} title={p.name}>
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.shortName}
              <span className="font-normal opacity-60 num">{fmtInt(facets.byParty[p.id] ?? 0)}</span>
            </Link>
          ))}
        </FilterRow>
        <FilterRow label="Type">
          <Link href={href({ nature: undefined })} className={`pill ${!f.kind ? "pill-active" : ""}`}>
            Tous
          </Link>
          {kinds.map((k) => (
            <Link key={k} href={href({ nature: f.kind === k ? undefined : k })} className={`pill ${f.kind === k ? "pill-active" : ""}`}>
              {KIND_LABEL[k] ?? k}
              <span className="font-normal opacity-60 num">{fmtInt(facets.byKind[k] ?? 0)}</span>
            </Link>
          ))}
          <Help title="Quels types ?" label={<span className="text-xs text-ink-3 self-center">c&apos;est quoi ?</span>} className="self-center">
            Question au gouvernement : un élu interroge un ministre en direct. Explication de vote : un élu dit pourquoi son groupe vote pour ou contre.
          </Help>
        </FilterRow>
        <FilterRow label="Où">
          <Link href={href({ chambre: undefined })} className={`pill ${!f.chamber ? "pill-active" : ""}`}>
            Partout
          </Link>
          {CHAMBERS.map((c) => (
            <Link key={c.id} href={href({ chambre: f.chamber === c.id ? undefined : c.id })} className={`pill ${f.chamber === c.id ? "pill-active" : ""}`}>
              {c.label}
              <span className="font-normal opacity-60 num">{fmtInt(facets.byChamber[c.id] ?? 0)}</span>
            </Link>
          ))}
        </FilterRow>
      </div>

      {/* ---- Résultats ---- */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-sm text-ink-2">
          <strong className="text-ink num">{fmtInt(total)}</strong> prise{total > 1 ? "s" : ""} de parole{anyFilter ? " correspondent à votre recherche" : " en tout"}, des plus récentes aux plus anciennes.
        </p>
        {pages > 1 && (
          <p className="text-xs text-ink-3 num">
            page {cur} sur {fmtInt(pages)}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <Empty>Rien trouvé. Essayez un autre mot, ou retirez un filtre.</Empty>
      ) : (
        <ul className="space-y-4">
          {rows.map((p) => (
            <PostCard key={p.id} p={p} />
          ))}
        </ul>
      )}

      {pages > 1 && <Pagination cur={cur} pages={pages} href={(n) => href({ page: n > 1 ? String(n) : undefined })} />}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3">
      <span className="text-xs font-semibold text-ink-3 uppercase tracking-wide sm:w-14 sm:pt-1.5 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

function PostCard({ p }: { p: PostRow }) {
  const [head, rest] = cut(p.text, EXCERPT);
  let themes: string[] = [];
  if (p.themes) {
    try {
      themes = (JSON.parse(p.themes) as { theme: string }[]).map((t) => t.theme).slice(0, 3);
    } catch {
      themes = [];
    }
  }
  const speaker = p.politicianName ?? p.handle;
  const where = p.chamber === "AN" ? "Assemblée nationale" : p.chamber === "SENAT" ? "Sénat" : null;
  return (
    <li className="card p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: p.partyColor ?? "var(--border-2)" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {p.politicianId ? (
              <Link href={`/parlementaires/${p.politicianId}`} className="font-semibold hover:underline break-words">
                {speaker}
              </Link>
            ) : (
              <span className="font-semibold break-words">{p.kind === "tweet" ? `@${speaker}` : speaker}</span>
            )}
            {p.partyId && p.partyShort && (
              <Link href={`/partis/${p.partyId}`} className="text-xs font-semibold rounded-full px-2 py-0.5 border hover:underline" style={{ borderColor: p.partyColor ?? undefined, color: "var(--ink-2)" }} title={p.partyName ?? undefined}>
                {p.partyShort}
              </Link>
            )}
            <span className="text-[11px] font-semibold rounded-full bg-accent-soft text-accent-ink px-2 py-0.5">{KIND_LABEL[p.kind] ?? p.kind}</span>
          </div>
          <div className="text-xs text-ink-3 mt-0.5">
            {fmtDate(p.createdAt)}
            {where && <> · {where}</>}
          </div>
        </div>
      </div>

      {p.title && <h3 className="mt-3 text-sm font-semibold text-ink-2 break-words">{p.title}</h3>}

      <div className="mt-2 text-[15px] leading-relaxed text-ink whitespace-pre-line break-words">
        {rest ? (
          <details className="group">
            <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
              {head}
              <span className="group-open:hidden">… </span>
              <span className="group-open:hidden text-accent-ink font-semibold text-sm hover:underline whitespace-nowrap">lire la suite</span>
            </summary>
            <span className="-mt-px">{rest}</span>
          </details>
        ) : (
          head
        )}
      </div>

      {(themes.length > 0 || p.url) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {themes.map((t) => (
            <ThemeChip key={t} id={t} />
          ))}
          {p.url && (
            <OfficialLink href={p.url} an={p.chamber === "AN"} copied className="ml-auto inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink hover:underline">
              source officielle <ExternalLink size={12} />
            </OfficialLink>
          )}
        </div>
      )}
    </li>
  );
}

function Pagination({ cur, pages, href }: { cur: number; pages: number; href: (n: number) => string }) {
  const nums = Array.from(new Set([1, cur - 1, cur, cur + 1, pages].filter((n) => n >= 1 && n <= pages))).sort((a, b) => a - b);
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 pt-2" aria-label="Pages">
      {cur > 1 && (
        <Link href={href(cur - 1)} className="pill">
          ← Précédente
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="text-ink-3">…</span>}
          <Link href={href(n)} className={`pill num ${n === cur ? "pill-active" : ""}`} aria-current={n === cur ? "page" : undefined}>
            {fmtInt(n)}
          </Link>
        </span>
      ))}
      {cur < pages && (
        <Link href={href(cur + 1)} className="pill">
          Suivante →
        </Link>
      )}
    </nav>
  );
}
