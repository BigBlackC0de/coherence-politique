import { z } from "zod";
import { THEME_IDS } from "../config/themes";

const ThemeId = z.enum(THEME_IDS);

/* ---- Classification des scrutins ---- */
export const ScrutinClassification = z.object({
  uid: z.string(),
  summary: z.string().describe("Résumé en une phrase, en français, de ce sur quoi porte le vote (sans jargon)."),
  stakes: z.string().describe("Enjeu concret pour les citoyens en une phrase. Vide si purement procédural."),
  is_procedural: z.boolean().describe("true si vote de procédure sans portée politique de fond (renvoi, ordre du jour, motion de rejet préalable technique...)."),
  salience: z.number().int().min(1).max(5).describe("Importance politique : 1 amendement mineur … 5 texte structurant / motion de censure / budget / réforme majeure."),
  themes: z
    .array(
      z.object({
        theme: ThemeId,
        direction: z
          .number()
          .int()
          .min(-1)
          .max(1)
          .describe("Sens d'un vote POUR sur l'axe du thème : +1 si voter POUR rapproche du pôle +1, -1 si voter POUR rapproche du pôle -1, 0 si le vote n'oriente pas l'axe."),
        weight: z.number().min(0).max(1).describe("Part du thème dans ce vote (le principal ≈ 1)."),
      }),
    )
    .max(3)
    .describe("1 à 3 thèmes, le principal en premier. Tableau vide si purement procédural ou hors taxonomie."),
});
export const ScrutinBatchOutput = z.object({ results: z.array(ScrutinClassification) });

/* ---- Analyse d'un programme ---- */
export const ProgrammeAnalysis = z.object({
  title: z.string().describe("Titre du document tel qu'identifié."),
  party_confirmed: z.boolean().describe("true si le document est bien un programme/plateforme officiel du parti indiqué."),
  period: z.string().describe("Élection ou période visée (ex. 'Législatives 2024', 'Présidentielle 2027')."),
  overall_summary: z.string().describe("Résumé en 5 à 8 phrases des grandes orientations."),
  themes: z.array(
    z.object({
      theme: ThemeId,
      addressed: z.boolean(),
      stance: z.number().min(-1).max(1).describe("Position sur l'axe du thème, de -1 (pôle gauche) à +1 (pôle droite). 0 = centre ou équilibré."),
      confidence: z.number().min(0).max(1),
      summary: z.string().describe("Position du parti sur ce thème en 2-3 phrases."),
      measures: z.array(z.string()).describe("Mesures concrètes, formulées précisément (chiffres, âges, montants)."),
      quotes: z.array(z.string()).describe("Citations courtes et littérales du document (max 3)."),
    }),
  ),
});

/* ---- Découverte des sources de programme ---- */
export const DiscoveredSources = z.object({
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      kind: z.enum(["programme", "manifeste", "communique", "autre"]),
      is_pdf: z.boolean(),
      is_official: z.boolean().describe("true si hébergé par le parti ou sa campagne officielle."),
      period: z.string(),
      why: z.string(),
    }),
  ),
});

/* ---- Analyse de tweets ---- */
export const PostAnalysis = z.object({
  id: z.string(),
  is_political: z.boolean(),
  tone: z.enum(["factuel", "attaque", "promesse", "emotion", "autopromotion", "autre"]),
  themes: z.array(z.object({ theme: ThemeId, stance: z.number().min(-1).max(1) })).max(3),
  claims: z
    .array(
      z.object({
        claim: z.string().describe("Affirmation reformulée de façon neutre et vérifiable."),
        theme: ThemeId.nullable(),
        kind: z.enum(["fait", "promesse", "vote-revendique", "attaque", "autre"]),
        checkable: z.boolean().describe("true si vérifiable avec des votes parlementaires ou un programme."),
      }),
    )
    .max(3),
});
export const PostBatchOutput = z.object({ results: z.array(PostAnalysis) });

