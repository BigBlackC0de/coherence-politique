import Link from "next/link";
import { GLOSSARY, VERDICT_PLAIN, themePlain } from "@/lib/config/plain";
import { THEMES, THEME_BY_ID } from "@/lib/config/themes";
import { VOTES_MIN_N } from "@/lib/config/thresholds";
import { voteKindStats } from "@/lib/queries-ecarts";
import { SITE_NAME } from "@/lib/config/site";
import { Card, PageHeader, Verdict } from "@/components/ui";

export const dynamic = "force-dynamic";

const STEPS = [
  { emoji: "📄", title: "1. Ils promettent", text: `Chaque parti publie un programme. ${SITE_NAME} le lit en entier. Sujet par sujet, on note de quel côté il penche : par exemple « plus d'impôts pour les riches » ou « moins d'impôts ».` },
  { emoji: "🗳️", title: "2. Ils votent", text: `À l'Assemblée et au Sénat, des milliers de votes sont notés nom par nom. ${SITE_NAME} lit chaque vote : de quel sujet il parle, et ce que veut dire voter « pour ».` },
  { emoji: "⚖️", title: "3. On compare", text: "Pour chaque parti et chaque sujet, on met côte à côte ce qu'il dit et ce qu'il vote. On en tire un verdict, toujours avec les votes qui le justifient." },
];

