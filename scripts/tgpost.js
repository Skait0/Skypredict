#!/usr/bin/env node
/* THE DAY'S POSTS FOR THE TELEGRAM CHANNEL, SENT BY THE BOT.
 *
 *   node scripts/tgpost.js [--dry]
 *
 * The same two posts X gets, decided by the same plan (xqueue.js): the newest
 * fully graded code's result, and the next code still to be played - never
 * once its first game is within half an hour. Each at most once;
 * data/tg-posts.json is the record, so a rerun cannot double-post.
 *
 * Telegram has no queue to schedule into, so both go now, in order.
 * TELEGRAM_BOT_TOKEN is the workflow secret; the bot must be an admin of the
 * channel with permission to post. No token, or a refusal: it says so and
 * exits 0 - missing a post costs a post, failing the mint run would cost more.
 */
const fs = require("fs");
const path = require("path");
process.env.SITE_ORIGIN = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const K = require("../lib/key.js");
const { plan } = require("./xqueue.js");

const ROOT = path.join(__dirname, "..");
const LOG = path.join(ROOT, "data", "tg-posts.json");
const CODES = path.join(ROOT, "data", "daily-codes.json");
const SITE = process.env.SITE_ORIGIN;
const CHAT = process.env.TELEGRAM_CHAT || "@soccerwizardTG";
const DRY = process.argv.includes("--dry");
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return d; } };

async function main() {
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token && !DRY) { console.log("no TELEGRAM_BOT_TOKEN - nothing sent"); return; }
  const codes = Object.values(readJSON(CODES, {})).filter((e) => e && e.date && e.legs);
  const log = readJSON(LOG, {});
  const pay = await (await fetch(SITE + "/predictions.json?t=" + Date.now())).json();
  const byFixture = new Map();
  for (const r of pay.results || []) {
    if (r && r.date && r.home && r.away) byFixture.set(K.fixtureKey(r.date, r.home, r.away), r);
  }
  const legDay = (l) => l.date || String(l.kickoff || "").slice(0, 10);
  const resultOf = (l) => byFixture.get(K.fixtureKey(legDay(l), l.home, l.away)) || null;

  const jobs = plan(codes, resultOf, log, Date.now());
  if (!jobs.length) { console.log("nothing new to send"); return; }
  if (DRY) { for (const j of jobs) console.log("--- " + j.id + "\n" + j.text); return; }

  for (const j of jobs) {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text: j.text }),
    });
    const b = await r.json().catch(() => null);
    /* The token is in the URL, so only Telegram's own description is echoed. */
    if (!b || !b.ok) { console.log(j.id + ": refused - " + ((b && b.description) || "http " + r.status)); continue; }
    log[j.id] = { message: b.result.message_id, sentAt: new Date().toISOString(), text: j.text };
    console.log(j.id + ": sent as message " + b.result.message_id);
  }
  fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n");
}

main().catch((e) => { console.log("telegram post failed: " + e.message); });
