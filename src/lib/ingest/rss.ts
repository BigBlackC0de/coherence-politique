import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { getSqlite, nowIso } from "../db";
import { PARTIES } from "../config/parties";
import type { JobContext } from "../jobs";

/**
 * Communiqués et actualités officielles des partis, via leurs flux RSS/Atom
 * (configurés dans `rssFeeds` de src/lib/config/parties.ts). Gratuit.
 */

type AnyRec = Record<string, unknown>;
const asArray = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const txt = (x: unknown): string => {
  if (x == null) return "";
  if (typeof x === "object") {
    const o = x as AnyRec;
    return String(o["#text"] ?? o["@_href"] ?? "");
  }
  return String(x);
};
const stripHtml = (s: string) =>
  s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h[1-6]>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&rsquo;|&#8217;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

export interface FeedItem {
  title: string;
  link: string;
  date: string;
  text: string;
}

export function parseFeed(xml: string): FeedItem[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", cdataPropName: false });
  const doc = parser.parse(xml) as AnyRec;
  const items: FeedItem[] = [];
  const rss = doc.rss as AnyRec | undefined;
  if (rss) {
    const channel = rss.channel as AnyRec;
    for (const it of asArray(channel?.item as AnyRec[])) {
      const title = stripHtml(txt(it.title));
      const link = txt(it.link).trim();
      const date = new Date(txt(it.pubDate) || txt(it["dc:date"]));
      const body = stripHtml(txt(it["content:encoded"]) || txt(it.description));
      if (!title || !link || isNaN(date.getTime())) continue;
      items.push({ title, link, date: date.toISOString().slice(0, 19), text: body });
    }
  }
  const feed = doc.feed as AnyRec | undefined;
  if (feed) {
    for (const e of asArray(feed.entry as AnyRec[])) {
      const title = stripHtml(txt(e.title));
      const links = asArray(e.link as AnyRec[]);
      const link = txt(links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0]).trim();
      const date = new Date(txt(e.published) || txt(e.updated));
      const body = stripHtml(txt(e.content) || txt(e.summary));
      if (!title || !link || isNaN(date.getTime())) continue;
      items.push({ title, link, date: date.toISOString().slice(0, 19), text: body });
    }
  }
  return items;
}

export async function ingestRss(ctx: JobContext) {
  const sqlite = getSqlite();
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO posts (id, handle, party_id, politician_id, kind, title, chamber, source_ref, text, created_at, url, likes, reposts, replies, views, source, ingested_at)
     VALUES (@id, @handle, @partyId, NULL, 'communique', @title, NULL, @sourceRef, @text, @createdAt, @url, 0, 0, 0, 0, 'rss', @now)`,
  );
  const targets = PARTIES.flatMap((p) => (p.rssFeeds ?? []).map((url) => ({ party: p, url })));
  ctx.log(`${targets.length} flux RSS/Atom configurés`);
  let total = 0;
  let i = 0;
  ctx.setProgress(0, targets.length);
  for (const { party, url } of targets) {
    ctx.checkpoint();
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; Coherence-Politique/0.1; analyse citoyenne)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" }, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseFeed(await res.text());
      let n = 0;
      for (const it of items) {
        const text = it.text && it.text.length > 40 ? `${it.title}\n\n${it.text.slice(0, 6000)}` : it.title;
        if (text.length < 60) continue;
        const r = insert.run({
          id: `rss:${crypto.createHash("sha1").update(it.link).digest("hex").slice(0, 24)}`,
          handle: party.shortName,
          partyId: party.id,
          title: it.title.slice(0, 300),
          sourceRef: url,
          text,
          createdAt: it.date,
          url: it.link,
          now: nowIso(),
        });
        if (r.changes) n++;
      }
      total += n;
      ctx.log(`${party.shortName} : ${items.length} éléments dans le flux, ${n} nouveaux`);
    } catch (e) {
      ctx.log(`${party.shortName} (${url}) : ${(e as Error).message}`);
    }
    ctx.setProgress(++i, targets.length, `${total} communiqués importés`);
  }
  ctx.log(`Terminé : ${total} communiqués importés`);
}