/* ---- Synthèse de cohérence parti × thème ---- */
export const CoherenceSynthesis = z.object({
  verdict: z.enum(["coherent", "nuance", "ecart", "contradiction", "insuffisant"]),
  narrative: z.string().describe("Analyse en 4 à 8 phrases : ce que le parti dit, ce qu'il vote, l'écart, avec des exemples de scrutins précis (date + objet)."),
  key_evidence: z.array(z.object({ scrutinUid: z.string(), note: z.string() })).max(6),
});

/* ---- Vérification d'affirmation ---- */
export const ClaimCheck = z.object({
  verdict: z.enum(["confirme", "nuance", "contredit", "inverifiable"]),
  explanation: z.string(),
  evidence: z.array(z.object({ scrutinUid: z.string(), note: z.string() })).max(5),
});

export type ScrutinClassificationT = z.infer<typeof ScrutinClassification>;
export type ProgrammeAnalysisT = z.infer<typeof ProgrammeAnalysis>;
export type PostAnalysisT = z.infer<typeof PostAnalysis>;

/* ---- Explication d'un vote à partir du débat en séance ---- */
export const VoteExplanationOutput = z.object({
  titre: z.string().describe("Titre clair d'une ligne (≤ 110 caractères) qui dit ce que PROPOSE le texte mis aux voix, c'est-à-dire ce qu'on adopte en votant POUR, quel que soit le résultat. Sans numéro d'amendement ni d'article. Ex. pour un amendement de suppression : « Supprimer la plainte en ligne pour les Français de l'étranger victimes de violences »."),
  enjeu: z.string().describe("Ce qui était concrètement voté, en 2 à 3 phrases simples (niveau collège) : le contenu réel de l'amendement ou de l'article, pas son numéro. Pour une suppression, dire ce que la mesure supprimée prévoyait."),
  si_adopte: z.string().describe("Ce qui change concrètement si le vote est adopté, en une phrase. Vide si sans objet."),
  piege_question: z
    .string()
    .describe("Si le vote peut sembler paradoxal ou trompeur pour un lecteur non initié, la question qu'il se pose, en une phrase complète qui se comprend SEULE (dire qui a voté quoi et sur quoi, sans « l'amendement » ni « la rapporteure » non présentés). Ex. : « Pourquoi presque tous les groupes ont-ils refusé que toutes les victimes puissent porter plainte en ligne ? ». Chaîne vide si rien de surprenant."),
  piege_reponse: z
    .string()
    .describe("La réponse, en 2 à 3 phrases très simples (niveau collège), avec le contexte nécessaire : ce qui existe déjà, ce que les opposants craignaient, ce qu'un vote pour ou contre change vraiment. Présente chaque acteur (« la députée chargée du texte », « le ministre de l'Intérieur »). Chaîne vide si pas de question."),
  arguments_pour: z.array(z.string()).max(3).describe("Principaux arguments avancés en séance pour l'adoption, une phrase chacun, sans attribution partisane."),
  arguments_contre: z.array(z.string()).max(3).describe("Principaux arguments avancés en séance contre l'adoption, une phrase chacun."),
  groupes: z
    .array(
      z.object({
        groupe: z.string().describe("Identifiant du groupe tel que fourni entre crochets, ex. PO845413."),
        raison: z.string().describe("Pourquoi ce groupe a voté ainsi, en 1 à 2 phrases, UNIQUEMENT d'après ce que ses membres ont dit dans le débat fourni. Chaîne vide si aucun membre du groupe ne s'est exprimé."),
        citation: z.string().describe("Extrait mot pour mot (≤ 250 caractères) d'une intervention d'un membre du groupe qui justifie le vote. Chaîne vide si aucun."),
        intervention: z.number().int().describe("Numéro [T…] de l'intervention citée, 0 si aucune."),
      }),
    )
    .describe("Un élément par groupe listé, dans le même ordre."),
  fiabilite: z.enum(["bonne", "partielle", "faible"]).describe("bonne : la plupart des groupes ont expliqué leur vote ; partielle : quelques-uns ; faible : le débat ne permet presque pas de comprendre les votes."),
});
export type VoteExplanationOutput = z.infer<typeof VoteExplanationOutput>;

