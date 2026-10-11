"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, LogOut, Search } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { SearchBox } from "./search-box";
import { SITE_NAME } from "@/lib/config/site";
import { Logo } from "./logo";

/**
 * Architecture du site public : six rubriques, certaines avec des sous-onglets.
 * Les anciennes pages gardent leur adresse : elles sont simplement rangées dans une rubrique.
 */
interface Section {
  href: string;
  label: string;
  /** Préfixes d'URL qui appartiennent à la rubrique. */
  match: string[];
  tabs?: { href: string; label: string; match?: string[] }[];
  admin?: boolean;
}

const SECTIONS: Section[] = [
  {
    href: "/partis",
    label: "Partis",
    match: ["/partis", "/comparer", "/programmes"],
    tabs: [
      { href: "/partis", label: "Les partis" },
      { href: "/comparer", label: "Comparer" },
      { href: "/programmes", label: "Programmes" },
    ],
  },
  { href: "/themes", label: "Sujets", match: ["/themes"] },
  {
    href: "/scrutins",
    label: "Votes",
    match: ["/scrutins", "/prises-de-parole"],
    tabs: [
      { href: "/scrutins", label: "Les votes" },
      { href: "/prises-de-parole", label: "Prises de parole" },
    ],
  },
  {
    href: "/parlementaires",
    label: "Élus",
    match: ["/parlementaires", "/assiduite"],
    tabs: [
      { href: "/parlementaires", label: "Trouver un élu" },
      { href: "/assiduite", label: "Présence" },
    ],
  },
  { href: "/candidats", label: "Candidats 2027", match: ["/candidats"] },
  { href: "/comprendre", label: "Comprendre", match: ["/comprendre"] },
];
const ADMIN_SECTIONS: Section[] = [
  { href: "/demander", label: "Demander", match: ["/demander"], admin: true },
  { href: "/sources", label: "Données & jobs", match: ["/sources", "/admin"], admin: true },
];

const startsWith = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);

export function Nav({ admin, canLogin }: { admin: boolean; canLogin: boolean }) {
  const path = usePathname();
  // Le menu reste ouvert pour la page où on l'a ouvert : toute navigation (lien, recherche) le referme.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? path : null);
  const sections = admin ? [...SECTIONS, ...ADMIN_SECTIONS] : SECTIONS;
  const current = sections.find((s) => s.match.some((m) => startsWith(path, m)));
  const tabActive = (href: string) => startsWith(path, href);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 flex items-center gap-3 h-[72px]">
          <Link href="/" className="flex items-center gap-3 font-extrabold tracking-tight text-lg sm:text-xl shrink-0" onClick={() => setOpen(false)} aria-label={`${SITE_NAME} : accueil`}>
            <Logo height={46} />
            <span className="hidden min-[400px]:inline">{SITE_NAME}</span>
          </Link>
          <nav className="hidden lg:flex gap-0.5 text-[15px] ml-4" aria-label="Rubriques">
            {sections.map((s) => (
              <Link key={s.href} href={s.href} aria-current={current === s ? "page" : undefined} className={`px-3 py-2 rounded-full whitespace-nowrap font-semibold transition-colors ${current === s ? "bg-ink text-bg" : "text-ink-2 hover:text-ink hover:bg-surface-2"} ${s.admin ? "border border-dashed border-border-2" : ""}`}>
                {s.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {!startsWith(path, "/recherche") && <SearchBox className="hidden xl:flex w-64" placeholder="Rechercher un élu, un vote…" />}
            {/* Les classes .btn-* ne sont pas dans une couche Tailwind : on masque via un conteneur. */}
            <span className={`xl:hidden ${startsWith(path, "/recherche") ? "hidden" : ""}`}>
              <Link href="/recherche" className="btn-ghost !p-2" aria-label="Rechercher" title="Rechercher un élu, un vote, un sujet…">
                <Search size={20} />
              </Link>
            </span>
            {admin && canLogin && (
              <form action="/api/admin/logout" method="post">
                <button className="btn-ghost !px-2 text-xs" title="Se déconnecter de l'administration">
                  <LogOut size={14} /> <span className="hidden sm:inline">Admin</span>
                </button>
              </form>
            )}
            <ThemeToggle />
            <span className="lg:hidden">
              <button className="btn-ghost !p-2" onClick={() => setOpen((o) => !o)} aria-label={open ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={open}>
                {open ? <X size={22} /> : <Menu size={22} />}
              </button>
            </span>
          </div>
        </div>
        {open && (
          <nav className="lg:hidden border-t border-border bg-surface px-4 py-4 space-y-3 max-h-[calc(100dvh-72px)] overflow-y-auto" aria-label="Menu">
            <SearchBox className="w-full" />
            <ul className="space-y-1">
              {sections.map((s) => (
                <li key={s.href}>
                  <Link href={s.href} onClick={() => setOpen(false)} className={`flex px-4 py-3 rounded-2xl text-[17px] font-semibold ${current === s ? "bg-ink text-bg" : "text-ink hover:bg-surface-2"} ${s.admin ? "border border-dashed border-border-2" : ""}`}>
                    {s.label}
                  </Link>
                  {s.tabs && (
                    <div className="flex flex-wrap gap-1.5 pl-4 pt-1.5 pb-1">
                      {s.tabs.slice(1).map((t) => (
                        <Link key={t.href} href={t.href} onClick={() => setOpen(false)} className={`pill ${tabActive(t.href) ? "pill-active" : ""}`}>
                          {t.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      {current?.tabs && (
        <div className="border-b border-border bg-surface">
          <nav className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 flex gap-1 overflow-x-auto" aria-label={`Rubrique ${current.label}`}>
            {current.tabs.map((t) => {
              const active = tabActive(t.href);
              return (
                <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`shrink-0 px-3 py-3 text-[15px] font-semibold border-b-[3px] -mb-px transition-colors ${active ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
