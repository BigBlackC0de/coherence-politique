/**
 * Logo de Cohérence-Politique : deux cercles qui se recouvrent (ce qui est dit, ce qui est fait)
 * et, dans la zone commune, des barres alignées (la cohérence).
 * Tracé en SVG pour suivre le thème (couleur = `currentColor`) et rester net à toutes les tailles.
 * Aussi utilisé dans les images de partage (Satori) : pas de hook, couleur explicite possible.
 */
const BARS =
  "M633.5 757.7L661.5 742.4L661.5 872.4L633.5 887.7ZM710.5 722.5L738.5 714.9L738.5 844.9L710.5 852.5ZM787 708.3L815 708.3L815 838.3L787 838.3ZM864 715L892 722.7L892 852.7L864 845ZM941 742.7L969 758L969 888L941 872.7Z";

export function Logo({ height = 40, color = "currentColor", title }: { height?: number; color?: string; title?: string }) {
  // Zone utile du dessin : 1040 × 800 (cercles de 28 de trait), marge de 12.
  const w = Math.round((height * 1064) / 824);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="271 393 1064 824" width={w} height={height} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ display: "block", flexShrink: 0 }}>
      <circle cx="683" cy="805" r="386" fill="none" stroke={color} strokeWidth="28" />
      <circle cx="923" cy="805" r="386" fill="none" stroke={color} strokeWidth="28" />
      <path d={BARS} fill={color} />
    </svg>
  );
}
