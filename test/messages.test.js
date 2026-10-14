"use strict";
/* The message board (owner, 14 Oct 2026): clean() is the only HTML a message may
   carry, the admin sends to everyone or to chosen readers, a reader reads and
   replies in their inbox, and the Readers tab sees every account. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const M = require("../public/messages.js");
const { fakeDb, fakeRes, postReq, getReq } = require("./helpers/fakes.js");
const S = require("../lib/auth/session.js");

process.env.AUTH_ENABLED = "1";
process.env.AUTH_PEPPER = "p".repeat(64);
const account = require("../api/account.js");

test("clean() keeps the editor's formatting and drops everything that could run", () => {
  const evil = [
    ["<script>alert(1)</script>hi", "hi"],
    ["<img src=x onerror=alert(1)>", ""],
    ["<img src=\"/emo/1f525.webp\" onerror=\"alert(1)\">", "<img class=\"m-emo\" src=\"/emo/1f525.webp\" alt=\"\" width=\"28\" height=\"28\">"],
    ["<img src=\"https://evil.com/a.gif\">", ""],
    ["<img src=\"data:image/svg+xml,<svg onload=alert(1)>\">", ""],
    ["<a href=\"javascript:alert(1)\">x</a>", "<a>x</a>"],
    ["<a href=\"&#106;avascript:alert(1)\">x</a>", "<a>x</a>"],
    ["<a href=\"//evil.com\">x</a>", "<a>x</a>"],
    ["<p style=\"background:url(x)\" onclick=\"x()\">a</p>", "<p>a</p>"],
    ["<svg><script>alert(1)</script></svg>ok", "ok"],
    ["<iframe src=\"https://evil.com\"></iframe>ok", "ok"],
    ["<b>a</b><style>body{display:none}</style>", "<b>a</b>"],
    ["a < b & c > d", "a &lt; b &amp; c &gt; d"],
    ["<<script>script>alert(1)<</script>/script>", "&lt;/script&gt;"],
    ["<span class=\"m-gold evil\" id=\"x\">g</span>", "<span class=\"m-gold\">g</span>"],
    ["<div>line</div>", "<p>line</p>"],
  ];
  for (const [i, o] of evil) assert.strictEqual(M.clean(i), o, i);
  const good = "<h3 class=\"m-big m-gold\">Hi</h3><p>Go <a href=\"https://x.com/a?b=1&amp;c=2\" target=\"_blank\" rel=\"noopener nofollow\">here</a> or <a href=\"/penalty\">play</a></p>" +
    "<ul><li><b>1</b> <i>2</i> <u>3</u> <s>4</s></li></ul><blockquote>q</blockquote>" +
    "<img class=\"m-gif\" src=\"https://media2.giphy.com/media/v1.Y2lk/abc123/100.webp\" alt=\"goal\" loading=\"lazy\">";
  assert.strictEqual(M.clean(good), good, "everything the editor makes survives as it is");
  for (const h of [M.clean(evil.map((x) => x[0]).join(""))]) assert.doesNotMatch(h, /on\w+=|javascript:|<script|<iframe|<svg|style=/i);
  assert.ok(M.isEmpty(M.clean("<p> </p><br>")) && !M.isEmpty("<img class=\"m-emo\" src=\"/emo/1f525.webp\">"));
});

test("the welcome is wizardy, survives clean(), and follows the voice rules", () => {
  assert.strictEqual(M.clean(M.WELCOME), M.WELCOME);
  assert.match(M.textOf(M.WELCOME), /Welcome[\s\S]*Build me a slip[\s\S]*SportyBet, Bet9ja, BetKing, betPawa, 1xBet or Betway[\s\S]*Reply right here[\s\S]*18\+/);
  assert.doesNotMatch(M.WELCOME, /—|load am/i);
});

test("every animated emoji in the picker is in public/emo", () => {
  for (const [cp] of M.EMO) assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "emo", cp + ".webp")), cp);
});

/* ------------------------------------------------------------- the API */
async function world() {
  const clock = () => Date.UTC(2026, 9, 14, 10);
  const db = fakeDb(clock);
  db.grantFor = async () => null;
  let seq = 0;
  const rows = [], reads = {};
  const msgs = {
    inboxOf: async (uid) => rows.filter((m) => !m.deleted_at && (m.user_id === uid || m.user_id == null)).slice().reverse(),
    readsOf: async (uid) => reads[uid] || { read_at: null, banner_at: null },
    markRead: async (uid, f, iso) => { reads[uid] = Object.assign({ read_at: null, banner_at: null }, reads[uid], { [f]: iso }); return true; },
    add: async (list) => list.map((m) => { const r = Object.assign({ id: ++seq }, m); rows.push(r); return r; }),
    unsend: async (id, iso) => { const r = rows.find((m) => String(m.id) === String(id) && m.from_admin && !m.deleted_at); if (!r) return false; r.deleted_at = iso; return true; },
    all: async () => rows.filter((m) => !m.deleted_at).slice().reverse(),
    threadOf: async (uid) => rows.filter((m) => m.user_id === uid && !m.deleted_at).slice().reverse(),
    repliesSince: async (iso) => rows.filter((m) => !m.from_admin && !m.deleted_at && (!iso || m.created_at > iso)).length,
    readers: async () => [{ id: "x", email: "a@b.com" }],
    pushCount: async () => 1,
    gifs: async () => null,
  };
  const log = [];
  const audit = { log: async (row) => { log.push(row); return true; }, list: async () => ({ ok: true, rows: [] }) };
  const h = account.make({ db, now: clock, env: { SW_ADMIN_EMAILS: "boss@x.com" }, msgs, audit,
    admin: { stats: async () => ({}), slipsOf: async () => [] } });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const user = async (email) => {
    const u = await db.createUser({ email });
    return { id: u.id, cookie: S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token };
  };
  return { call, rows, log, boss: await user("boss@x.com"), ada: await user("ada@x.com"), ben: await user("ben@x.com") };
}
const get = (who, action, query) => Object.assign(getReq("account", {}, { cookie: who.cookie }), { query: Object.assign({ action }, query || {}) });
const post = (who, action, body) => Object.assign(postReq("account", body, { cookie: who.cookie }), { query: { action } });

