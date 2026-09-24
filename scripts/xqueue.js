#!/usr/bin/env node
/* THE DAY'S POSTS FOR @SoccerWizardhq, QUEUED IN BUFFER.
 *
 *   node scripts/xqueue.js [--dry]
 *
 * X's own API charges per post since February 2026; Buffer's free plan posts
 * to X and gives one API key. So this queues the posts and Buffer publishes
 * them - and Buffer's app IS the console: the queue, edit, hold, post now,
 * delete and what went out, on the web and on a phone, for nothing. Building
 * a second one would put the key behind a web page for no gain.
 *
 * Two posts, each at most once (data/x-posts.json is the record, and the
 * reason a rerun cannot double-post):
 *   - the result of the newest fully graded code from the last two days,
 *     posted now - graded by the same results and the same legVerdict the
 *     code pages use, so a post cannot say what the site does not;
 *   - the newest code that is still to be played, 45 minutes after it, so the
 *     two do not land on top of each other. Never once its first game has
 *     kicked off.
 *
 * The key comes from BUFFER_KEY (the workflow's secret) or ~/.buffer.key.
 * No key, no Buffer, or a refusal: it says so and exits 0. Missing a post
 * costs a post; failing the mint run for it would cost more.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
/* Before pages.js reads it: a GitHub runner has no SITE_ORIGIN, and the
   fallback there is the preview domain, not the one readers know. */
process.env.SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const P = require("../lib/pages.js");
const K = require("../lib/key.js");
const { LAGOS_OFFSET_MS } = require("../lib/quota.js");

const ROOT = path.join(__dirname, "..");
const LOG = path.join(ROOT, "data", "x-posts.json");
const CODES = path.join(ROOT, "data", "daily-codes.json");
const SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const API = "https://api.buffer.com";
const DRY = process.argv.includes("--dry");
const GAP_MS = 45 * 60 * 1000;

function key() {
  const p = path.join(os.homedir(), ".buffer.key");
  return (process.env.BUFFER_KEY || "").trim() || (fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : "");
}
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };

async function gql(k, query) {
  const r = await fetch(API, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + k },
    body: JSON.stringify({ query }) });
  const b = await r.json().catch(() => null);
  if (!r.ok || !b || b.errors) throw new Error("Buffer " + r.status + ": " + JSON.stringify(b && b.errors || b).slice(0, 200));
  return b.data;
}

/* The pure part: what should go out now, given the codes, the results and
   what has already gone. Exported so the test can hold it to its rules. */
function plan(codes, resultOf, log, now) {
  const today = new Date(now + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
  const twoAgo = new Date(now + LAGOS_OFFSET_MS - 2 * 864e5).toISOString().slice(0, 10);
  const byNew = codes.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const out = [];
  const graded = byNew.find((e) => e.date < today && e.date >= twoAgo &&
    (P.codeSummary(e.legs, resultOf) || {}).all);
  if (graded && !log[graded.date + "|result"]) {
    out.push({ id: graded.date + "|result", text: P.xResultPost(graded, resultOf), at: now });
  }
  const code = byNew.find((e) => e.date >= today);
  const first = code && Date.parse(code.firstKickoff || "");
  if (code && !log[code.date + "|code"] && !(first && first < now + 30 * 60 * 1000)) {
    out.push({ id: code.date + "|code", text: P.xCodePost(code), at: out.length ? now + GAP_MS : now });
  }
  return out;
}

async function main() {
  const k = key();
  if (!k && !DRY) { console.log("no Buffer key - nothing queued"); return; }
  const codes = Object.values(readJSON(CODES, {})).filter((e) => e && e.date && e.legs);
  const log = readJSON(LOG, {});
  /* The results the live board holds, keyed as the build keys them. */
  const pay = await (await fetch(SITE + "/predictions.json?t=" + Date.now())).json();
  const byFixture = new Map();
  for (const r of pay.results || []) {
    if (r && r.date && r.home && r.away) byFixture.set(K.fixtureKey(r.date, r.home, r.away), r);
  }
  const legDay = (l) => l.date || String(l.kickoff || "").slice(0, 10);
  const resultOf = (l) => byFixture.get(K.fixtureKey(legDay(l), l.home, l.away)) || null;

  const jobs = plan(codes, resultOf, log, Date.now());
  if (!jobs.length) { console.log("nothing new to post"); return; }
  if (DRY) { for (const j of jobs) console.log("--- " + j.id + " at " + new Date(j.at).toISOString() + "\n" + j.text); return; }

  const org = (await gql(k, "{account{organizations{id}}}")).account.organizations[0].id;
  const ch = (await gql(k, `{channels(input:{organizationId:${JSON.stringify(org)}}){id service}}`))
    .channels.find((c) => c.service === "twitter");
  if (!ch) { console.log("no X channel connected in Buffer - nothing queued"); return; }

  for (const j of jobs) {
    const now = j.at <= Date.now() + 60000;
    const res = (await gql(k, `mutation{createPost(input:{text:${JSON.stringify(j.text)},
      channelId:${JSON.stringify(ch.id)},schedulingType:automatic,
      mode:${now ? "shareNow" : "customScheduled"}${now ? "" : ",dueAt:" + JSON.stringify(new Date(j.at).toISOString())}}){
      __typename ... on PostActionSuccess{post{id status dueAt}} ... on MutationError{message}}}`)).createPost;
    if (res.__typename !== "PostActionSuccess") { console.log(j.id + ": refused - " + (res.message || res.__typename)); continue; }
    log[j.id] = { buffer: res.post.id, status: res.post.status, dueAt: res.post.dueAt || new Date(j.at).toISOString(),
                  queuedAt: new Date().toISOString(), text: j.text };
    console.log(j.id + ": " + res.post.status + " " + (res.post.dueAt || "now"));
  }
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n");
}

if (require.main === module) main().catch((e) => { console.log("x queue failed: " + e.message); });
module.exports = { plan };
