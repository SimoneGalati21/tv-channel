// Scarica la programmazione di oggi e domani e la salva in epg.json
// (usato dall'app per mostrare "ora in onda" e "a seguire").
// Per ogni canale si provano le fonti in ordine: la prima con dati vince.
import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";

const S = {
  1: [["rai", "rai-1"], ["sky", 899]], 2: [["rai", "rai-2"], ["sky", 898]], 3: [["rai", "rai-3"], ["sky", 897]],
  4: [["ms", "R4"], ["sky", 10464]], 5: [["ms", "C5"], ["sky", 10354]], 6: [["ms", "I1"], ["sky", 10454]],
  7: [["sky", 319]], 8: [["sky", 8195]],
  9: [["sgt", "nove/238"]],
  20: [["ms", "LB"], ["sky", 10458]], 21: [["rai", "rai-4"], ["sky", 6622]], 22: [["ms", "KI"], ["sky", 10467]],
  23: [["rai", "rai-5"], ["sky", 6607]], 24: [["rai", "rai-movie"], ["sky", 6608]], 25: [["rai", "rai-premium"], ["sky", 6623]],
  27: [["ms", "TS"], ["sky", 11342]], 28: [["sky", 7588]], 29: [["sky", 6624]], 30: [["ms", "KA"], ["sky", 10466]],
  31: [["sgt", "real-time/255"]],
  33: [["sgt", "foodnetwork/431"]],
  34: [["ms", "B6"], ["sky", 10893]], 35: [["ms", "FU"], ["sky", 10470]], 36: [["sky", 6885]],
  37: [["sgt", "warner-tv/1344181813"]],
  38: [["sgt", "giallo/244"]],
  39: [["ms", "LT"], ["sky", 10468]], 40: [["ms", "KB"], ["sky", 6628]],
  42: [["rai", "rai-gulp"], ["sky", 6629]], 43: [["rai", "rai-yoyo"], ["sky", 6609]],
  46: [["ms", "LA"], ["sky", 8132]], 47: [["sky", 6460]], 48: [["rai", "rai-news-24"], ["sky", 895]],
  49: [["ms", "I2"], ["sgt", "italia-2/191"]], 51: [["ms", "KF"], ["sky", 10473]],
  52: [["sgt", "dmax/256"]],
  54: [["rai", "rai-storia"], ["sky", 6630]], 55: [["ms", "KQ"], ["sky", 10465]],
  56: [["sgt", "hgtv-homegarden/575"]],
  57: [["sgt", "rai-scuola/230"]], 58: [["rai", "rai-sport"], ["sky", 807]],
  60: [["sgt", "sportitalia/54"]],
  64: [["sky", 6000]], 69: [["sky", 462]], 70: [["sky", 9833]]
};

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",
  "Accept-Language": "it-IT,it;q=0.9" };
const sec = d => Math.round(new Date(d).getTime() / 1000);
const clean = t => String(t || "").replace(/\s+-\s+Stag\.?\s.*$/i, "").replace(/\s+S\d+\s?E\d+\b.*$/, "").replace(/\s+/g, " ").trim();

// ora "HH:mm" del giorno YYYY-MM-DD a Roma -> secondi UTC
function romeToEpoch(ymd, hhmm) {
  const [y, m, d] = ymd.split("-").map(Number), [H, M] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, H, M);
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const asRome = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((guess - (asRome - guess)) / 1000);
}
const romeYmd = off => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(Date.now() + off * 86400000));
const nextDay = ymd => new Date(Date.parse(ymd + "T12:00:00Z") + 86400000).toISOString().slice(0, 10);

// --- parser ---
export function parseSky(json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  return (data.events || []).filter(e => e.starttime && e.endtime)
    .map(e => [sec(e.starttime), sec(e.endtime), clean((e.content && e.content.contentTitle) || e.eventTitle)]);
}
export function parseMs(json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  const l = (((data.response || {}).entries || [])[0] || {}).listings || [];
  return l.filter(x => x.startTime && x.endTime)
    .map(x => [Math.round(x.startTime / 1000), Math.round(x.endTime / 1000), clean(x["mediasetlisting$epgTitle"] || (x.program || {}).title)]);
}
export function parseRai(json, ymd) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  let day = ymd, prev = null;
  return (data.events || []).filter(e => e.name && e.hour && e.duration_in_minutes).map(e => {
    let start = romeToEpoch(day, e.hour);
    if (prev && start < prev) { day = nextDay(day); start = romeToEpoch(day, e.hour); }
    prev = start;
    return [start, start + parseInt(e.duration_in_minutes, 10) * 60, clean(e.name)];
  });
}
// tabelle HTML con orario + titolo; la fine è l'inizio del successivo
function chain(rows, ymd) {
  const out = []; let day = ymd, prev = null;
  for (const [hh, title] of rows) {
    if (!/^\d{1,2}:\d{2}$/.test(hh) || !title) continue;
    let start = romeToEpoch(day, hh);
    if (prev && start < prev[0]) { day = nextDay(day); start = romeToEpoch(day, hh); }
    if (prev) prev[1] = start;
    prev = [start, start + 1800, clean(title)]; out.push(prev);
  }
  return out;
}
export function parseGtv(html, ymd) {
  const $ = load(html);
  return chain($("table.table > tbody > tr").toArray().map(tr => [$(tr).find("td").eq(0).text().trim(), $(tr).find("td").eq(1).text().trim()]), ymd);
}
export function parseSgt(html, ymd) {
  const $ = load(html);
  return chain($(".sgtvchannelplan_divContainer > .sgtvchannelplan_divTableRow").has("#containerInfoEvent").toArray().map(el => {
    const $el = $(el);
    return [$el.find(".sgtvchannelplan_hoursCell").clone().children(".sgtvOnairSpan").remove().end().text().trim(),
      $el.find(".sgtvchannelplan_spanInfoNextSteps").text().trim()];
  }), ymd);
}

