// Scarica la programmazione di oggi e domani e la salva in epg.json
// (usato dall'app per mostrare "ora in onda" e "a seguire").
// Fonti: guida TV Sky (JSON) e SuperGuidaTV (HTML) per i canali che Sky non ha.
import { load } from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";

// numero canale nell'app -> fonte
const SKY = {
  1: 899, 2: 898, 3: 897, 4: 10464, 5: 10354, 6: 10454, 7: 319, 8: 8195, 20: 10458,
  21: 6622, 22: 10467, 23: 6607, 24: 6608, 25: 6623, 27: 11342, 28: 7588, 29: 6624,
  30: 10466, 34: 10893, 35: 10470, 36: 6885, 40: 6628, 42: 6629, 43: 6609, 46: 8132,
  47: 6460, 48: 895, 51: 10473, 54: 6630, 55: 10465, 58: 807, 64: 6000, 69: 462, 70: 9833
};
const SGT = {
  9: "nove/238", 31: "real-time/255", 33: "foodnetwork/431", 37: "warner-tv/1344181813",
  38: "giallo/244", 39: "top-crime/193", 49: "italia-2/191", 52: "dmax/256",
  56: "hgtv-homegarden/575", 57: "rai-scuola/230", 60: "sportitalia/54"
};

const UA = { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36" };
const sec = d => Math.round(new Date(d).getTime() / 1000);

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
function romeYmd(offsetDays) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);
}

export function parseSky(json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  return (data.events || []).filter(e => e.starttime && e.endtime)
    .map(e => [sec(e.starttime), sec(e.endtime), (e.eventTitle || "").trim()]);
}

export function parseSgt(html, ymd) {
  const $ = load(html), out = [];
  let day = ymd, prev = null;
  $(".sgtvchannelplan_divContainer > .sgtvchannelplan_divTableRow").has("#containerInfoEvent").each((i, el) => {
    const $el = $(el);
    const hh = $el.find(".sgtvchannelplan_hoursCell").clone().children(".sgtvOnairSpan").remove().end().text().trim();
    const title = $el.find(".sgtvchannelplan_spanInfoNextSteps").text().trim();
    if (!/^\d{1,2}:\d{2}$/.test(hh) || !title) return;
    let start = romeToEpoch(day, hh);
    if (prev && start < prev[0]) { // passata la mezzanotte
      const d = new Date(Date.UTC(...day.split("-").map((v, k) => k === 1 ? v - 1 : +v)) + 86400000);
      day = d.toISOString().slice(0, 10); start = romeToEpoch(day, hh);
    }
    if (prev) prev[1] = start;
    prev = [start, start + 1800, title]; out.push(prev);
  });
  return out;
}

async function get(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
  return r.text();
}

async function main() {
  const today = romeYmd(0), tomorrow = romeYmd(1), after = romeYmd(2);
  const guide = {}, errors = [];

  for (const [num, id] of Object.entries(SKY)) {
    try {
      const url = `https://apid.sky.it/gtv/v1/events?from=${today}T00:00:00Z&to=${after}T00:00:00Z&pageSize=999&pageNum=0&env=DTH&channels=${id}`;
      guide[num] = parseSky(await get(url));
    } catch (e) { errors.push(num + ": " + e.message); }
  }
  for (const [num, id] of Object.entries(SGT)) {
    try {
      const a = parseSgt(await get(`https://www.superguidatv.it/programmazione-canale/oggi/guida-programmi-tv-${id}/`), today);
      let b = [];
      try { b = parseSgt(await get(`https://www.superguidatv.it/programmazione-canale/domani/guida-programmi-tv-${id}/`), tomorrow); } catch (e) {}
      if (a.length && b.length) a[a.length - 1][1] = b[0][0];
      guide[num] = a.concat(b);
    } catch (e) { errors.push(num + ": " + e.message); }
  }

  // tieni solo da 3 ore fa in poi, ordinato
  const cut = Math.round(Date.now() / 1000) - 3 * 3600;
  for (const k of Object.keys(guide)) {
    guide[k] = guide[k].filter(p => p[1] > cut).sort((x, y) => x[0] - y[0]);
    if (!guide[k].length) delete guide[k];
  }

  // se una fonte fallisce, conserva i dati precedenti di quel canale
  try {
    const old = JSON.parse(readFileSync("epg.json", "utf8")).ch || {};
    for (const k of Object.keys(old)) if (!guide[k]) {
      const keep = old[k].filter(p => p[1] > cut);
      if (keep.length) guide[k] = keep;
    }
  } catch (e) {}

  writeFileSync("epg.json", JSON.stringify({ updated: Math.round(Date.now() / 1000), ch: guide }));
  console.log("Canali con guida:", Object.keys(guide).length, "| errori:", errors.length);
  errors.forEach(e => console.log("  " + e));
}

if (process.argv[1] && process.argv[1].endsWith("build.mjs")) main();
