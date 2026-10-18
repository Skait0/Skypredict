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

test("nothing goes out at night; a late win goes out next morning; older than a day, never", () => {
  assert.deepStrictEqual(P.pick([slip(1, 50)], [], "tg", at(3), dayOf, hourOf), []);
  const old = slip(1, 50, { settled_at: new Date(at(15) - 864e5).toISOString() });
  assert.deepStrictEqual(P.pick([old], [], "tg", at(18), dayOf, hourOf), []);
  /* settled 22:50 Lagos last night, after the window shut: posted at 09:00 */
  const late = slip(2, 12, { settled_at: new Date(at(23) - 864e5 - 10 * 60e3).toISOString() });
  assert.deepStrictEqual(P.pick([late], [], "tg", at(9), dayOf, hourOf).map((s) => s.id), [2]);
});

test("the morning recap: yesterday's x5+ wins, the biggest, no count of the losers", () => {
  const y = dayOf(at(15) - 864e5), prev = (h) => new Date(at(h) - 864e5).toISOString();
  const rows = [slip(1, 10.11, { settled_at: prev(21) }), slip(2, 6.7, { settled_at: prev(23) }), slip(3, 4.2, { settled_at: prev(20) }),
    slip(4, 99, { settled_at: new Date(at(9)).toISOString() })];
  const t = P.recap(rows, y, dayOf);
  assert.match(t, /Yesterday 2 Soccerwizard slips landed at x5 or more\. Biggest: ×10\.11/, "x4.2 and today's x99 are not yesterday's x5+ wins");
  assert.match(t, /18\+/); assert.doesNotMatch(t, /—|free|load am| of \d+ slips/i);
  assert.match(P.recap([rows[0]], y, dayOf), /Yesterday a Soccerwizard slip landed ×10\.11\./);
  assert.strictEqual(P.recap([rows[2]], y, dayOf), null, "no x5+ win yesterday, no post");
  const fs = require("fs"), path = require("path");
  const social = fs.readFileSync(path.join(__dirname, "..", "api", "social.js"), "utf8");
  assert.match(social, /S\.hourOf\(now\) === 10 && recapDue/, "the recap goes out at 10:00 Lagos");
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
  assert.match(P.imageUrl("https://www.soccerwizard.live", slip(42, 11.55)), /^https:\/\/www\.soccerwizard\.live\/api\/slipcard\?w=42(&n=\d+)?$/);
  assert.notStrictEqual(P.imageUrl("s", { id: 7, legs: [{}] }), P.imageUrl("s", { id: 7, legs: [{}, {}] }), "a filled row gets a new card URL");
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
  assert.match(social, /await postTGPhoto\(WIN\.imageUrl\(SITE, s\), WIN\.askText\(s\), owner\)/,
    "each new win's banner goes to the owner's own chat, ready to forward");
  const ping = fs.readFileSync(path.join(__dirname, "..", "lib", "ownerping.js"), "utf8");
  assert.match(ping, /await sendPhoto\(owner, WIN\.imageUrl\(SITE, slip\), WIN\.caption\(slip, "x"\)\);/,
    "the x20 ping is the banner itself, ready to forward");
  const account = fs.readFileSync(path.join(__dirname, "..", "api", "account.js"), "utf8");
  assert.match(account, /share = \{ img: WIN\.imageUrl\(SITE, h\), x: WIN\.caption\(h, "x"\), tg: WIN\.caption\(h, "tg"\) \}/);
  const ui = require("../public/account-ui.js");
  const html = ui.hitsHtml([{ status: "landed", code: "ABC12", book: "sporty", total_odds: 11.55, leg_count: 7, legs: [],
    share: { img: "https://x/a.png", x: "cap", tg: "cap" } }]);
  assert.match(html, /data-share=/);
  assert.doesNotMatch(ui.hitsHtml([{ status: "check", code: "ABC12", book: "sporty", total_odds: 11.55, legs: [] }]), /data-share=/,
    "only a landed win can be shared");
});

test("a landed slip with games off our board opens every leg, not only the tracked ones", () => {
  /* owner, 18 Oct 2026: "a landed slip thats 14 games but i can only see 5" */
  const ui = require("../public/account-ui.js");
  const legs = [1, 2, 3, 4, 5].map((i) => ({ name: "Team " + i + " to win" }));
  const html = ui.hitsHtml([{ id: 9, status: "landed", code: "ABC12", book: "sporty", total_odds: 60, leg_count: 14, legs }]);
  assert.match(html, /data-chk='9'[^>]*>See all 14 games</);
  assert.doesNotMatch(html, /Show 2 more/, "no partial list that reads as the whole slip");
  assert.match(html, /data-chkbox='9'/);
  assert.doesNotMatch(html, /data-settle=/, "a landed slip is already settled");
  const full = ui.hitsHtml([{ id: 9, status: "landed", code: "ABC12", book: "sporty", total_odds: 60, leg_count: 5, legs }]);
  assert.doesNotMatch(full, /data-chk=/); assert.match(full, /Show 2 more/);
});

test("the Telegram caption counts every game, not only the ones on our board", () => {
  const WIN = require("../lib/winpost.js");
  const c = WIN.caption({ book: "sporty", total_odds: 60, leg_count: 14, legs: [{ name: "A" }, { name: "B" }] }, "tg");
  assert.match(c, /…and 12 more/); assert.match(c, /14 games on SportyBet/);
});

