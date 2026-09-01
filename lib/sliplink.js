"use strict";

/**
 * Shareable slips. Everything a shared link needs travels inside the link.
 *
 * The whole point is that a reader who builds something good can send it to
 * somebody, and what arrives is the slip itself rather than a bare booking
 * code that means nothing until it is pasted into a bookmaker.
 *
 * THE DESIGN CONSTRAINT, and it comes from a real incident. A slip leg in the
 * browser stores `{id, code, p}`, where `id` is the fid() hash of a fixture.
 * On 1 Sep 2026 FK Rostov v CSKA Moscow left the board while it was still
 * being played - SportyBet drops a match at kick-off and it is the only source
 * of cup ties - and every leg pointing at it became unresolvable. A share link
 * keyed on fixture ids would rot exactly the same way: silently, permanently,
 * and on somebody else's post. So a leg here carries its own teams, date,
 * market, odds and probability, and renders with no board at all.
 *
 * Encoding: fields joined by \x1f, legs by \x1e, the lot base64url. Control
 * characters cannot occur in a team name, so no delimiter can be smuggled in -
 * which is the entire class of bug that a "|" separator invites.
 *
 * THE PAYLOAD IS ATTACKER-CONTROLLED. Anyone can craft a link and share it as
 * though this site said it. Everything below therefore validates hard and
 * refuses rather than repairs, and every rendered field goes through esc().
 */

const { esc, staticPage, ORIGIN } = require("./pages.js");

const FS = "\u001f";   // between fields
const RS = "\u001e";   // between legs

/* Only markets the builders actually offer. An unknown code is a crafted link,
   not a new feature, so it is refused. */
const MARKETS = {
  "1": "Home win", "2": "Away win", "X": "Draw",
  "1X": "Home or draw", "X2": "Draw or away", "12": "Home or away",
  "OVER_1.5": "Over 1.5 goals", "OVER_2.5": "Over 2.5 goals", "OVER_3.5": "Over 3.5 goals",
  "GG": "Both teams to score", "FH_OVER_0.5": "Goal in the first half",
  "HOME_OVER_0.5": "Home to score", "AWAY_OVER_0.5": "Away to score",
  "HOME_OVER_1.5": "Home over 1.5", "AWAY_OVER_1.5": "Away over 1.5",
};

const MAX_LEGS = 40;        // the builders' own ceiling
const MAX_NAME = 40;
const MIN_ODD = 1.01, MAX_ODD = 1000;

/* Control characters are the delimiters, so they are stripped on the way in
   rather than trusted to be absent. */
function clean(s) {
  return String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_NAME);
}

function encode(legs) {
  const rows = (legs || []).slice(0, MAX_LEGS).map((l) => [
    clean(l.home), clean(l.away), String(l.date || ""), String(l.code || ""),
    (+l.od).toFixed(2), Math.round((+l.p) * 100),
  ].join(FS));
  return Buffer.from(rows.join(RS), "utf8").toString("base64url");
}

/* Returns {ok:true, legs} or {ok:false, why}. Never a partial slip: a link
   that is wrong in one leg is wrong, and rendering the rest of it would put
   numbers on screen that nobody chose. */
function decode(p) {
  if (typeof p !== "string" || !p || p.length > 8000) return { ok: false, why: "no slip in that link" };
  let raw;
  try { raw = Buffer.from(p, "base64url").toString("utf8"); }
  catch (e) { return { ok: false, why: "that link is damaged" }; }
  if (!raw) return { ok: false, why: "that link is empty" };

  const rows = raw.split(RS);
  if (rows.length > MAX_LEGS) return { ok: false, why: "that slip has too many games" };

  const legs = [];
  for (const row of rows) {
    const f = row.split(FS);
    if (f.length !== 6) return { ok: false, why: "that link is damaged" };
    const [home, away, date, code, od, pc] = f;
    if (!home || !away || home.length > MAX_NAME || away.length > MAX_NAME)
      return { ok: false, why: "that link is damaged" };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, why: "that link is damaged" };
    if (!Object.prototype.hasOwnProperty.call(MARKETS, code))
      return { ok: false, why: "that slip has a bet we do not offer" };
    const odd = Number(od), prob = Number(pc) / 100;
    if (!isFinite(odd) || odd < MIN_ODD || odd > MAX_ODD) return { ok: false, why: "that link is damaged" };
    if (!isFinite(prob) || prob < 0.02 || prob > 0.99) return { ok: false, why: "that link is damaged" };
    legs.push({ home, away, date, code, od: odd, p: prob });
  }
  if (!legs.length) return { ok: false, why: "that link is empty" };
  return { ok: true, legs };
}

