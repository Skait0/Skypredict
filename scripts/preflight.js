"use strict";

/**
 * Is the site fit to send traffic at right now?
 *
 * Written for a paid influencer campaign, where the thread's whole argument is
 * "go and check us yourself". That makes a stale board or a wrong figure worse
 * than no campaign at all: somebody checks, the number does not match, and
 * they stop believing everything else in the thread.
 *
 * So this checks the things a burst of new readers would actually hit, in the
 * order they would hit them, and prints the one line that has to be pasted into
 * the post rather than leaving anybody to read it off a screenshot.
 *
 * It hits the LIVE site and the LIVE API on purpose. Everything else in this
 * repo tests the code; this tests the deployment, which is a different question
 * and the only one that matters an hour before a campaign.
 *
 *   node scripts/preflight.js           the checks
 *   node scripts/preflight.js --value   also re-run the campaign's value claim
 *
 * Exits non-zero if anything fails, so it can gate a push.
 */

const https = require("https");

const SITE = process.env.SW_SITE || "https://www.soccerwizard.live";
const API = process.env.SW_API || "https://web-production-798c0.up.railway.app";
const TIMEOUT_MS = 35000;

function fetchIt(url, raw) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ err: "timed out after " + (TIMEOUT_MS / 1000) + "s" }), TIMEOUT_MS);
    https.get(url, (r) => {
      let s = "";
      r.on("data", (d) => { s += d; });
      r.on("end", () => {
        clearTimeout(t);
        if (raw) return resolve({ code: r.statusCode, text: s });
        try { resolve({ code: r.statusCode, json: JSON.parse(s) }); }
        catch (e) { resolve({ code: r.statusCode, err: "response was not JSON" }); }
      });
    }).on("error", (e) => { clearTimeout(t); resolve({ err: e.message }); });
  });
}

const rows = [];
function check(name, pass, detail) { rows.push({ name, pass: !!pass, detail: String(detail) }); }

/* The odds market codes, against the probability field each one is scored from.
   Kept here rather than imported because index.html is a standalone file and
   lib/ cannot reach into it. If a market is ever added there, add it here too
   or the value check quietly measures a smaller board. */
const MARKETS = {
  "1": "home_p", "2": "away_p", "X": "draw_p",
  "1X": "dc1x", "X2": "dcx2", "12": "dc12",
  "OVER_1.5": "o15", "OVER_2.5": "o25", "OVER_3.5": "o35",
  "GG": "btts", "FH_OVER_0.5": "fh_o05",
  "HOME_OVER_0.5": "h_o05", "AWAY_OVER_0.5": "a_o05",
  "HOME_OVER_1.5": "h_o15", "AWAY_OVER_1.5": "a_o15",
};
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* How much probability a leg buys per unit of odds it costs. Same formula the
   wizard uses in index.html. Negative, and closer to zero is better; -1 is a
   fairly priced bet, and anything below that is the bookmaker's margin. */
function edge(p, od) { return Math.log(p) / Math.log(od); }

/* Greedily fill to a target payout, taking legs in whatever order the caller
   ranked them. Returns the legs used and the chance every one of them lands. */
