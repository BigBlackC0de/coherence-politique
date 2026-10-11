import { gunzipSync } from "node:zlib";
import { getDb, getSqlite, nowIso, schema } from "../db";
import { partyForSenatGroup } from "../config/parties";
import { fetchCached } from "./fetch-cache";
import { majorityPosition } from "./group-position";
import { normalizeName } from "./cri-senat";
import type { JobContext } from "../jobs";

/**
 * Ingestion Sénat via NosParlementaires (Licence Ouverte 2.0), qui normalise
 * l'open data officiel data.senat.fr (fourni en dump PostgreSQL, peu pratique).
 *  - senateurs.json        : sénateurs (actifs + historiques) et groupe
 *  - scrutins_senat.json   : scrutins publics depuis 2006/2017
 *  - votes_senat.json.gz   : positions individuelles
 */
export const SENAT_URLS = {
  senateurs: "https://nosparlementaires.fr/opendata/senateurs.json",
  scrutins: "https://nosparlementaires.fr/opendata/scrutins_senat.json",
  votes: "https://nosparlementaires.fr/opendata/votes_senat.json.gz",
};

/** On ne garde que les scrutins à partir de cette date (cohérence avec la XVIIe législature AN). */
export const SENAT_MIN_DATE = process.env.COHERENCE_SENAT_MIN_DATE ?? "2024-07-01";

type AnyRec = Record<string, unknown>;
const str = (x: unknown): string | null => (x == null ? null : String(x));
const num = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
const asList = (j: unknown): AnyRec[] => (Array.isArray(j) ? j : ((j as AnyRec)?.data as AnyRec[]) ?? []);

