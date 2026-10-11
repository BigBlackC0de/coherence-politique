import type { Metadata } from "next";
import { headers } from "next/headers";
import { withFormat, shareImage } from "./paths";
import { getParty } from "../queries";
import { politicianBrief, scrutinBrief } from "../queries-share";
import { THEMES, THEME_BY_ID } from "../config/themes";
import { themePlain } from "../config/plain";
import { SITE_NAME } from "../config/site";

/**
 * Métadonnées Open Graph / Twitter des pages partageables : titre, description et image
 * générée par `/partager/...?format=og` (1200×630).
 */

/** Adresse publique du site : COHERENCE_PUBLIC_URL, sinon l'hôte de la requête (sans barre finale). */
export async function siteOrigin(): Promise<string> {
  const env = process.env.COHERENCE_PUBLIC_URL?.trim();
  if (env) {
    try {
      return new URL(env).toString().replace(/\/+$/, "");
    } catch {
      /* valeur invalide : on retombe sur la requête */
    }
  }
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000").split(",")[0].trim().toLowerCase().replace(/[^a-z0-9.:-]/g, "").slice(0, 100) || "localhost:3000";
  const fwd = h.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = fwd === "http" || fwd === "https" ? fwd : /^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https";
  return `${proto}://${host}`;
}

export async function shareMetadata(o: { title: string; description: string; path: string; image: string; alt: string }): Promise<Metadata> {
  const origin = await siteOrigin();
  const image = `${origin}${withFormat(o.image, "og")}`;
  return {
    title: o.title,
    description: o.description,
    openGraph: {
      title: `${o.title} · ${SITE_NAME}`,
      description: o.description,
      url: `${origin}${o.path}`,
      siteName: SITE_NAME,
      locale: "fr_FR",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: o.alt, type: "image/png" }],
    },
    twitter: { card: "summary_large_image", title: `${o.title} · ${SITE_NAME}`, description: o.description, images: [{ url: image, alt: o.alt }] },
  };
}

const cut = (s: string, n = 200) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

/* ---- Métadonnées prêtes à l'emploi, une par page partageable (lectures légères) ---- */

export async function partyMetadata(id: string): Promise<Metadata> {
  const p = getParty(id);
  if (!p) return {};
  return shareMetadata({
    title: p.name,
    description: `Ce que ${p.name} promet, ce que ses élus votent au Parlement, et l’écart entre les deux, sujet par sujet. Avec les votes qui le prouvent.`,
    path: `/partis/${p.id}`,
    image: shareImage.parti(p.id),
    alt: `Les positions de ${p.name} sur ${THEMES.length} sujets : programme et votes`,
  });
}

export async function themeMetadata(id: string): Promise<Metadata> {
  const t = THEME_BY_ID[id];
  if (!t) return {};
  const pl = themePlain(id);
  return shareMetadata({
    title: t.label,
    description: `${pl.question} Où se placent les partis, d’après leurs programmes et leurs votes au Parlement.`,
    path: `/themes/${id}`,
    image: shareImage.sujet(id),
    alt: `${t.label} : la position de chaque parti, programme et votes`,
  });
}

export async function politicianMetadata(id: string): Promise<Metadata> {
  const p = politicianBrief(id);
  if (!p) return {};
  const role = p.chamber === "SENAT" ? "Sénateur·rice" : "Député·e";
  const where = [p.partyName ?? (p.groupAbbrev ? `groupe ${p.groupAbbrev}` : null), p.department].filter(Boolean).join(", ");
  return shareMetadata({
    title: p.fullName,
    description: `${role}${where ? ` (${where})` : ""} : présence aux votes, votes contre son groupe et votes les plus importants.`,
    path: `/parlementaires/${p.id}`,
    image: shareImage.elu(p.id),
    alt: `${p.fullName} : présence aux votes et votes contre son groupe`,
  });
}

export async function scrutinMetadata(uid: string): Promise<Metadata> {
  const s = scrutinBrief(uid);
  if (!s) return {};
  const title = cut(s.summary ?? s.title, 90);
  const chamber = s.chamber === "SENAT" ? "au Sénat" : "à l’Assemblée nationale";
  return shareMetadata({
    title,
    description: cut(`${s.sort ? `${s.sort[0].toUpperCase()}${s.sort.slice(1)} ${chamber}` : `Vote ${chamber}`} le ${new Date(s.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}. ${s.stakes ?? ""} Qui a voté quoi, parti par parti.`),
    path: `/scrutins/${s.uid}`,
    image: shareImage.vote(s.uid),
    alt: `Résultat du vote et position de chaque groupe`,
  });
}

export async function ecartMetadata(partyId: string, themeId: string): Promise<Metadata> {
  const p = getParty(partyId);
  const t = THEME_BY_ID[themeId];
  if (!p || !t) return {};
  return shareMetadata({
    title: `${p.shortName} · ${t.label} : programme, votes, discours`,
    description: `Ce que ${p.name} écrit dans son programme, ce que votent ses députés et ce que disent ses élus sur le sujet « ${t.label} ». Avec les citations et les votes qui le prouvent.`,
    path: `/ecarts/${p.id}/${themeId}`,
    image: shareImage.ecart(p.id, themeId),
    alt: `${p.name}, ${t.label} : programme, votes et discours sur un même axe`,
  });
}