function toTarget(legs, target) {
  let prod = 1, prob = 1, used = 0;
  for (const l of legs) {
    if (prod >= target) break;
    prod *= l.od; prob *= l.p; used++;
  }
  return { used, prod, prob, reached: prod >= target };
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);

  /* 1. the board itself */
  const P = await fetchIt(SITE + "/predictions.json");
  const payload = P.json || {};
  const fixtures = payload.fixtures || [];
  const record = payload.record || {};

  check("site answers", P.code === 200, P.err || ("HTTP " + P.code));
  /* The build runs on a Vercel cron at 06:30 UTC. A `generated` date of
     yesterday means it did not run, and the board being a day stale is the
     single worst thing to send new readers at. */
  check("board built today", payload.generated === today,
        "generated " + payload.generated + (payload.generated === today ? "" : " (expected " + today + ")"));
  check("fixtures on board", fixtures.length > 50, fixtures.length + " fixtures");
  check("games on today", fixtures.filter((f) => f.date === today).length > 0,
        fixtures.filter((f) => f.date === today).length + " today");
  check("every fixture has a tip", fixtures.every((f) => f.tip),
        fixtures.filter((f) => !f.tip).length + " missing");
  check("pick of the day set", !!(payload.potd && payload.potd.home),
        payload.potd ? payload.potd.home + " v " + payload.potd.away : "none");

  /* 2. the record, which is the number that gets pasted into the post */
  const pct = record.total ? Math.round((record.correct / record.total) * 100) : null;
  check("record present", record.total > 0,
        record.correct + " of " + record.total + " over " + record.days + " days (" + pct + "%)");
  /* The whole pitch is that the misses are published. A record showing no
     losses is either broken or looks like a lie, and both are fatal here. */
  check("record shows its losses", record.total > record.correct,
        (record.total - record.correct) + " misses published");

  /* 3. the booking paths, because the post promises a code in one tap */
  const [sporty, bet9ja, live] = await Promise.all([
    fetchIt(API + "/api/fixtures"),
    fetchIt(API + "/api/bet9ja/fixtures"),
    fetchIt(API + "/api/livescores"),
  ]);
  const spN = (sporty.json && sporty.json.matches || []).length;
  const b9N = bet9ja.json && bet9ja.json.matches ? Object.keys(bet9ja.json.matches).length : 0;
  check("SportyBet booking", sporty.code === 200 && spN > 100, spN + " fixtures");
  check("Bet9ja booking", bet9ja.code === 200 && b9N > 100, b9N + " fixtures");
  check("live scores", live.code === 200, live.err || ("HTTP " + live.code));

  /* 4. two things that quietly undo a campaign */
  const robots = await fetchIt(SITE + "/robots.txt", 1);
  check("robots.txt allows crawling", /Allow:\s*\//.test(robots.text || ""), "ok");
  const sw = await fetchIt(SITE + "/sw.js", 1);
  check("service worker kill switch off", /const KILL = false/.test(sw.text || ""),
        /const KILL = true/.test(sw.text || "") ? "ARMED - the worker is disabling itself" : "as shipped");

  /* ---------------------------------------------------------------- report */
  const w = Math.max.apply(null, rows.map((r) => r.name.length));
  console.log("\n  " + SITE + "   " + new Date().toISOString().slice(0, 16) + "Z\n");
  rows.forEach((r) => {
    console.log("  " + (r.pass ? "PASS" : "FAIL") + "  " + r.name.padEnd(w) + "  " + r.detail);
  });
  const failed = rows.filter((r) => !r.pass).length;
  console.log("\n  " + (failed ? failed + " CHECK(S) FAILED - do not send traffic yet" : "all clear"));

  if (record.total) {
    console.log("\n  Paste into the record post:");
    console.log("      " + record.correct + " of " + record.total + " over " + record.days + " days");
  }

  /* --------------------------------------------- the campaign's value claim */
  if (process.argv.includes("--value")) {
    const odds = {};
    (sporty.json && sporty.json.matches || []).forEach((m) => {
      odds[norm(m.homeTeam) + "|" + norm(m.awayTeam)] = m.odds || {};
    });
    const perFixture = [];
    fixtures.forEach((f) => {
      const o = odds[norm(f.home) + "|" + norm(f.away)];
      if (!o) return;
      const homeFav = f.home_p > f.away_p;
      const cands = [];
      for (const code of Object.keys(MARKETS)) {
        /* The same sanity rule both builders apply: never back a side against
           the model's own favourite. */
        if (code === "1" && !homeFav) continue;
        if (code === "2" && homeFav) continue;
        if (code === "1X" && !homeFav) continue;
        if (code === "X2" && homeFav) continue;
        const p = f[MARKETS[code]], od = o[code];
        /* Real prices only. index.html falls back to (1/p)^0.85 when SportyBet
           has not priced a market, and that fallback makes edge a constant, so
           including it would measure nothing. */
        if (!(p > 0.02 && p < 0.99) || !(od > 1.01)) continue;
        cands.push({ code, p, od, e: edge(p, od) });
      }
      if (cands.length) perFixture.push(cands);
    });

    console.log("\n  Value claim, on " + perFixture.length + " fixtures with real prices");
    console.log("  target   strategy             games   chance all land");
    [5, 10, 20].forEach((t) => {
      const safe = toTarget(perFixture.map((cs) => cs.reduce((a, b) => (b.p > a.p ? b : a)))
                                      .sort((a, b) => b.p - a.p), t);
      const val = toTarget(perFixture.map((cs) => cs.reduce((a, b) => (b.e > a.e ? b : a)))
                                     .sort((a, b) => b.e - a.e), t);
      if (!safe.reached || !val.reached) { console.log("  x" + String(t).padEnd(7) + "board too small"); return; }
      console.log("  x" + String(t).padEnd(7) + "safest markets".padEnd(21) +
                  String(safe.used).padStart(5) + "   " + (safe.prob * 100).toFixed(1).padStart(6) + "%");
      console.log("  " + " ".repeat(7) + "best-value markets".padEnd(21) +
                  String(val.used).padStart(5) + "   " + (val.prob * 100).toFixed(1).padStart(6) + "%" +
                  "   -> " + (val.prob / safe.prob).toFixed(1) + "x");
    });
    console.log("\n  The posted copy says \"about 20 games\" against \"about 5\".");
    console.log("  If x10 has drifted far from that, change the copy, not the claim.");
  }

  process.exit(failed ? 1 : 0);
})();