test("a slip with pushes posts what it paid, not the booked odds (owner, 18 Oct 2026)", () => {
  const WIN = require("../lib/winpost.js");
  const legs = [{ name: "Iberia +2 handicap", odds: 5.6, verdict: "void" }, { name: "Hajduk +1 handicap", odds: 1.25, verdict: "won" },
    { name: "Celta +1 handicap", odds: 1.15, verdict: "void" }, { name: "Palace +1 handicap", odds: 1.35, verdict: "void" }];
  const row = { id: 73, book: "sporty", status: "landed", total_odds: 121.88, leg_count: 14, legs };
  assert.deepStrictEqual(WIN.paid(row), { odds: 14.02, pushed: 3, won: 11, games: 14 });
  assert.match(WIN.caption(row, "x"), /×14\.02 on SportyBet: 14 games, 11 won, 3 voided \(stake back\)/);
  assert.doesNotMatch(WIN.caption(row, "x"), /every leg won|121/);
  assert.match(WIN.caption(row, "tg"), /↩️ Iberia \+2 handicap \(voided\)/);
  assert.match(WIN.imageUrl("s", row), /&p=3$/, "a new card once the pushes are known");
  assert.strictEqual(WIN.paid({ total_odds: 50, leg_count: 2, legs: [{ name: "a", verdict: "void" }, { name: "b" }] }).odds, null,
    "a push without its price is not posted as a win");
  assert.strictEqual(WIN.paid({ total_odds: 50, leg_count: 2, legs: [{ name: "a", odds: 2 }, { name: "b", odds: 25 }], seen: { 0: "void" } }).odds, 25,
    "the grader's seen marks count too");
});

test("win approvals: nothing posts by itself; the owner is asked once per new win (owner, 18 Oct 2026)", () => {
  const WIN = require("../lib/winpost.js");
  const now = Date.parse("2026-10-19T11:00:00Z"), hourOf = () => 12;
  const win = (id, odds, over) => Object.assign({ id, status: "landed", book: "sporty", total_odds: odds, leg_count: 3, legs: [], settled_at: "2026-10-19T09:00:00Z" }, over || {});
  const rows = [win(1, 12), win(2, 3), win(3, 40), win(4, 9, { settled_at: "2026-10-17T09:00:00Z" }), win(5, 20)];
  const log = [{ key: "winask|3" }, { key: "win|5|tg" }];
  assert.deepStrictEqual(WIN.toAsk(rows, log, now, hourOf).map((s) => s.id), [1],
    "x3 is under x5, #3 was asked already, #4 is older than a day, #5 is already on a channel");
  assert.deepStrictEqual(WIN.toAsk(rows, [], now, () => 23), [], "not at night");
  assert.match(WIN.askText(win(1, 12)), /waiting for your OK: ×12.00 · 3 games, every leg won/);
  const fs = require("fs"), path = require("path");
  const social = fs.readFileSync(path.join(__dirname, "..", "api", "social.js"), "utf8");
  assert.ok(!social.includes("WIN.pick("), "the hourly run no longer posts wins");
  assert.match(social, /kind: "winask"/);
});

test("today at a glance adds up the day (owner, 18 Oct 2026)", () => {
  const G = require("../lib/glance.js");
  const dayOf = (ms) => new Date(ms + 3600e3).toISOString().slice(0, 10);
  const out = G.glance({ day: "2026-10-19", yesterday: "2026-10-18", dayOf,
    stats: { codesToday: 40, signupsToday: 3, activeToday: 12 },
    results: [{ match_date: "2026-10-19", hit: true }, { match_date: "2026-10-19", hit: false }, { match_date: "2026-10-18", hit: true },
      { match_date: "2026-10-19", hit: true, source: "sweep" }, { match_date: "2026-10-19", home: "A", away: "B", hg: 2, ag: 0, hit: true }],
    ladder: [{ day: "2026-10-19", rung: 10, legs: [{ home: "A", away: "B", code: "2" }] }, { day: "2026-10-19", rung: 5, legs: [{ home: "A", away: "B", code: "1" }] }],
    hits: [{ id: 7, status: "landed", total_odds: 12, leg_count: 3, legs: [], settled_at: "2026-10-19T08:00:00Z" },
      { id: 8, status: "landed", total_odds: 30, leg_count: 3, legs: [], settled_at: "2026-10-18T08:00:00Z" }],
    posts: [{ key: "win|8|tg" }],
    payments: [{ paid_at: "2026-10-19T07:00:00Z", amount_kobo: 200000 }, { paid_at: "2026-10-17T07:00:00Z", amount_kobo: 500000 }],
    buffer: { twitter: 9, instagram: 10, facebook: 4 } });
  assert.deepStrictEqual(out.tips.today, { n: 3, hit: 2 }, "the sweep's rows are not our picks");
  assert.deepStrictEqual(out.ladder.map((r) => r.rung + " " + r.state), ["5 landed", "10 lost"]);
  assert.deepStrictEqual(out.wins, { today: 1, waiting: [{ id: 7, odds: 12 }] });
  assert.deepStrictEqual(out.payments, { n: 1, naira: 2000 });
  const html = require("../public/account-ui.js").todayHtml(out);
  assert.match(html, /1 waiting: ×12/); assert.match(html, /x5 landed · x10 lost/); assert.ok(html.includes("X 9/10 · Instagram 10/10 · Facebook 4/10"));
});