const peek = {};
async function get(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const t = await r.text();
  const title = (t.match(/<title[^>]*>([^<]*)/i) || [])[1];
  peek.last = r.status + " " + t.length + "B " + (title ? "title=" + title.trim().slice(0, 60) : t.slice(0, 120).replace(/\s+/g, " "));
  return t;
}
const join2 = (a, b) => { if (a.length && b.length && a[a.length - 1][1] > b[0][0]) a[a.length - 1][1] = b[0][0]; return a.concat(b); };

async function fromSource([kind, id], today, tomorrow) {
  const dmy = ymd => ymd.split("-").reverse().join("-");
  if (kind === "sky") {
    return parseSky(await get(`https://apid.sky.it/gtv/v1/events?from=${today}T00:00:00Z&to=${nextDay(tomorrow)}T00:00:00Z&pageSize=999&pageNum=0&env=DTH&channels=${id}`));
  }
  if (kind === "ms") { // massimo 24 ore per richiesta
    const day = async ymd => parseMs(await get(`https://api-ott-prod-fe.mediaset.net/PROD/play/feed/allListingFeedEpg/v2.0?byListingTime=${romeToEpoch(ymd, "00:00") * 1000}~${romeToEpoch(nextDay(ymd), "00:00") * 1000 - 1}&byCallSign=${id}`));
    const a = await day(today);
    let b = []; try { b = await day(tomorrow); } catch (e) {}
    return join2(a, b);
  }
  if (kind === "rai") {
    const a = parseRai(await get(`https://www.raiplay.it/palinsesto/app/${id}/${dmy(today)}.json`), today);
    let b = []; try { b = parseRai(await get(`https://www.raiplay.it/palinsesto/app/${id}/${dmy(tomorrow)}.json`), tomorrow); } catch (e) {}
    return join2(a, b);
  }
  if (kind === "gtv") {
    const a = parseGtv(await get(`https://www.guida.tv/programmi-tv/palinsesto/canale/${id}.html?dt=${today}`), today);
    let b = []; try { b = parseGtv(await get(`https://www.guida.tv/programmi-tv/palinsesto/canale/${id}.html?dt=${tomorrow}`), tomorrow); } catch (e) {}
    return join2(a, b);
  }
  if (kind === "sgt") {
    const html = await get(`https://www.superguidatv.it/programmazione-canale/oggi/guida-programmi-tv-${id}/`);
    const a = parseSgt(html, today);
    if (!a.length && id === "nove/238") writeFileSync("epg/debug-sgt.html", html); // campione per adattare il parser
    let b = []; try { b = parseSgt(await get(`https://www.superguidatv.it/programmazione-canale/domani/guida-programmi-tv-${id}/`), tomorrow); } catch (e) {}
    return join2(a, b);
  }
  return [];
}

async function main() {
  const today = romeYmd(0), tomorrow = romeYmd(1), guide = {}, log = [];
  const now = Math.round(Date.now() / 1000), cut = now - 3 * 3600;

  for (const [num, sources] of Object.entries(S)) await (async () => {
    for (const src of sources) {
      try {
        const progs = (await fromSource(src, today, tomorrow)).filter(p => p[1] > cut && p[2]).sort((x, y) => x[0] - y[0]);
        if (progs.length) { guide[num] = progs; log.push(num + " ok " + src[0]); return; }
        log.push(num + " " + src[0] + ": vuoto [" + peek.last + "]");
      } catch (e) { log.push(num + " " + src[0] + ": " + e.message); }
    }
  })();

  // se tutte le fonti di un canale falliscono, conserva i dati precedenti ancora validi
  try {
    const old = JSON.parse(readFileSync("epg.json", "utf8")).ch || {};
    for (const k of Object.keys(old)) if (!guide[k]) {
      const keep = old[k].filter(p => p[1] > cut);
      if (keep.length) guide[k] = keep;
    }
  } catch (e) {}

  log.sort((a, b) => parseInt(a) - parseInt(b));
  writeFileSync("epg.json", JSON.stringify({ updated: now, ch: guide, log }));
  console.log("Canali con guida:", Object.keys(guide).length, "su", Object.keys(S).length);
  log.forEach(l => console.log("  " + l));
}

if (process.argv[1] && process.argv[1].endsWith("build.mjs")) main();
