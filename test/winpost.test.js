"use strict";

/**
 * Won slips go to the Telegram channel and X with a banner, credited to a wizard
 * rank, never to a person or a code (owner, 12 Oct 2026). x5 or more, at most 3 a
 * day per channel, biggest first.
 */

const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/winpost.js");
const CARD = require("../lib/slipcard.js");

const LAGOS = 3600e3;
const dayOf = (t) => new Date(t + LAGOS).toISOString().slice(0, 10);
const hourOf = (t) => new Date(t + LAGOS).getUTCHours();
const at = (h) => Date.UTC(2026, 9, 12, h - 1);               /* h o'clock Lagos */
const slip = (id, odds, over) => Object.assign({ id, status: "landed", book: "sporty", total_odds: odds, leg_count: 3,
  settled_at: new Date(at(15)).toISOString(), legs: [{ name: "Arsenal to win" }, { name: "Lazio over 1.5 goals" }, { name: "Porto or draw" }] }, over || {});

test("the rank follows the odds, and below x5 there is no post", () => {
  assert.strictEqual(P.rankOf(4.99), null);
  assert.strictEqual(P.rankOf(5).id, "apprentice");
  assert.strictEqual(P.rankOf(24.6).id, "sorcerer");
  assert.strictEqual(P.rankOf(124.5).id, "archmage");
  assert.strictEqual(P.rankOf(20796).id, "grandwizard");
});

test("biggest first, x5 and up only, three a day per channel", () => {
  const landed = [slip(1, 6), slip(2, 300), slip(3, 4.2), slip(4, 12), slip(5, 55)];
  assert.deepStrictEqual(P.pick(landed, [], "tg", at(18), dayOf, hourOf).map((s) => s.id), [2, 5, 4]);
});

test("what went out today counts against the three, and nothing is posted twice", () => {
  const landed = [slip(1, 6), slip(2, 300), slip(4, 12)];
  const log = [{ key: "win|2|tg", channel: "tg", kind: "win", posted_at: new Date(at(16)).toISOString() },
               { key: "win|9|tg", channel: "tg", kind: "win", posted_at: new Date(at(16)).toISOString() }];
  assert.deepStrictEqual(P.pick(landed, log, "tg", at(18), dayOf, hourOf).map((s) => s.id), [4]);
  assert.deepStrictEqual(P.pick(landed, log, "x", at(18), dayOf, hourOf).map((s) => s.id), [2, 4, 1], "each channel has its own three");
});

test("nothing goes out at night, and yesterday's wins are not today's posts", () => {
  assert.deepStrictEqual(P.pick([slip(1, 50)], [], "tg", at(3), dayOf, hourOf), []);
  const old = slip(1, 50, { settled_at: new Date(at(15) - 864e5).toISOString() });
  assert.deepStrictEqual(P.pick([old], [], "tg", at(18), dayOf, hourOf), []);
});

test("the captions credit a rank, never a person or a code", () => {
  const s = slip(7, 124.5, { code: "SECRET1", subject: "u:42", who: "user" });
  const tg = P.caption(s, "tg"), x = P.caption(s, "x");
  assert.match(tg, /An Archmage just landed ×124\.50/);
  assert.match(tg, /✅ Arsenal to win/);
  assert.match(x, /One of our Archmages just landed ×124\.50 on SportyBet/);
  for (const t of [tg, x]) { assert.doesNotMatch(t, /SECRET1|u:42/); assert.doesNotMatch(t, /\bfree\b/i); }
  assert.ok(x.length <= 280, "fits on X: " + x.length);
});

test("a slip with an id links its list banner by id, and nothing else", () => {
  assert.strictEqual(P.imageUrl("https://www.soccerwizard.live", slip(42, 11.55)), "https://www.soccerwizard.live/api/slipcard?w=42");
});

test("the banner exists for every rank the captions can name", () => {
  for (const odds of [5, 24.6, 124.5, 20796]) {
    const url = P.imageUrl("https://www.soccerwizard.live", slip(undefined, odds));
    const q = new URL(url).searchParams;
    const png = CARD.buildWin(q.get("r"), q.get("g"), q.get("o"));
    assert.ok(png && png.length > 1000, "banner for " + q.get("r"));
    assert.strictEqual(png.slice(1, 4).toString(), "PNG");
  }
});

/* A WIN THE OWNER CAN SHARE (12 Oct 2026: "a win just came in. there is no way for me to share it"). */
test("the owner gets a shareable copy of every channel win, and the admin page can share it", () => {
  const fs = require("fs"), path = require("path");
  const social = fs.readFileSync(path.join(__dirname, "..", "api", "social.js"), "utf8");
  assert.match(social, /if \(ok && ch === "tg" && owner\) await postTGPhoto\(img, WIN\.caption\(s, "x"\), owner\);/,
    "after the channel post, the same banner goes to the owner's own chat");
  const ping = fs.readFileSync(path.join(__dirname, "..", "lib", "ownerping.js"), "utf8");
  assert.match(ping, /await sendPhoto\(owner, WIN\.imageUrl\(SITE, slip\), WIN\.caption\(slip, "x"\)\);/,
    "the x20 ping is the banner itself, ready to forward");
  const account = fs.readFileSync(path.join(__dirname, "..", "api", "account.js"), "utf8");
  assert.match(account, /share: \{ img: WIN\.imageUrl\(SITE, h\), x: WIN\.caption\(h, "x"\), tg: WIN\.caption\(h, "tg"\) \}/);
  const ui = require("../public/account-ui.js");
  const html = ui.hitsHtml([{ status: "landed", code: "ABC12", book: "sporty", total_odds: 11.55, leg_count: 7, legs: [],
    share: { img: "https://x/a.png", x: "cap", tg: "cap" } }]);
  assert.match(html, /data-share=/);
  assert.doesNotMatch(ui.hitsHtml([{ status: "check", code: "ABC12", book: "sporty", total_odds: 11.55, legs: [] }]), /data-share=/,
    "only a landed win can be shared");
});
