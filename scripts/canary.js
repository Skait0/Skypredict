"use strict";
/**
 * Does each bookmaker still take a slip and hand back the one we asked for?
 * OFFLINE / DAILY.
 *
 *   node scripts/canary.js [--books=sporty,bet9ja,betking,betpawa] [--dry]
 *
 * WHY THIS EXISTS AND WHAT IT IS NOT. Every failure this integration has had
 * was SILENT. A datacentre block page arrives as HTTP 200 with an empty list.
 * BetKing accepts a selection id it does not recognise and returns a perfectly
 * ordinary booking code containing nothing. An id field can change under us and
 * every booking keeps "succeeding". None of that raises an error anywhere, so
 * the first thing that notices is a reader whose code opens an empty betslip,
 * and the first thing WE hear is a complaint days later.
 *
 * So this books a real two-leg slip on each book, against the live public
 * routes the site itself uses, and reads the code back. It is a canary, not a
 * test suite: it proves the whole chain - our edge, the proxy, Railway, the
 * bookmaker, and the mapping in between - was working at one moment on real
 * fixtures. The unit tests prove the logic; only this proves the wire.
 *
 * TWO LEGS, NOT FIVE. Enough to be a multiple (a single is a different code
 * path at every book) and small enough that three books cost six selections a
 * day. `daily-code.js` already says what a booking call costs: Railway CPU on a
 * $5 plan and bookmaker goodwill that has been spent once already.
 *
 * WHAT COUNTS AS FAILURE, precisely, because a canary that cries wolf gets
 * switched off:
 *
 *   - the feed is empty, or has no fixture we can build two legs from
 *   - booking returns no code
 *   - the code reads back with a different number of legs than we sent
 *   - the code reads back with a market we did not ask for
 *
 * A bookmaker refusing a specific leg is NOT a failure - that is the
 * `unbookable` path working, and it retries with other fixtures. Neither is a
 * book we cannot read back: SportyBet and Bet9ja and BetKing can all be read
 * today, but a book that could not would still be worth booking on.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ORIGIN = process.env.SW_ORIGIN || "https://www.soccerwizard.live";
const DRY = process.argv.includes("--dry");
const arg = (n, d) => {
  const m = process.argv.find((a) => a.startsWith("--" + n + "="));
  return m ? m.slice(n.length + 3) : d;
};

/* Each book, the feed that lists its events and the argument its booking route
   calls the market. Read from here rather than branched on by name, the same
   rule the page's BOOKS table follows. */
/* `field` is what that book's booking response calls the code, and the three
   do not agree - SportyBet answers `booking_code` where the other two answer
   `code`. Taken from BOOKS[k].codeOf in public/index.html rather than guessed:
   the first draft of this script guessed, read `code` off a SportyBet reply
   that had booked perfectly well, and reported the book as down. A canary that
   is wrong about success is worse than no canary. */
const BOOKS = {
  sporty: { feed: "/api/fixtures", arg: "prediction", field: "booking_code", readable: true },
  bet9ja: { feed: "/api/bet9ja", arg: "code", field: "code", readable: true },
  betking: { feed: "/api/betking", arg: "code", field: "code", readable: true },
  betpawa: { feed: "/api/betpawa", arg: "code", field: "code", readable: true },
};

/* A market every book prices on essentially every fixture. The canary is about
   the WIRE, not about coverage - picking a thin market would make it fail for
   a reason that is nobody's fault. */
const MARKET = "1";