/* ---- Présidentielle : liste des candidats ---- */
const SourceRef = z.object({
  url: z.string().describe("URL exacte et complète de la page consultée (https://…)."),
  publisher: z.string().describe("Nom du média ou de l’institution (ex. Le Monde, AFP, HATVP, Assemblée nationale, Wikipédia)."),
  date: z.string().nullable().describe("Date de publication AAAA-MM-JJ (ou AAAA-MM) si connue, sinon null."),
  title: z.string().nullable().describe("Titre de l’article ou de la page, si connu."),
});

export const CandidateListOutput = z.object({
  candidates: z.array(
    z.object({
      full_name: z.string(),
      first_name: z.string(),
      last_name: z.string(),
      party_label: z.string().describe("Parti, mouvement ou soutien tel que rapporté par la presse (ex. « Rassemblement national », « sans étiquette »)."),
      party_id: z.string().nullable().describe("Identifiant Cohérence-Politique du parti s’il figure dans la liste fournie, sinon null."),
      status: z.enum(["declare", "pressenti", "retire"]).describe("declare : candidature annoncée publiquement par l’intéressé ; pressenti : candidature très probable selon la presse mais non annoncée ; retire : a renoncé."),
      declared_at: z.string().nullable().describe("Date de l’annonce de candidature AAAA-MM-JJ si declare, sinon null."),
      status_source: SourceRef.describe("Article de presse indépendant qui rapporte la déclaration ou la candidature pressentie."),
      wikipedia_fr_title: z.string().nullable().describe("Titre exact de l’article Wikipédia en français, si existant."),
      official_site: z.string().nullable().describe("Site personnel ou de campagne du candidat, s’il en a un (pour l’exclure des sources)."),
    }),
  ),
});
export type CandidateListOutputT = z.infer<typeof CandidateListOutput>;

/* ---- Présidentielle : fiche biographique ---- */
const Fact = z.object({
  text: z.string().describe("Un fait vérifiable en 1 à 2 phrases, sans adjectif de jugement."),
  sources: z.array(SourceRef).min(1).describe("Au moins une source indépendante du candidat."),
});
export const CandidateProfileOutput = z.object({
  birth_date: z.string().nullable().describe("AAAA-MM-JJ."),
  birth_place: z.string().nullable().describe("Ville (département ou pays)."),
  tagline: z.string().describe("Une ligne factuelle (≤ 120 caractères) : fonction actuelle ou principale. Ex. « Député de la Somme depuis 2017, président du parti X depuis 2022 »."),
  summary: Fact.describe("Présentation factuelle en 2 à 3 phrases."),
  identity: z.array(Fact).describe("Identité : naissance, nationalité, situation familiale publique. 1 à 3 faits."),
  family: z.array(Fact).describe("Parcours familial et origines sociales : professions des parents, milieu, lieu de jeunesse — uniquement d’après des sources indépendantes. 1 à 4 faits."),
  education: z.array(Fact).describe("Études et diplômes (établissements, années, diplôme obtenu ou non). 1 à 4 faits."),
  career: z.array(Fact).describe("Carrière professionnelle hors politique (ou absence de carrière hors politique, si établi). 1 à 4 faits."),
  political: z.array(Fact).describe("Parcours politique : adhésions, fonctions partisanes, ruptures, campagnes précédentes. 2 à 5 faits."),
  mandates: z
    .array(
      z.object({
        role: z.string().describe("Ex. Député, Maire, Ministre de…, Député européen."),
        institution: z.string().describe("Ex. Assemblée nationale (Somme, 1re circ.), Ville de …, Gouvernement X."),
        start: z.string().nullable().describe("AAAA-MM-JJ ou AAAA."),
        end: z.string().nullable().describe("AAAA-MM-JJ ou AAAA ; null si en cours."),
        sources: z.array(SourceRef).min(1),
      }),
    )
    .describe("Mandats électifs et fonctions gouvernementales, du plus récent au plus ancien. Sources institutionnelles de préférence."),
  assets: z.array(Fact).describe("Patrimoine et intérêts déclarés (HATVP) : montants ou éléments principaux tels que publiés, avec la date de la déclaration. 0 à 3 faits."),
  positions: z.array(Fact).describe("2 à 4 positions ou propositions clés pour 2027, telles que rapportées par la presse."),
  self_vs_sources: z
    .array(
      z.object({
        topic: z.string().describe("Sujet (ex. « Origines sociales »)."),
        candidate_says: z.object({ text: z.string().describe("Ce que le candidat dit de lui-même, au style indirect (« Selon lui, … »)."), sources: z.array(SourceRef).min(1).describe("Où il l’a dit (interview, livre)") }),
        sources_show: z.object({ text: z.string().describe("Ce que montrent les sources indépendantes, sans adjectif ni jugement."), sources: z.array(SourceRef).min(1) }),
      }),
    )
    .describe("Uniquement si un récit du candidat sur lui-même diffère de faits établis par des sources indépendantes. Tableau vide sinon."),
  gaps: z.array(z.string()).describe("Rubriques ou points que les sources ne permettent pas d’établir."),
});
export type CandidateProfileOutputT = z.infer<typeof CandidateProfileOutput>;

