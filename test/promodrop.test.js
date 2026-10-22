"use strict";
/* The daily drop (owner, 16 Oct 2026): each queued post goes out once, on its day, from its time. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), path = require("path");
const { due, mediaUrl } = require("../scripts/promodrop.js");
const q = require("../data/promo-queue.json");

test("only today's drops from their time, never one already logged", () => {
  const at = (iso) => Date.parse(iso) - 3600e3;   /* a Lagos clock time */
  assert.deepEqual(due(q, {}, at("2026-10-17T12:00:00Z")).length, 0, "before 12:30 nothing");
  assert.deepEqual(due(q, {}, at("2026-10-17T12:31:00Z")).map((d) => d.kind), ["clip"]);
  assert.deepEqual(due(q, {}, at("2026-10-17T19:05:00Z")).map((d) => d.time).sort(), ["12:30", "14:00", "14:20", "16:31", "16:32", "19:00"]);
  assert.deepEqual(due(q, { "2026-10-17 12:30": {} }, at("2026-10-17T19:05:00Z")).map((d) => d.time).sort(), ["14:00", "14:20", "16:31", "16:32", "19:00"]);
});

test("every clip has its own cover and every post keeps the rules", () => {
  for (const d of q.drops) {
    if (d.kind === "clip") { assert.ok(d.video && d.cover, d.date + " has a video and a cover"); assert.ok(d.ig, "and an Instagram caption"); }
    for (const t of [d.x, d.ig].filter(Boolean)) {
      assert.doesNotMatch(t, /\bfree\b/i, "no free"); assert.doesNotMatch(t, /—/, "no em dash"); assert.match(t, /18\+/, "18+");
    }
  }
});

test("what Telegram fetches is under its 20 MB limit (the 18 Oct penalty clip was 33 MB)", () => {
  for (const d of q.drops) {
    const media = d.tgVideo || d.video || d.image;
    if (!media || d.date < "2026-10-18" || media.startsWith("/api/")) continue; // a server-drawn card (e.g. /api/slipcard?d=)
    const size = fs.statSync(path.join(__dirname, "..", "public", media)).size;
    assert.ok(size < 19.5e6, d.date + " " + d.time + " " + media + " is " + (size / 1e6).toFixed(1) + " MB");
  }
});

test("media comes from the repo through jsDelivr at the run's commit, over 20 MB from the site (22 Oct 2026)", () => {
  const site = "https://www.soccerwizard.live";
  assert.strictEqual(mediaUrl(site, "/promo/founding-wizards.mp4", "abc123"), "https://cdn.jsdelivr.net/gh/Skait0/Skypredict@abc123/public/promo/founding-wizards.mp4");
  assert.strictEqual(mediaUrl(site, "/promo/the-penalty.mp4", "abc123"), site + "/promo/the-penalty.mp4", "33 MB: jsDelivr refuses it");
  assert.strictEqual(mediaUrl(site, "/promo/founding-wizards.mp4", ""), site + "/promo/founding-wizards.mp4", "no commit, no jsDelivr");
  const ib = fs.readFileSync(path.join(__dirname, "..", "scripts", "ignore-build.sh"), "utf8");
  for (const p of ["public/promo", "data/promo-queue.json", "data/promo-log.json"]) assert.ok(ib.includes(":(exclude)" + p), p + " does not build the site");
});
