/**
 * Seuils de fiabilité des « écarts » (programme / votes / discours).
 *
 * Règle : un repère n'est affiché, et ne peut déclencher une alerte, que s'il repose sur
 * assez d'éléments. Les mêmes seuils s'appliquent à tous les partis et à tous les sujets.
 * Toute la logique d'affichage (barres, liste « Les grands écarts », page de preuves)
 * lit ces constantes : les changer ici les change partout.
 */

/**
 * Discours : au moins 8 prises de parole positionnées sur le sujet…
 * Les positions vont de −1 à +1 ; avec un écart-type typique de 0,5 entre interventions,
 * la moyenne de 8 éléments a une marge d'erreur d'environ ±0,35 (2 × 0,5 / √8), en dessous
 * du seuil d'alerte (0,6) : un écart signalé ne peut pas venir du seul hasard d'un tirage.
 */
export const DISCOURS_MIN_POSTS = 8;
/** …venant d'au moins 3 orateurs différents, pour qu'un seul élu très bavard ne fasse pas « le discours » du parti. */
export const DISCOURS_MIN_SPEAKERS = 3;

/**
 * Programme : somme des indices de confiance des lectures de programme ≥ 0,5,
 * soit au moins un document qui traite clairement du sujet (ou plusieurs qui l'abordent en passant).
 * En dessous, le programme ne fait qu'effleurer le sujet.
 */
export const PROGRAMME_MIN_CONFIDENCE = 0.5;

/** Votes : au moins 10 votes nom par nom à l'Assemblée classés sur le sujet. */
export const VOTES_MIN_N = 10;

/**
 * Alerte : écart d'au moins 0,6 entre deux repères fiables, sur une échelle qui va de −1 à +1
 * (soit 30 % de la largeur). C'est le même seuil que « gros écart » ailleurs sur le site.
 */
export const ALERT_GAP = 0.6;

/**
 * Et les deux repères extrêmes ne doivent pas pencher du même côté : « un peu » et « nettement »
 * du même côté, c'est une différence d'intensité, pas un discours contraire aux votes.
 * Un repère « au milieu » (|position| < 0,1, voir `stanceWords`) compte comme un côté à part.
 */
export const CENTER_BAND = 0.1;
export const sideOf = (v: number) => (Math.abs(v) < CENTER_BAND ? 0 : Math.sign(v));
