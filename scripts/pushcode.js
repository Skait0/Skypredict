"use strict";

/* Tell everyone who asked that the day's booking code is up.
 *
 * Run by daily-code.yml immediately after the mint commits. Every failure path
 * here exits 0 on purpose: the code is already committed and published, and a
 * notification that did not go out is a smaller loss than a workflow that goes
 * red and trains everybody to ignore it.
 */

const fs = require("fs");
const path = require("path");

const { jwtFor, quietHours } = require("../lib/vapid.js");
const DB = require("../lib/supabase.js");

const CODES = path.join(__dirname, "..", "data", "daily-codes.json");
const ORIGIN = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";

function newestEntry(codes) {
  const days = Object.keys(codes || {}).sort();
  const date = days[days.length - 1];
  if (!date) return null;
  const e = codes[date];
  const c = (e && e.codes) || {};
  if (!(c.sporty || c.bet9ja || c.betking)) return null;
  return e;
}

/* THE RACE. The mint commits, Vercel builds, and a push sent now arrives
   before the site is serving the new code. So ask the live site what day it is
   showing, and only announce once it agrees. */
async function awaitDeploy(date, deps) {
  const fetchImpl = deps.fetchImpl || fetch;
  const tries = deps.tries === undefined ? 20 : deps.tries;
  const waitMs = deps.waitMs === undefined ? 15000 : deps.waitMs;
  const origin = deps.origin || ORIGIN;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(origin + "/code-today.json?t=" + Date.now());
      if (r.ok) {
        const d = await r.json();
        if (d && d.date === date) return true;
      }
    } catch (e) { /* a build in flight serves whatever it likes - just retry */ }
    if (waitMs && i < tries - 1) await new Promise((res) => setTimeout(res, waitMs));
  }
  return false;
}

async function sendAll(subs, deps) {
  const fetchImpl = deps.fetchImpl || fetch;
  const out = { sent: 0, failed: 0, dead: [] };
  const queue = subs.slice();
  async function worker() {
    for (;;) {
      const s = queue.shift();
      if (!s) return;
      try {
        const r = await fetchImpl(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: "vapid t=" + deps.jwt(s.endpoint) + ", k=" + deps.publicKey,
            TTL: "3600",
            Urgency: "normal",
          },
          /* Every other outbound call in this repo gives up after 8s
             (lib/supabase.js's call()); this one had nothing, so a single
             push service holding the socket open could eat the whole
             workflow step. Ten, because a push service under load is slower
             than PostgREST and a needless abort costs a reader their
             notification. */
          signal: AbortSignal.timeout(10000),
        });
        if (r.status === 404 || r.status === 410) out.dead.push(s.endpoint);
        else if (r.ok) out.sent++;
        else out.failed++;                 /* 429 and 5xx: tomorrow retries */
      } catch (e) {
        /* Including the abort. A timeout says nothing about the subscription
           - dropping a row because their server was slow unsubscribes a
           reader who never asked to be. Failed, so tomorrow retries. */
        out.failed++;
      }
    }
  }
  await Promise.all([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(worker));
  return out;
}

async function main() {
  /* A missing or half-written codes file must not throw here: the read/parse
     is the one spot in this file that isn't already an answer-object, and an
     unguarded throw inside an async function becomes an unhandled rejection
     that reds out the workflow the moment the code has already published. */
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CODES, "utf8"));
  } catch (e) {
    console.log("cannot read " + CODES + ": " + (e && e.message));
    return;
  }
  const entry = newestEntry(raw);
  if (!entry) { console.log("no code to announce"); return; }

  if (quietHours(Date.now())) { console.log("quiet hours in Lagos - not sending"); return; }

  const priv = process.env.VAPID_PRIVATE_KEY;
  const pub = process.env.VAPID_PUBLIC_KEY;
  if (!priv || !pub) { console.log("no VAPID keys in the environment - not sending"); return; }

  if (!(await awaitDeploy(entry.date, {}))) {
    console.log("the site is not serving " + entry.date + " yet - not sending");
    return;
  }
  /* Checked again: a run that started at 21:55 and waited out the deploy must
     not send at 22:00. */
  if (quietHours(Date.now())) { console.log("quiet hours by the time the deploy landed"); return; }

  const list = await DB.listPushSubs();
  if (!list.ok) { console.log("cannot read subscriptions: " + list.why); return; }
  if (!list.rows.length) { console.log("nobody is subscribed"); return; }

  /* One JWT per push service, not per subscriber: the audience is the origin,
     and this site will have thousands of rows across four of them. */
  const cache = new Map();
  const jwt = (endpoint) => {
    const aud = new URL(endpoint).origin;
    if (!cache.has(aud)) cache.set(aud, jwtFor(endpoint, { privateKeyB64: priv }));
    return cache.get(aud);
  };

  const out = await sendAll(list.rows, { jwt, publicKey: pub });
  /* The number the database confirmed, not the number we handed it. The drop
     is chunked and can fail halfway, and the old log printed out.dead.length
     regardless - so a delete that 414'd every morning read as a clean sweep. */
  let dropped = 0;
  if (out.dead.length) {
    const gone = await DB.dropPushSubs(out.dead);
    dropped = gone.dropped;
    if (!gone.ok) console.log("could not drop every dead subscription: " + gone.why);
  }
  console.log("sent " + out.sent + ", dropped " + dropped + ", failed " + out.failed);

  /* The one case that is worth a red workflow: nothing got through at all.
     That is the keys being wrong, not the weather. */
  if (!out.sent && !out.dead.length && out.failed) process.exitCode = 1;
}

/* Structural, not spot-patched: whatever guard above gets missed by a future
   edit, this still stops it going red. A push that failed to send is not
   worth the workflow's own signal. */
if (require.main === module) {
  main().catch((e) => { console.log("pushcode failed: " + (e && e.message)); });
}

module.exports = { newestEntry, awaitDeploy, sendAll, main };
