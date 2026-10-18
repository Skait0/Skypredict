"use strict";
/* THE DAILY DROP, TELEGRAM SIDE (owner, 16 Oct 2026). data/promo-queue.json holds
   the plan: a clip a day at 12:30 Lagos and feature posts at 19:00. X and Instagram
   are scheduled in Buffer; this posts the same drops to the channel. Run by
   .github/workflows/promo-drop.yml at both times: anything due today and not yet in
   data/promo-log.json goes out once, through scripts/tgpin.js (an .mp4 goes as a
   video, an image as a photo). A clip over 20 MB carries tgVideo, a smaller copy:
   Telegram refuses to fetch bigger files (WEBPAGE_CURL_FAILED, 18 Oct 2026). --dry prints what would go. */
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const QUEUE = path.join(ROOT, "data", "promo-queue.json"), LOG = path.join(ROOT, "data", "promo-log.json");
const LAGOS_MS = 3600e3;

function due(queue, log, nowMs) {
  const t = new Date(nowMs + LAGOS_MS).toISOString();
  const today = t.slice(0, 10), hhmm = t.slice(11, 16);
  return (queue.drops || []).filter((d) => d.date === today && d.time <= hhmm && !log[d.date + " " + d.time]);
}

function main() {
  const queue = JSON.parse(fs.readFileSync(QUEUE, "utf8"));
  const log = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : {};
  const list = due(queue, log, Date.now());
  if (!list.length) { console.log("nothing due"); return; }
  for (const d of list) {
    const media = d.tgVideo || d.video || d.image; // tgVideo: a copy under the 20 MB Telegram fetch limit
    const env = Object.assign({}, process.env, { TG_PIN: "0", TG_PIN_TEXT: d.x, TG_PHOTOS: media ? queue.site + media : "" });
    if (process.argv.includes("--dry")) { console.log("would post", d.date, d.time, d.kind, media || "(text)"); continue; }
    execFileSync(process.execPath, [path.join(__dirname, "tgpin.js")], { env, stdio: "inherit" });
    log[d.date + " " + d.time] = { kind: d.kind, at: new Date().toISOString() };
    fs.writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n");
  }
}
if (require.main === module) main();
module.exports = { due };
