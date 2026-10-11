import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Police des images de partage : Mona Sans, la même que le site.
 *
 * `next/font` sert du woff2, que Satori (moteur de `ImageResponse`) ne lit pas : il faut du TTF/OTF.
 *  1. Hors ligne : fichiers TTF statiques versionnés dans `assets/fonts/MonaSans-{400,600,800}.ttf`
 *     (licence SIL OFL, récupérés depuis Google Fonts : `fonts.googleapis.com/css2?family=Mona+Sans:wght@400;600;800`
 *     appelé sans user-agent de navigateur renvoie des liens .ttf).
 *  2. Si les fichiers manquent : même téléchargement à la volée depuis Google Fonts, gardé en mémoire.
 *  3. Si tout échoue : police par défaut de `next/og` (Geist), l'image reste générée.
 */

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: "normal" };
const WEIGHTS = [400, 600, 800] as const;
export const FONT_FAMILY = "Mona Sans";

let cached: Promise<OgFont[]> | null = null;

const toArrayBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function fromDisk(): Promise<OgFont[]> {
  const dir = path.join(process.cwd(), "assets", "fonts");
  return Promise.all(WEIGHTS.map(async (weight) => ({ name: FONT_FAMILY, weight, style: "normal" as const, data: toArrayBuffer(await readFile(path.join(dir, `MonaSans-${weight}.ttf`))) })));
}

async function fromGoogle(): Promise<OgFont[]> {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=Mona+Sans:wght@${WEIGHTS.join(";")}`, { signal: AbortSignal.timeout(5000) }).then((r) => r.text());
  const out: OgFont[] = [];
  for (const block of css.split("@font-face").slice(1)) {
    const w = Number(/font-weight:\s*(\d+)/.exec(block)?.[1]);
    const url = /src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/.exec(block)?.[1];
    if (!url || !WEIGHTS.includes(w as (typeof WEIGHTS)[number])) continue;
    const data = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => r.arrayBuffer());
    out.push({ name: FONT_FAMILY, weight: w as OgFont["weight"], style: "normal", data });
  }
  if (!out.length) throw new Error("aucune police TTF trouvée");
  return out;
}

export function loadFonts(): Promise<OgFont[]> {
  cached ??= fromDisk()
    .catch(() => fromGoogle())
    .catch((e) => {
      console.warn(`[partager] police Mona Sans indisponible, police par défaut utilisée : ${String(e)}`);
      cached = null; // on retentera à la prochaine image
      return [];
    });
  return cached;
}
