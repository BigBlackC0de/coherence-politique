/**
 * Position d'un groupe sur un scrutin : le choix le plus fréquent parmi ses élus qui ont voté.
 * Égalité, ou aucun membre votant : pas de position (null) — le groupe est divisé ou absent.
 * On ne reprend pas la « position majoritaire » publiée par l'Assemblée, qui contredit parfois le décompte nominatif.
 * Même règle que la migration 0006 et pour les deux chambres.
 */
export function majorityPosition(pour: number, contre: number, abstentions: number): "pour" | "contre" | "abstention" | null {
  if (pour > contre && pour > abstentions) return "pour";
  if (contre > pour && contre > abstentions) return "contre";
  if (abstentions > pour && abstentions > contre) return "abstention";
  return null;
}
