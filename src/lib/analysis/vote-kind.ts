/**
 * Nature d'un scrutin, lue dans son intitulé officiel (règle fixe, sans intelligence artificielle) :
 *   - "detail" : un point précis (amendement, sous-amendement, article) ;
 *   - "global" : un texte entier ou une motion (ensemble d'un texte, motion de rejet ou de censure, résolution) ;
 *   - "autre"  : le reste (rare).
 *
 * Sert au contrôle des votes tactiques : c'est sur les votes « global » que jouent les logiques de camp
 * (voter contre tout un texte pour un seul article, ou par opposition au gouvernement) ; les votes « detail »
 * portent sur un contenu précis.
 */
export type VoteKind = "detail" | "global" | "autre";

export function voteKind(title: string): VoteKind {
  const t = title.toLowerCase().replace(/’/g, "'").trimStart();
  if (/^(l'amendement|les amendements|le sous-amendement|les sous-amendements|l'article|les articles)/.test(t)) return "detail";
  if (/^(l'ensemble|la motion|la proposition de résolution|la déclaration)/.test(t)) return "global";
  return "autre";
}