/* Combined odds, and the chance every leg lands. The second number is the one
   people never see anywhere else and the reason this page is worth sharing. */
function totals(legs) {
  let od = 1, p = 1;
  for (const l of legs) { od *= l.od; p *= l.p; }
  return { odds: od, prob: p };
}

function money(n) {
  return n >= 100 ? Math.round(n).toLocaleString("en-US") : n.toFixed(2);
}

function renderBody(legs, record) {
  const t = totals(legs);
  const rows = legs.map((l) => `
    <li class="sl-leg">
      <div class="sl-teams">${esc(l.home)} <span class="sl-v">v</span> ${esc(l.away)}</div>
      <div class="sl-pick">${esc(MARKETS[l.code])}</div>
      <div class="sl-nums"><b>${esc(l.od.toFixed(2))}</b><span>${Math.round(l.p * 100)}%</span></div>
    </li>`).join("");

  const rec = record && record.total
    ? `<p class="sl-rec">Our own tips: <b>${record.correct} of ${record.total}</b> over the
       last ${record.days} days. The ones we got wrong are up there too.</p>`
    : "";

  return `
<p class="sl-built">Somebody built this on Soccerwizard. It is their slip, not our tip.</p>
<div class="sl-sum">
  <div><span class="sl-k">Games</span><span class="sl-n">${legs.length}</span></div>
  <div><span class="sl-k">Total odds</span><span class="sl-n">${esc(money(t.odds))}</span></div>
  <div><span class="sl-k">Chance all of them land</span><span class="sl-n">${(t.prob * 100).toFixed(1)}%</span></div>
</div>
<ul class="sl-list">${rows}</ul>
${rec}
<p class="sl-cta"><a class="sl-go" href="/">Build your own</a></p>
<p class="sl-fine">18+. These are estimates, not sure things. Only stake what you can lose.</p>`;
}

const CSS = `
.sl-built{font-size:13px;color:var(--faint);margin:0 0 14px}
.sl-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:0 0 16px}
.sl-sum div{background:var(--card,#12141a);padding:11px 13px;display:flex;flex-direction:column;gap:3px}
.sl-k{font-size:11.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.05em}
.sl-n{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.sl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.sl-leg{background:var(--card,#12141a);padding:10px 13px;display:grid;
  grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;align-items:baseline}
.sl-teams{font-weight:700;font-size:14px;min-width:0}
.sl-v{color:var(--faint);font-weight:400;margin:0 2px}
.sl-pick{font-size:12.5px;color:var(--soft);grid-column:1}
.sl-nums{grid-column:2;grid-row:1 / span 2;text-align:right;display:flex;flex-direction:column;gap:2px}
.sl-nums b{font-size:15px;font-variant-numeric:tabular-nums}
.sl-nums span{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.sl-rec{font-size:13px;color:var(--soft);margin:16px 0 0}
.sl-cta{margin:18px 0 0}
.sl-go{display:inline-block;background:var(--text);color:var(--bg);text-decoration:none;
  font-weight:800;font-size:14px;padding:11px 20px;border-radius:999px}
@media (hover:hover){.sl-go:hover{filter:brightness(.9)}}
.sl-fine{font-size:12px;color:var(--faint);margin:14px 0 0}`;

/* The whole page. `staticPage` escapes title, description and heading; the
   body is raw, so everything interpolated above is escaped at the point of
   use and nothing reaches here unescaped. */
function renderPage(legs, record, path) {
  const t = totals(legs);
  const desc = `${legs.length} games at ${money(t.odds)}. Built on Soccerwizard, where you name the payout and it finds the games.`;
  const html = staticPage({
    path: path || "/s",
    title: `A ${money(t.odds)} slip`,
    h1: `${legs.length} games at ${money(t.odds)}`,
    sub: "Built by a reader on Soccerwizard",
    desc,
    body: renderBody(legs, record),
  });
  return html.replace("</style>", CSS + "\n</style>");
}

function renderError(why) {
  return staticPage({
    path: "/s",
    title: "That slip could not be opened",
    h1: "That slip could not be opened",
    sub: why,
    desc: "Build your own football slip on Soccerwizard.",
    body: `<p>The link may have been cut short when it was copied. Nothing is
      lost - you can build a new one in a few seconds.</p>
      <p class="sl-cta"><a class="sl-go" href="/">Build a slip</a></p>`,
  }).replace("</style>", CSS + "\n</style>");
}

module.exports = { encode, decode, totals, renderBody, renderPage, renderError,
  MARKETS, MAX_LEGS, ORIGIN };
