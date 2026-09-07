"use strict";
/**
 * The day's booking code, minted once and written down. OFFLINE / DAILY.
 *
 *   node scripts/mkcode.js [--legs=5] [--date=YYYY-MM-DD] [--dry]
 *
 * WHY THIS IS NOT PART OF THE BUILD. The build runs five or six times a day off
 * the sweep hook, and api/book.js says plainly what a booking call costs:
 * Railway CPU on a $5 plan, and bookmaker goodwill that has been spent once
 * already. Minting per build would be eighteen calls a day to publish one code.
 * This runs once, stores the result in data/daily-codes.json, and every build
 * after it reads the file.
 *
 * WHAT IT PUBLISHES, AND WHY THAT SHAPE. The tips we are most confident about
 * for the day, as one slip, on both bookmakers. Not a payout target - the slip
 * builder's optimiser lives in the browser, and reimplementing it here would be
 * a second copy of the hardest code in the project. "Our five most confident
 * picks" needs no optimiser, and it is a claim we can stand behind the next
 * morning, which is the entire point of the page.
 *
 * THE MATCHER IS THE SHIPPED ONE. Our fixtures carry no bookmaker event ids -
 * predictions.json has none, they are resolved in the browser - so this lifts
 * normTeam/simTeams/sameSlot straight out of public/index.html, exactly as
 * scripts/b9match.js does. A separate copy would book against a matcher we do
 * not ship, and that failure looks like a code for the wrong fixture.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "daily-codes.json");
const ORIGIN = process.env.SW_ORIGIN || "https://www.soccerwizard.live";
const HOST = process.env.SW_API || "https://web-production-798c0.up.railway.app";
const DRY = process.argv.includes("--dry");

function arg(name, dflt) {
  const hit = process.argv.slice(2).find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : dflt;
}

/* Lagos, where the readers are. UTC+1 all year and never any daylight saving -
   the same constant lib/quota.js uses to decide which day it is. */
function lagosToday() {
  return new Date(Date.now() + 3600000).toISOString().slice(0, 10);
}

/* --------------------------------------------- the shipped matcher, lifted */

const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function grab(name) {
  const re = new RegExp("(?:^|\\n)((?:var|const|function)\\s+" + name + "\\b)", "m");
  const m = re.exec(src);
  if (!m) throw new Error("not found in index.html: " + name);
  const i = m.index + m[0].indexOf(m[1]);
  const isFn = m[1].startsWith("function");
  let depth = 0, started = false;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{" || c === "[" || c === "(") { depth++; started = true; }
    else if (c === "}" || c === "]" || c === ")") {
      depth--;
      if (isFn && started && depth === 0 && c === "}") return src.slice(i, k + 1);
    } else if (c === ";" && depth === 0 && !isFn) return src.slice(i, k + 1);
  }
  throw new Error("could not find the end of " + name);
}

/* b9match.js lifts ten of these. simTeams also reaches for containsWords,
   which that script never needed because it stops before the fuzzy pass on
   most fixtures. A missing name is not a silent degradation - the lifted
   function throws on the first comparison that uses it. */
const NAMES = ["TEAM_ALIASES", "MATCH_WINDOW_MS", "normTeam", "normTeamRaw",
               "tokset", "teamMarkers", "sameVariant", "containsWords",
               "simTeams", "evStart", "sameSlot", "tipCode"];
const M = new Function(
  NAMES.map(grab).join("\n") +
  "\nvar NT_CACHE=Object.create(null),NT_SIZE=0;const NT_MAX=20000;" +
  "\nreturn {normTeam:normTeam,simTeams:simTeams,sameSlot:sameSlot,tipCode:tipCode};")();

/* ------------------------------------------------------------------- data */

async function getJson(url, init) {
  const r = await fetch(url,
    Object.assign({ headers: { Accept: "application/json" } }, init || {}));
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { /* left null */ }
  return { ok: r.ok, status: r.status, body: body };
}

/* Both feeds in the one shape the matcher speaks. Bet9ja sends "Home - Away" as
   a single string where SportyBet sends the sides apart. */
async function events(which) {
  const url = HOST + (which === "sporty" ? "/api/fixtures" : "/api/bet9ja/fixtures");
  const got = await getJson(url);
  const d = got.body;
  if (!got.ok || !d || !d.success) throw new Error(which + " fixtures: http " + got.status);
  if (which === "sporty") {
    return (d.matches || []).map((m) => ({
      eventId: m.eventId, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
      startTime: m.startTime, league: m.league,
    }));
  }
  return Object.values(d.matches || {}).map((m) => {
    const bits = String(m.teams || "").split(" - ");
    return {
      eventId: m.eventId,
      homeTeam: (bits[0] || "").trim(),
      awayTeam: (bits.slice(1).join(" - ") || "").trim(),
      startTime: Date.parse(m.kickoff), league: m.league,
    };
  });
}

/* attachEventIds' rules, and they have to stay attachEventIds' rules: an exact
   match on both normalised names is allowed past the clock fence, and anything
   else needs the same slot and 0.6 a side. */
function findEvent(f, list) {
  const fh = M.normTeam(f.home), fa = M.normTeam(f.away);
  for (const m of list) {
    if (!m.eventId) continue;
    if (M.normTeam(m.homeTeam) === fh && M.normTeam(m.awayTeam) === fa) return m;
  }
  let best = null, score = 0;
  for (const m of list) {
    if (!m.eventId || !M.sameSlot(f, m)) continue;
    const sh = M.simTeams(f.home, m.homeTeam), sa = M.simTeams(f.away, m.awayTeam);
    if (sh >= 0.6 && sa >= 0.6 && sh + sa > score) { score = sh + sa; best = m; }
  }
  return score >= 1.2 ? best : null;
}

async function bookSlip(which, selections) {
  const got = await getJson(ORIGIN + "/api/book?book=" + which, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ selections: selections }),
  });
  const d = got.body || {};
  const code = which === "sporty" ? d.booking_code : d.code;
  if (!got.ok || !code) {
    return { ok: false,
      why: d.message || d.detail || d.error || ("http " + got.status),
      unbookable: d.unbookable || [] };
  }
  return { ok: true, code: String(code) };
}