export async function ingestSenat(ctx: JobContext) {
  const db = getDb();
  const sqlite = getSqlite();
  ctx.log("Sénat — sénateurs (NosParlementaires / data.senat.fr)");
  const sen = asList(JSON.parse((await fetchCached(SENAT_URLS.senateurs, { log: ctx.log })).toString("utf8")));
  let history: GroupHistory = new Map();
  try {
    history = await loadGroupHistory(ctx);
  } catch (e) {
    ctx.log(`Historique des groupes indisponible (${(e as Error).message}) : groupes NosParlementaires seuls`);
  }
  const today = new Date().toISOString().slice(0, 10);
  let nSen = 0;
  const upsertSen = sqlite.prepare(
    `INSERT INTO politicians (id, chamber, first_name, last_name, full_name, party_id, group_ref, group_abbrev, group_name, department, active)
     VALUES (@id,'SENAT',@firstName,@lastName,@fullName,@partyId,@groupRef,@groupAbbrev,@groupName,@department,@active)
     ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name, full_name=excluded.full_name, party_id=excluded.party_id, group_ref=excluded.group_ref, group_abbrev=excluded.group_abbrev, group_name=excluded.group_name, department=excluded.department, active=excluded.active`,
  );
  const slugHistory = new Map<string, GroupSpan[]>();
  sqlite.transaction(() => {
    for (const s of sen) {
      const spans = history.get(normalizeName(`${str(s.first_name) ?? ""} ${str(s.last_name) ?? ""}`)) ?? [];
      if (spans.length) slugHistory.set(`SEN-${s.slug}`, spans);
      // Groupe actuel : historique officiel du Sénat d'abord (NosParlementaires peut être en retard après un renouvellement).
      const current = s.active ? groupAt(spans, today) : spans[spans.length - 1];
      const rawAbbrev = str(s.group_short);
      const abbrev = current?.abbrev ?? (rawAbbrev && rawAbbrev !== "Aucun" ? rawAbbrev : null);
      upsertSen.run({
        id: `SEN-${s.slug}`,
        firstName: str(s.first_name) ?? "",
        lastName: str(s.last_name) ?? "",
        fullName: str(s.full_name) ?? `${s.first_name} ${s.last_name}`,
        partyId: partyForSenatGroup(abbrev),
        groupRef: abbrev ? `SENAT-${abbrev}` : null,
        groupAbbrev: abbrev,
        groupName: abbrev ? (current?.label ?? str(s.group_label)) : null,
        department: str(s.department_label),
        active: s.active ? 1 : 0,
      });
      nSen++;
    }
  })();
  ctx.log(`${nSen} sénateurs importés (${sen.filter((s) => s.active).length} actifs)`);

  ctx.log("Sénat — scrutins publics");
  const scr = asList(JSON.parse((await fetchCached(SENAT_URLS.scrutins, { log: ctx.log })).toString("utf8")));
  const kept = scr.filter((s) => (str(s.date) ?? "") >= SENAT_MIN_DATE);
  const keptIds = new Set(kept.map((s) => String(s.id)));
  const scrutinDate = new Map(kept.map((s) => [String(s.id), (str(s.date) ?? "").slice(0, 10)]));
  const insScr = sqlite.prepare(
    `INSERT INTO scrutins (uid, chamber, number, legislature, date, title, objet, votants, exprimes, pour, contre, abstentions, url, dossier_ref, ingested_at)
     VALUES (@uid,'SENAT',@number,NULL,@date,@title,NULL,@votants,@exprimes,@pour,@contre,@abstentions,@url,@dossierRef,@ingestedAt)
     ON CONFLICT(uid) DO UPDATE SET title=excluded.title, votants=excluded.votants, pour=excluded.pour, contre=excluded.contre`,
  );
  sqlite.transaction(() => {
    for (const s of kept) {
      const votants = num(s.votants);
      const exprimes = num(s.suffrages_exprimes);
      insScr.run({
        uid: `SEN-${s.id}`,
        number: String(s.id),
        date: (str(s.date) ?? "").slice(0, 10),
        title: `Scrutin ${s.id} ${(str(s.title) ?? "").replace(//g, "’")}`.trim(),
        votants,
        exprimes,
        pour: num(s.pour),
        contre: num(s.contre),
        abstentions: Math.max(0, votants - exprimes),
        url: str(s.url),
        dossierRef: str(s.dossier_ref),
        ingestedAt: nowIso(),
      });
    }
  })();
  ctx.log(`${kept.length} scrutins Sénat depuis ${SENAT_MIN_DATE} (sur ${scr.length})`);

  ctx.log("Sénat — votes individuels");
  const gz = await fetchCached(SENAT_URLS.votes, { log: ctx.log });
  const votes = asList(JSON.parse((gz[0] === 0x1f && gz[1] === 0x8b ? gunzipSync(gz) : gz).toString("utf8")));
  const posMap: Record<string, string> = { POUR: "pour", CONTRE: "contre", ABSTENTION: "abstention", NONVOTANT: "nonVotant" };
  const insVote = sqlite.prepare(`INSERT OR REPLACE INTO votes (scrutin_uid, politician_id, position, par_delegation) VALUES (?,?,?,0)`);
  let nv = 0;
  const senatorGroup = new Map(
    db
      .select({ id: schema.politicians.id, groupRef: schema.politicians.groupRef, partyId: schema.politicians.partyId, abbrev: schema.politicians.groupAbbrev })
      .from(schema.politicians)
      .all()
      .filter((p) => p.id.startsWith("SEN-"))
      .map((p) => [p.id, p]),
  );
  // Agrégats par groupe (reconstruits, le Sénat ne publie pas de "position majoritaire")
  const agg = new Map<string, { pour: number; contre: number; abstentions: number; nonVotants: number; abbrev: string | null; partyId: string | null }>();
  sqlite.transaction(() => {
    for (const v of votes) {
      const sid = String(v.scrutin_id);
      if (!keptIds.has(sid)) continue;
      const pid = `SEN-${v.senator_slug}`;
      const pos = posMap[String(v.position)] ?? "nonVotant";
      insVote.run(`SEN-${sid}`, pid, pos);
      nv++;
      // Groupe du sénateur à la date du vote (historique officiel), à défaut son groupe actuel.
      const spans = slugHistory.get(pid);
      const at = spans ? groupAt(spans, scrutinDate.get(sid) ?? "") : undefined;
      const meta = at ? { groupRef: `SENAT-${at.abbrev}`, abbrev: at.abbrev, partyId: partyForSenatGroup(at.abbrev) } : spans ? null : senatorGroup.get(pid);
      if (meta?.groupRef) {
        const key = `SEN-${sid}|${meta.groupRef}`;
        const a = agg.get(key) ?? { pour: 0, contre: 0, abstentions: 0, nonVotants: 0, abbrev: meta.abbrev, partyId: meta.partyId };
        if (pos === "pour") a.pour++;
        else if (pos === "contre") a.contre++;
        else if (pos === "abstention") a.abstentions++;
        else a.nonVotants++;
        agg.set(key, a);
      }
    }
  })();
  const insGV = sqlite.prepare(
    `INSERT OR REPLACE INTO group_votes (scrutin_uid, group_ref, group_abbrev, party_id, position, pour, contre, abstentions, non_votants, members)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  sqlite.transaction(() => {
    sqlite.prepare(`DELETE FROM group_votes WHERE scrutin_uid LIKE 'SEN-%'`).run();
    for (const [key, a] of agg) {
      const [scrutinUid, groupRef] = key.split("|");
      const expressed = a.pour + a.contre + a.abstentions;
      const position = majorityPosition(a.pour, a.contre, a.abstentions);
      insGV.run(scrutinUid, groupRef, a.abbrev, a.partyId, position, a.pour, a.contre, a.abstentions, a.nonVotants, expressed + a.nonVotants);
    }
  })();
  ctx.log(`${nv} votes individuels Sénat, ${agg.size} agrégats de groupe`);
}

/* ------------------------------------------------------------------ */
/* Historique officiel des groupes (data.senat.fr)                     */
/* ------------------------------------------------------------------ */

export const SENAT_GROUP_HISTORY_URL = "https://data.senat.fr/data/senateurs/ODSEN_HISTOGROUPES.csv";

/** Codes du Sénat → sigles utilisés dans Cohérence-Politique (et dans la configuration des partis). */
const GROUP_CODE: Record<string, string> = { UMP: "Les Républicains", LR: "Les Républicains", SOC: "SER", CRC: "CRCE-K", RTLI: "Les Indépendants", LREM: "RDPI", GEST: "GEST", UC: "UC", RDSE: "RDSE", NI: "NI" };

interface GroupSpan {
  abbrev: string;
  label: string;
  start: string;
  end: string; // "" = en cours
}
type GroupHistory = Map<string, GroupSpan[]>;

const groupAt = (spans: GroupSpan[], date: string) => spans.find((g) => g.start <= date && (!g.end || g.end >= date));

/** CSV minimal (champs entre guillemets possibles, virgules internes). */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/** Appartenances aux groupes par sénateur (clé : « prénom nom » normalisé), triées par date. Les périodes « aucun groupe » sont ignorées. */
async function loadGroupHistory(ctx: JobContext): Promise<GroupHistory> {
  const buf = await fetchCached(SENAT_GROUP_HISTORY_URL, { log: ctx.log, maxAgeHours: 20 });
  const lines = new TextDecoder("iso-8859-1").decode(buf).split(/\r?\n/).filter((l) => l && !l.startsWith("%"));
  const header = parseCsvLine(lines.shift() ?? "");
  const col = (name: string) => header.findIndex((h) => h.startsWith(name));
  const [iNom, iPrenom, iCode, iLabel, iStart, iEnd] = [col("Nom"), col("Prénom"), col("Code du groupe"), col("Nom court du groupe"), col("Date de début d'appartenance"), col("Date de fin d'appartenance")];
  const map: GroupHistory = new Map();
  const seen = new Set<string>();
  for (const line of lines) {
    const r = parseCsvLine(line);
    const code = r[iCode];
    if (!code || code === "AUCUN") continue;
    const span: GroupSpan = { abbrev: GROUP_CODE[code] ?? code, label: r[iLabel], start: r[iStart].slice(0, 10), end: r[iEnd].slice(0, 10) };
    const key = normalizeName(`${r[iPrenom]} ${r[iNom]}`);
    const id = `${key}|${span.abbrev}|${span.start}`; // une ligne par fonction occupée : on dédoublonne
    if (seen.has(id)) continue;
    seen.add(id);
    const list = map.get(key) ?? [];
    list.push(span);
    map.set(key, list);
  }
  for (const list of map.values()) list.sort((a, b) => (a.start < b.start ? -1 : 1));
  ctx.log(`Historique officiel des groupes : ${map.size} sénateurs`);
  return map;
}