export default function ComprendrePage() {
  const stats = voteKindStats();
  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Mode d'emploi" title="Comment ça marche ?" description={`${SITE_NAME} répond à une question simple : les partis font-ils ce qu'ils disent ? Voici la méthode, les mots à connaître et les limites.`} />

      <section className="grid md:grid-cols-3 gap-4">
        {STEPS.map((s) => (
          <Card key={s.title} className="!p-6">
            <div className="text-4xl mb-3" aria-hidden>
              {s.emoji}
            </div>
            <h2 className="text-lg font-bold">{s.title}</h2>
            <p className="text-ink-2 mt-2 leading-relaxed">{s.text}</p>
          </Card>
        ))}
      </section>

      <Card title="Les verdicts" subtitle="ce que veulent dire les étiquettes colorées du site">
        <ul className="grid md:grid-cols-2 gap-3">
          {["coherent", "nuance", "ecart", "contradiction", "insuffisant"].map((k) => (
            <li key={k} className="flex items-start gap-3 rounded-2xl bg-surface-2 p-4">
              <Verdict v={k} size="md" />
              <span className="text-sm text-ink-2 leading-relaxed">{VERDICT_PLAIN[k].explain}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Les sujets">
        <p className="text-ink-2 leading-relaxed">
          Chaque sujet pose une question avec deux réponses opposées. Par exemple : « partir plus tôt à la retraite, ou travailler plus longtemps ? ». Placer une réponse à gauche ou à droite sert à comparer les partis, ce n&apos;est pas un jugement.
        </p>
        <Link href="/themes" className="btn-secondary mt-4">
          Voir les {THEMES.length} sujets →
        </Link>
      </Card>

      <Card id="calcul" className="scroll-mt-20" title="Un vote, de gauche ou de droite : comment on décide ?" subtitle="la règle de calcul, la même pour tous les partis">
        <div className="space-y-4 text-ink-2 leading-relaxed">
          <p>
            <strong className="text-ink">On ne classe pas une loi entière, et jamais selon qui la propose.</strong> On classe chaque vote, sujet par sujet, d&apos;après son
            contenu : ce qu&apos;on adopte quand on vote « pour ». Une mesure qui va du côté « {themePlain("retraites").left} » reste de ce côté, qu&apos;elle soit proposée par la
            gauche, la droite ou le gouvernement. Un même texte peut donc pencher d&apos;un côté sur un sujet et de l&apos;autre sur un autre sujet : un budget, par exemple.
          </p>
          <p>
            Pour trancher, chaque sujet a deux côtés écrits à l&apos;avance (voir <Link href="/themes" className="text-accent-ink font-semibold hover:underline">les sujets</Link>).
            Une intelligence artificielle lit l&apos;intitulé officiel du vote et dit de quel côté va le « pour ». Elle fait attention aux pièges : voter pour une
            « motion de rejet » ou pour la « suppression d&apos;un article », c&apos;est voter contre le texte visé. Les votes de pure procédure (ordre du jour…) ne comptent pas.
            Chaque vote affiche ce classement : s&apos;il est faux, ça se voit.
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <strong className="text-ink">La position d&apos;un groupe</strong> sur un vote, c&apos;est le choix le plus fréquent parmi ses élus qui ont voté, compté nom par nom.
              S&apos;il y a égalité ou si personne n&apos;a voté, le groupe n&apos;a pas de position sur ce vote : il ne compte pas.
            </li>
            <li>
              <strong className="text-ink">Chaque vote donne un point :</strong> +1 s&apos;il pousse vers un côté, −1 vers l&apos;autre. « Pour » suit le sens du texte,
              « contre » va dans le sens inverse, l&apos;abstention vaut 0 (elle tire vers le milieu).
            </li>
            <li>
              <strong className="text-ink">Les votes n&apos;ont pas tous le même poids :</strong> de 1 pour un amendement mineur à 5 pour un texte majeur, une motion de
              censure ou un budget.
            </li>
            <li>
              <strong className="text-ink">La position du parti</strong> est la moyenne pondérée de tous ses votes sur le sujet, de −1 (un côté) à +1 (l&apos;autre). Elle n&apos;est
              affichée qu&apos;à partir de {VOTES_MIN_N} votes.
            </li>
          </ol>
        </div>
      </Card>

      <Card id="votes-tactiques" className="scroll-mt-20" title="Et les votes tactiques ?" subtitle="quand un parti vote contre un texte proche de ses idées">
        <div className="space-y-4 text-ink-2 leading-relaxed">
          <p>
            Ça arrive souvent, et pour plusieurs raisons : ne pas soutenir le gouvernement, refuser un texte jugé trop timide, rejeter tout un texte à cause d&apos;un seul
            article. Exemple réel : en novembre 2025, l&apos;
            <Link href="/scrutins/VTANR5L17V3684" className="text-accent-ink font-semibold hover:underline">
              article qui suspendait la réforme des retraites
            </Link>{" "}
            a reçu des votes contre de députés pourtant opposés à la retraite à 64 ans. Ils ont dit en séance que le texte ne faisait que retarder la réforme et
            voulaient revenir durablement à un âge plus bas (la page du vote le raconte). Voici comment le site traite ces cas.
          </p>
          <ul className="space-y-3">
            <li className="rounded-2xl bg-surface-2 p-4">
              <strong className="text-ink">1. On compte ce qu&apos;ils votent, pas ce qu&apos;on devine de leurs intentions.</strong> Un vote tactique reste un vote : c&apos;est lui
              qui fait passer ou tomber la loi. Personne ne peut lire dans les têtes. Un site qui « corrigerait » les votes qu&apos;il juge tactiques choisirait à la place
              du lecteur, et pourrait le faire plus pour un parti que pour un autre. Aucun vote n&apos;est donc retiré ni retourné.
            </li>
            <li className="rounded-2xl bg-surface-2 p-4">
              <strong className="text-ink">2. Le nombre noie la tactique.</strong> Les calculs politiques jouent surtout sur les votes de texte entier (vote final, motion de
              rejet ou de censure). Il y en a {stats.global.toLocaleString("fr-FR")} dans la base, contre {stats.detail.toLocaleString("fr-FR")} votes sur un amendement ou
              un article, où l&apos;on se prononce sur un contenu précis. Même avec leur poids plus fort, les votes de texte entier ne font que{" "}
              {Math.round(stats.globalWeightShare * 100)} % du calcul. Quelques votes tactiques ne peuvent pas retourner une position bâtie sur des centaines de votes.
            </li>
            <li className="rounded-2xl bg-surface-2 p-4">
              <strong className="text-ink">3. Un contrôle automatique les repère.</strong> Pour chaque parti et chaque sujet, on refait le calcul deux fois : une fois avec
              les seuls votes article par article, une fois avec les seuls votes de texte entier. Le type de vote est lu dans l&apos;intitulé officiel, sans intelligence
              artificielle. Si les deux résultats penchent de côtés opposés, la page du parti l&apos;affiche avec ⚠️. Ça ne prouve pas une manœuvre : souvent, c&apos;est un texte
              final de compromis voté par presque tout le monde, ou un texte qui mélange des mesures dans les deux sens.
            </li>
            <li className="rounded-2xl bg-surface-2 p-4">
              <strong className="text-ink">4. Les raisons sont données, avec leurs sources.</strong> Pour les votes importants, la rubrique « Pourquoi ils ont voté comme
              ça » résume ce que chaque groupe a dit en séance avant le vote, d&apos;après le compte rendu officiel. L&apos;explication de chaque sujet tient compte de la
              logique opposition / majorité, sans pour autant tout excuser.
            </li>
            <li className="rounded-2xl bg-surface-2 p-4">
              <strong className="text-ink">5. Chaque député est aussi compté seul.</strong> La position du groupe peut cacher des élus qui ont voté autrement. Leur fiche
              donne leurs votes un par un et leur taux de désaccord avec leur groupe.
            </li>
          </ul>
          <div>
            <h3 className="font-semibold text-ink">
              Le contrôle aujourd&apos;hui : {stats.diverging.length} cas sur {stats.compared} comparaisons possibles
            </h3>
            {stats.diverging.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {stats.diverging.map((c) => (
                  <li key={`${c.partyId}|${c.themeId}`}>
                    <Link href={`/partis/${c.partyId}#${c.themeId}`} className="pill !text-sm !py-1.5 hover:underline">
                      {c.shortName} · {THEME_BY_ID[c.themeId]?.label ?? c.themeId}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm mt-1">Aucun parti ne vote dans un sens article par article et dans l&apos;autre sur les textes entiers.</p>
            )}
          </div>
        </div>
      </Card>

      <Card title="Le petit lexique" subtitle="les mots que vous croiserez sur le site, expliqués simplement">
        <dl className="grid md:grid-cols-2 gap-x-8 gap-y-4">
          {Object.entries(GLOSSARY).map(([k, g]) => (
            <div key={k} className="border-b border-border pb-3">
              <dt className="font-semibold">{g.title}</dt>
              <dd className="text-sm text-ink-2 mt-0.5 leading-relaxed">{g.text}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="Ce que ce site ne dit pas">
        <ul className="list-disc pl-5 space-y-2 text-ink-2 leading-relaxed">
          <li>
            <strong className="text-ink">Qui a raison.</strong> « Gauche » et « droite » servent à comparer, pas à juger. Tenir parole ne veut pas dire avoir raison. Et un écart n&apos;est pas forcément un mensonge : un parti d&apos;opposition vote souvent contre des textes qu&apos;il aurait pu soutenir.
          </li>
          <li>
            <strong className="text-ink">Tout le travail des élus.</strong> Seuls les votes notés nom par nom sont visibles. Le travail en commission, les rapports et le terrain n&apos;apparaissent pas.
          </li>
          <li>
            <strong className="text-ink">Une vérité définitive.</strong> Les textes sont lus par une intelligence artificielle, qui peut se tromper. C&apos;est pourquoi chaque verdict cite ses votes : la preuve est à un clic.
          </li>
        </ul>
      </Card>
    </div>
  );
}