/* -------------------------------------------------------------------- run */

(async () => {
  const date = arg("date", lagosToday());
  const legs = Math.max(2, Math.min(12, Number(arg("legs", 5)) || 5));

  const got = await getJson(ORIGIN + "/predictions.json");
  if (!got.ok || !got.body) throw new Error("predictions.json: http " + got.status);
  const onDay = (got.body.fixtures || []).filter((f) => f && f.date === date);
  if (!onDay.length) throw new Error("no fixtures on " + date);

  /* Not started, priceable, most confident first. A tip we cannot turn into a
     market code cannot be booked, so it is not a candidate. */
  const now = Date.now();
  const pool = onDay
    .filter((f) => M.tipCode(f))
    .filter((f) => !f.kickoff || Date.parse(f.kickoff) > now + 15 * 60000)
    .sort((a, b) => (b.tip_p || 0) - (a.tip_p || 0));
  console.log(`${onDay.length} fixtures on ${date}, ${pool.length} bookable and not started`);
  if (pool.length < legs) throw new Error(`only ${pool.length} bookable fixtures left on ${date}`);

  const sporty = await events("sporty");
  const b9 = await events("bet9ja");
  console.log(`feeds: ${sporty.length} SportyBet events, ${b9.length} Bet9ja events`);

  /* A leg has to be on BOTH books or it is not a leg. Two codes that are not
     the same slip would make tomorrow's record meaningless. */
  const picked = [];
  for (const f of pool) {
    if (picked.length >= legs) break;
    const s = findEvent(f, sporty), b = findEvent(f, b9);
    if (!s || !b) continue;
    picked.push({ f: f, sporty: s.eventId, bet9ja: b.eventId, market: M.tipCode(f) });
  }
  if (picked.length < legs) {
    throw new Error(`only ${picked.length} of ${legs} legs are carried by both books`);
  }

  /* WHAT A REFUSAL MEANS, AND WHY THE SLIP IS REBUILT RATHER THAN ABANDONED.
   *
   * A 400 with an `unbookable` list is the bookmaker's answer, not a failure -
   * see lib/bookproxy.js. SportyBet lists team and goals markets on roughly
   * half its card, and the first real run here was refused two legs of five,
   * both Over 1.5 in Scottish lower divisions.
   *
   * So refused legs are dropped and replaced from the pool, exactly as
   * dropUnbookable does in the browser. The invariant that survives is the one
   * that matters: BOTH CODES ARE THE SAME SLIP. Every round books the identical
   * leg set on both books, and a round where either refuses is discarded whole
   * rather than left half-applied - two codes for two different slips would
   * make tomorrow's record meaningless.
   *
   * Bounded at four rounds. A pool that cannot produce a slip both books accept
   * is a real answer, and a page with no code today is better than a loop. */
  const spare = pool.filter((f) => !picked.some((p) => p.f === f));
  let working = picked.slice();
  let codes = null, why = "";

  for (let round = 1; round <= 4 && !codes; round++) {
    const attempt = {};
    const refused = new Set();
    for (const [which, sel] of [
      ["sporty", working.map((p) => ({ eventId: p.sporty, prediction: p.market }))],
      ["bet9ja", working.map((p) => ({ eventId: p.bet9ja, code: p.market }))],
    ]) {
      const out = await bookSlip(which, sel);
      if (out.ok) { attempt[which] = out.code; continue; }
      why = `${which}: ${out.why}`;
      for (const u of (out.unbookable || [])) {
        const id = u && (u.eventId || u.event_id);
        const leg = working.find((p) => p.sporty === id || p.bet9ja === id);
        if (leg) refused.add(leg);
      }
      break;
    }
    if (attempt.sporty && attempt.bet9ja) { codes = attempt; break; }

    if (!refused.size) throw new Error(`round ${round} failed with nothing to drop - ${why}`);
    console.log(`round ${round}: ${refused.size} leg(s) refused, replacing`);
    working = working.filter((p) => !refused.has(p));
    while (working.length < legs && spare.length) {
      const f = spare.shift();
      const sp = findEvent(f, sporty), bb = findEvent(f, b9);
      if (sp && bb) working.push({ f: f, sporty: sp.eventId, bet9ja: bb.eventId, market: M.tipCode(f) });
    }
    if (working.length < 2) throw new Error("nothing bookable left after refusals");
  }
  if (!codes) throw new Error("could not book a slip both books accept - " + why);

  const entry = {
    date: date,
    generated: new Date().toISOString(),
    firstKickoff: working.map((p) => p.f.kickoff).filter(Boolean).sort()[0] || null,
    legs: working.map((p) => ({
      home: p.f.home, away: p.f.away, league: p.f.league || "",
      kickoff: p.f.kickoff || null, tip: p.f.tip, tip_p: p.f.tip_p, market: p.market,
    })),
    codes: codes,
  };
  console.log(`sporty: ${codes.sporty}   bet9ja: ${codes.bet9ja}`);

  let all = {};
  try { all = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) { /* first run */ }
  all[date] = entry;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(all, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${entry.legs.length} legs`);
})().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
