"use strict";
/* PAIRED ONCE, FOR EVERYBODY (owner, 17 Oct 2026: "go 2").
 *
 * Every phone used to pair our ~840 fixtures with each bookmaker's ~2,000
 * events itself - about 3 s of a mid-range phone's load, behind the loader.
 * The feed proxies (lib/upstream.js) now do it once per refresh with the page's
 * own matcher (lib/pairmatch.js, generated from index.html) and send the answer:
 *   pairs = { for: <predictions generatedAt>, ids: { <fid>: <event id or null> } }
 * The page uses it only for the exact predictions it was made from, and only
 * for the fixtures it lists; everything else goes through the matcher as before
 * (index.html attachWithPairs). */
const makePairing = require("./pairmatch.js");

const BOOK = { fixtures: "sporty", bet9ja: "bet9ja", betking: "betking", betpawa: "betpawa", onexbet: "onexbet", betway: "betway", msport: "msport" };
const TTL = 60 * 1000;
const memo = {};

async function getJSON(url, ttl) {
  const m = memo[url];
  if (m && Date.now() - m.at < ttl) return m.body;
  const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(url + " " + r.status);
  const body = await r.json();
  memo[url] = { at: Date.now(), body };
  return body;
}

/* name: the proxy's feed name; body: its upstream answer; origin: this site. */
async function pairsFor(name, body, origin) {
  const key = BOOK[name];
  if (!key || !body || !body.matches) return null;
  const preds = await getJSON(origin + "/predictions.json", TTL);
  if (!preds || !Array.isArray(preds.fixtures) || !preds.generatedAt) return null;
  const DATA = { fixtures: JSON.parse(JSON.stringify(preds.fixtures)) };
  const M = makePairing(DATA);
  /* The other books are tried by SportyBet's Sportradar id first, which the
     page has on each fixture once SportyBet is attached - so here too. */
  if (key !== "sporty") {
    const sp = await getJSON(origin + "/api/fixtures", TTL);
    if (sp && Array.isArray(sp.matches) && sp.matches.length) M.attachEventIds(sp.matches, M.BOOKS.sporty);
  }
  const rows = key === "sporty" ? body.matches : M.b9Rows(body.matches);
  if (!rows || !rows.length) return null;
  M.attachEventIds(rows, M.BOOKS[key]);
  const B = M.BOOKS[key], ids = {};
  for (const f of DATA.fixtures) ids[M.fid(f)] = f[B.id] != null ? f[B.id] : null;
  return { for: preds.generatedAt, ids };
}

module.exports = { pairsFor, BOOK };