const get = async (path) => {
  const r = await fetch(ORIGIN + path, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  const body = await r.text();
  let json = null;
  try { json = JSON.parse(body); } catch (e) { /* left null on purpose */ }
  return { status: r.status, json, body };
};

/* Their feeds differ in shape: SportyBet sends an array, the other two an
   object keyed by event id. Normalised here into the only two things this
   script needs. */
function events(book, payload) {
  const m = (payload && payload.matches) || [];
  const rows = Array.isArray(m) ? m : Object.values(m);
  return rows.map((e) => ({
    eventId: e.eventId,
    kickoff: e.startTime || Date.parse(e.kickoff),
    name: e.teams || ((e.homeTeam || "") + " - " + (e.awayTeam || "")),
  })).filter((e) => e.eventId && isFinite(e.kickoff));
}

async function canary(key) {
  const B = BOOKS[key];
  const out = { book: key, ok: false, why: null, code: null };

  const feed = await get(B.feed);
  if (feed.status !== 200 || !feed.json || feed.json.success === false) {
    out.why = "feed " + feed.status + " " + String(feed.body).slice(0, 80);
    return out;
  }
  /* AN EMPTY FEED THAT SAYS success:true IS THE BLOCK PAGE, and it is exactly
     the shape this canary exists to notice. */
  const all = events(key, feed.json);
  if (all.length < 2) {
    out.why = "feed carried " + all.length + " usable events";
    return out;
  }

  /* Comfortably ahead of kick-off. A book drops a fixture the moment it starts,
     so a canary that picks the next game off the rank fails at teatime for a
     reason that is not a fault. */
  const soonest = Date.now() + 90 * 60 * 1000;
  const pool = all.filter((e) => e.kickoff > soonest);
  if (pool.length < 2) {
    out.why = "nothing kicking off far enough ahead (" + pool.length + ")";
    return out;
  }
  const legs = pool.slice(0, 2);

  if (DRY) {
    out.ok = true;
    out.why = "dry run: would book " + legs.map((l) => l.name).join(" + ");
    return out;
  }

  const sels = legs.map((l) => {
    const s = { eventId: String(l.eventId) };
    s[B.arg] = MARKET;
    return s;
  });
  const r = await fetch(ORIGIN + "/api/book?book=" + key, {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json" },
    body: JSON.stringify({ selections: sels }),
  });
  const d = await r.json().catch(() => null);
  const code = d && d.success && d[B.field];
  if (!code) {
    out.why = "booking " + r.status + " " + JSON.stringify(d).slice(0, 140);
    return out;
  }
  out.code = code;

  if (!B.readable) { out.ok = true; out.why = "booked (not readable)"; return out; }

  const back = await get("/api/slip?book=" + key + "&code=" + encodeURIComponent(code));
  if (back.status !== 200 || !back.json || !back.json.success) {
    out.why = "booked " + code + " but reading it back gave " + back.status +
      " " + String(back.body).slice(0, 90);
    return out;
  }
  const read = back.json.legs || [];
  /* THE CHECK THAT MATTERS. A code that exists and contains nothing is what a
     wrong selection id looks like, and it is indistinguishable from success
     anywhere else. */
  if (read.length !== sels.length) {
    out.why = "booked " + code + " with " + sels.length + " legs, read back " +
      read.length;
    return out;
  }
  const wrong = read.filter((l) => l.prediction && l.prediction !== MARKET);
  if (wrong.length) {
    out.why = "booked " + MARKET + ", read back " +
      wrong.map((l) => l.prediction).join(",");
    return out;
  }
  out.ok = true;
  out.why = code + ", " + read.length + " legs, " + MARKET + " intact";
  return out;
}

(async () => {
  const want = String(arg("books", Object.keys(BOOKS).join(","))).split(",");
  const results = [];
  for (const k of want) {
    if (!BOOKS[k]) { console.log(k + ": unknown book"); continue; }
    let r;
    try { r = await canary(k); }
    catch (e) { r = { book: k, ok: false, why: "threw: " + e.message }; }
    results.push(r);
    console.log((r.ok ? "ok   " : "FAIL ") + k.padEnd(9) + r.why);
  }
  const bad = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - bad.length) + "/" + results.length + " books answered");
  /* Non-zero so the workflow goes red and mails. A canary nobody is told about
     is a log line. */
  if (bad.length) process.exit(1);
})();