/* ---- Présidentielle : affaires judiciaires (passe dédiée) ---- */
const JusticeStageEnum = z.enum(["plainte", "enquete", "garde_a_vue", "mise_en_examen", "requisitions", "non_lieu", "appel", "renvoi_proces", "proces", "condamnation", "relaxe", "classement_sans_suite", "cassation", "autre"]);
export const AffairStatusEnum = z.enum([
  "enquete_en_cours",
  "mise_en_examen",
  "renvoi_devant_tribunal",
  "proces_en_cours",
  "condamnation_non_definitive",
  "condamnation_definitive",
  "relaxe_non_definitive",
  "relaxe_definitive",
  "non_lieu_non_definitif",
  "non_lieu_definitif",
  "classement_sans_suite",
  "inconnu",
]);
export const CandidateJusticeOutput = z.object({
  affairs: z
    .array(
      z.object({
        title: z.string().describe("Cause en clair, sans jugement : « Affaire de … présumé(e)s » (ex. « Affaire des assistants parlementaires européens », « Affaire de harcèlement et d’agressions sexuelles présumés »)."),
        charges: z.string().describe("Qualification pénale EXACTE des faits reprochés à la personne, telle que formulée par les sources (ex. « harcèlement sexuel, agression sexuelle et tentative d’agression sexuelle par personne abusant de son autorité »)."),
        charges_sources: z.array(SourceRef).min(1),
        steps: z
          .array(
            z.object({
              date: z.string().nullable().describe("AAAA-MM-JJ si connue, sinon AAAA-MM ou AAAA."),
              stage: JusticeStageEnum,
              jurisdiction: z.string().nullable().describe("Juridiction ou autorité (ex. « tribunal correctionnel de Paris », « chambre de l’instruction de la cour d’appel de Paris », « parquet de Paris »)."),
              text: z.string().describe("L’étape en une phrase factuelle."),
              sources: z.array(SourceRef).min(1).describe("Toutes les sources qui rapportent cette étape (au moins deux si possible, dont une officielle si elle existe)."),
            }),
          )
          .describe("Chronologie complète, de la plus ancienne à la plus récente."),
        response: z
          .object({ text: z.string().describe("Réaction de la personne telle que rapportée par la presse (« Il conteste les faits »)."), sources: z.array(SourceRef).min(1) })
          .nullable(),
      }),
    )
    .describe("Affaires judiciaires visant PERSONNELLEMENT la personne (mise en cause, pas plaignante ni témoin). Tableau vide si aucune."),
  not_found_note: z.string().describe("Ce que la recherche n’a pas permis d’établir sur ce sujet."),
});
export type CandidateJusticeOutputT = z.infer<typeof CandidateJusticeOutput>;

