/**
 * Adresses des images de partage (utilisables côté serveur et côté client).
 * Formats : `story` 1080×1920 (Instagram/TikTok), `carre` 1080×1080 (posts), `og` 1200×630 (aperçus de liens).
 */
export const SHARE_FORMATS = ["story", "carre", "og"] as const;
export type ShareFormat = (typeof SHARE_FORMATS)[number];

const enc = encodeURIComponent;

export const shareImage = {
  parti: (partyId: string) => `/partager/parti/${enc(partyId)}`,
  partiSujet: (partyId: string, themeId: string) => `/partager/parti/${enc(partyId)}/${enc(themeId)}`,
  sujet: (themeId: string) => `/partager/sujet/${enc(themeId)}`,
  vote: (uid: string) => `/partager/vote/${enc(uid)}`,
  elu: (politicianId: string) => `/partager/elu/${enc(politicianId)}`,
  ecart: (partyId: string, themeId: string) => `/partager/ecart/${enc(partyId)}/${enc(themeId)}`,
};

export const withFormat = (imagePath: string, format: ShareFormat) => `${imagePath}${imagePath.includes("?") ? "&" : "?"}format=${format}`;