test("only the admin sends, unsends, lists readers or opens a customer view", async () => {
  const w = await world();
  for (const a of ["readers", "reader", "threads", "gifs"]) assert.strictEqual((await w.call(get(w.ada, a, { id: w.ben.id }))).code, 403, a);
  for (const a of ["send", "unsend"]) assert.strictEqual((await w.call(post(w.ada, a, { to: "all", html: "<b>hi</b>", id: 1 }))).code, 403, a);
  assert.strictEqual(w.rows.length, 0, "a refused send wrote nothing");
});

test("a broadcast reaches every inbox, a direct message only its reader, and the button's answer is honest", async () => {
  const w = await world();
  const b = await w.call(post(w.boss, "send", { to: "all", html: "<b>Big night</b><script>x()</script>" }));
  assert.strictEqual(b.code, 200); assert.strictEqual(b.json().sent, 1);
  assert.strictEqual(w.rows[0].body, "<b>Big night</b>", "stored cleaned, whatever the page sent");
  assert.strictEqual(w.rows[0].user_id, null);
  const d = await w.call(post(w.boss, "send", { to: [w.ada.id, w.ada.id, "not-an-id"], html: "Just you" }));
  assert.strictEqual(d.json().sent, 1, "one row per real, distinct reader");
  assert.strictEqual((await w.call(post(w.boss, "send", { to: [], html: "x" }))).code, 400);
  assert.strictEqual((await w.call(post(w.boss, "send", { to: "all", html: "<p> </p>" }))).json().error, "empty");
  const ada = (await w.call(get(w.ada, "inbox"))).json(), ben = (await w.call(get(w.ben, "inbox"))).json();
  assert.deepStrictEqual(ada.messages.map((m) => m.body.slice(0, 9)), ["Just you", "<b>Big ni", M.WELCOME.slice(0, 9)]);
  assert.deepStrictEqual(ben.messages.map((m) => m.body.slice(0, 9)), ["<b>Big ni", M.WELCOME.slice(0, 9)]);
  assert.strictEqual(ada.unread, 3, "the welcome counts until the inbox is opened");
  assert.strictEqual(ada.messages[1].bcast, true);
  assert.ok(w.log.some((l) => l.action === "send" && l.target === "everyone"), "every send is in the audit log");
  /* Unsend takes it out of every inbox. */
  assert.strictEqual((await w.call(post(w.boss, "unsend", { id: w.rows[0].id }))).code, 200);
  assert.strictEqual((await w.call(get(w.ben, "inbox"))).json().messages.length, 1);
});

test("a reader replies in their inbox, the admin's badge counts it, and reading clears both sides", async () => {
  const w = await world();
  assert.strictEqual((await w.call(post(w.ada, "msgread", { what: "inbox" }))).code, 200);
  assert.strictEqual((await w.call(get(w.ada, "inbox"))).json().unread, 0);
  const r = await w.call(post(w.ada, "reply", { text: "  <b>thanks</b> wizard \r\n" }));
  assert.strictEqual(r.code, 200);
  assert.strictEqual(w.rows[0].body, "<b>thanks</b> wizard", "stored as plain text, escaped where it is drawn");
  assert.strictEqual(w.rows[0].from_admin, false); assert.strictEqual(w.rows[0].user_id, w.ada.id);
  assert.strictEqual((await w.call(get(w.ben, "inbox"))).json().messages.length, 1, "a reply is not anyone else's business");
  assert.strictEqual((await w.call(get(w.boss, "inbox"))).json().adminUnread, 1);
  await w.call(post(w.boss, "msgread", { what: "inbox" }));
  assert.strictEqual((await w.call(get(w.boss, "inbox"))).json().adminUnread, 0);
  assert.strictEqual((await w.call(post(w.ada, "reply", { text: "x".repeat(1001) }))).json().error, "too_long");
  for (let i = 0; i < 19; i++) await w.call(post(w.ada, "reply", { text: "hi" }));
  assert.strictEqual((await w.call(post(w.ada, "reply", { text: "one more" }))).code, 429, "twenty an hour");
});

test("the customer view carries the profile, the stats and the thread", async () => {
  const w = await world();
  await w.call(post(w.boss, "send", { to: [w.ada.id], html: "hello" }));
  const r = await w.call(get(w.boss, "reader", { id: w.ada.id }));
  assert.strictEqual(r.code, 200);
  const j = r.json();
  assert.strictEqual(j.email, "ada@x.com"); assert.strictEqual(j.push, 1); assert.strictEqual(j.thread.length, 1);
  assert.ok("slips" in j && "record" in j && "devices" in j && "mail" in j);
  assert.strictEqual((await w.call(get(w.boss, "reader", { id: "nope" }))).code, 400);
  assert.ok(w.log.some((l) => l.action === "lookup" && l.target === "ada@x.com"), "opening a reader is in the audit log");
});