/** Vérification : confrontation de chaque étape au texte réellement récupéré de chaque source. */
export const JusticeVerificationOutput = z.object({
  affairs: z.array(
    z.object({
      index: z.number().int().describe("Numéro de l’affaire [A…]."),
      charges_check: z.array(
        z.object({
          source: z.number().int().describe("Numéro de la source [S…]."),
          supported: z.boolean().describe("true si le texte de la source mentionne bien ces faits reprochés à cette personne."),
          quote: z.string().describe("Extrait LITTÉRAL (copié mot pour mot, 20 à 300 caractères) du texte de la source qui le montre. Vide si non."),
        }),
      ),
      steps: z.array(
        z.object({
          step: z.number().int().describe("Numéro de l’étape [E…]."),
          checks: z.array(
            z.object({
              source: z.number().int(),
              supported: z.boolean().describe("true seulement si le texte de la source établit cette étape (même nature d’étape, même personne, date compatible)."),
              quote: z.string().describe("Extrait LITTÉRAL du texte de la source qui l’établit (20 à 300 caractères). Vide si non."),
            }),
          ),
        }),
      ),
      current_status: AffairStatusEnum.describe("État actuel de l’affaire pour la personne, déduit UNIQUEMENT des étapes confirmées. « inconnu » si impossible."),
      current_summary: z.string().describe("État actuel en langage simple, le statut d’abord, daté, avec la juridiction (ex. « Renvoyé devant le tribunal correctionnel de Paris le 7 avril 2026 ; procès non encore audiencé. Il y avait eu un non-lieu le 26 décembre 2024, annulé en appel. »)."),
      current_date: z.string().nullable(),
      current_jurisdiction: z.string().nullable(),
      contradiction: z.string().describe("Si des sources se contredisent sur l’état actuel, l’expliquer en une phrase ; vide sinon."),
    }),
  ),
});
export type JusticeVerificationOutputT = z.infer<typeof JusticeVerificationOutput>;

/* ---- Présidentielle : périmètre (trois critères objectifs) ---- */
export const CandidateScopeOutput = z.object({
  candidacy_label: z.string().describe("Parti ou mouvement sous l’étiquette duquel la personne est candidate (ou « sans étiquette »)."),
  declines: z.boolean().describe("true si la personne dit elle-même, selon la presse récente, ne pas être candidate (ou avoir renoncé)."),
  declines_source: SourceRef.nullable(),
  parliament: z.object({
    met: z.boolean().describe("Le parti compte au moins un parlementaire en exercice (député, sénateur ou député européen), ou la personne l’est elle-même."),
    members: z.array(z.object({ name: z.string(), mandate: z.enum(["depute", "senateur", "depute_europeen"]) })).describe("Parlementaires en exercice concernés (noms complets)."),
    sources: z.array(SourceRef),
  }),
  past_candidacy: z.object({
    met: z.boolean().describe("La personne a déjà été candidate officielle à une présidentielle (500 parrainages validés, liste publiée par le Conseil constitutionnel)."),
    years: z.array(z.number().int()),
    sources: z.array(SourceRef).describe("Décision du Conseil constitutionnel de préférence (conseil-constitutionnel.fr)."),
  }),
  polls: z
    .array(
      z.object({
        institute: z.string().describe("Ifop, Elabe, Ipsos-BVA, OpinionWay, Odoxa, Harris Interactive/Toluna, Cluster17…"),
        date: z.string().describe("Date de publication AAAA-MM-JJ."),
        score: z.number().describe("Intention de vote en % (le meilleur score de la personne dans ce sondage, tous scénarios confondus)."),
        source: SourceRef,
      }),
    )
    .describe("Sondages nationaux de premier tour publiés dans les 3 derniers mois où la personne est testée (vide si aucun)."),
  reason: z.string().describe("Synthèse factuelle en une phrase."),
});
export type CandidateScopeOutputT = z.infer<typeof CandidateScopeOutput>;
