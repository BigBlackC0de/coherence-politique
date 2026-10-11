import type { Metadata } from "next";
import { Mona_Sans } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { isAdmin, adminMode } from "@/lib/auth";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/config/site";

const mona = Mona_Sans({ variable: "--font-mona", subsets: ["latin", "latin-ext"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: { default: `${SITE_NAME} — ${SITE_TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
};

export const dynamic = "force-dynamic";

/** Applique le thème mémorisé avant le premier rendu pour éviter le flash clair/sombre. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('coherence-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const admin = await isAdmin();
  const mode = adminMode();
  return (
    <html lang="fr" className={`${mona.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <Nav admin={admin} canLogin={mode === "token"} />
        <main className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10 py-6 md:py-10 flex-1">{children}</main>
        <footer className="border-t border-border mt-12 bg-surface">
          <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10 py-8 grid gap-4 md:grid-cols-[1fr_auto] text-sm text-ink-3">
            <p className="max-w-3xl leading-relaxed">
              {SITE_NAME} est un site citoyen indépendant, sans parti pris : la même méthode pour tous les partis. Les données viennent de sources officielles (Assemblée nationale, Sénat, sites des partis). Les textes sont lus avec l&apos;aide d&apos;une intelligence artificielle, qui peut se tromper. C&apos;est pourquoi chaque chiffre renvoie aux votes qui le justifient : vérifiez-les.
            </p>
            <p className="md:text-right">
              <a href="/comprendre" className="hover:underline font-medium text-ink-2">
                Comment ça marche ?
              </a>
              {mode === "token" && !admin && (
                <>
                  {" · "}
                  <a href="/admin" className="hover:underline">
                    connexion
                  </a>
                </>
              )}
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
