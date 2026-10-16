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
  assert.match(M.textOf(M.WELCOME), /Welcome[\s\S]*Build me a slip[\s\S]*SportyBet, Bet9ja, BetKing, betPawa, 1xBet or Betway[\s\S]*Telegram or X[\s\S]*18\+/);
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
    editBody: async (id, body) => { const r = rows.find((m) => String(m.id) === String(id) && m.from_admin && !m.deleted_at); if (!r) return false; r.body = body; return true; },
    all: async () => rows.filter((m) => !m.deleted_at).slice().reverse(),
    threadOf: async (uid) => rows.filter((m) => m.user_id === uid && !m.deleted_at).slice().reverse(),
    repliesSince: async (iso) => rows.filter((m) => !m.from_admin && !m.deleted_at && (!iso || m.created_at > iso)).length,
    readers: async () => [{ id: "x", email: "a@b.com" }],
    pushCount: async () => 1,
    gifs: async () => null,
    hide: async (uid, id) => { const r = reads[uid] || { read_at: null, banner_at: null }; r.hidden = (r.hidden || []).concat([Number(id)]); reads[uid] = r; return true; },
  };
  const log = [];
  const audit = { log: async (row) => { log.push(row); return true; }, list: async () => ({ ok: true, rows: [] }) };
  const pings = [], pingCtl = { fail: false };
  const ping = async (uids, note) => { if (pingCtl.fail) throw new Error("push down"); pings.push([uids, note]); return 2; };
  const h = account.make({ db, now: clock, env: { SW_ADMIN_EMAILS: "boss@x.com" }, msgs, audit, ping,
    admin: { stats: async () => ({}), slipsOf: async () => [] } });
  const call = async (req) => { const r = fakeRes(); await h(req, r); return r; };
  const user = async (email) => {
    const u = await db.createUser({ email });
    return { id: u.id, cookie: S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token };
  };
  return { call, rows, log, pings, pingCtl, boss: await user("boss@x.com"), ada: await user("ada@x.com"), ben: await user("ben@x.com") };
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

/* Owner, 14 Oct 2026: "do the phone push for new messages". */
test("a new message pings phones, and a push that fails never fails the send", async () => {
  const w = await world();
  const b = await w.call(post(w.boss, "send", { to: "all", html: "<b>Big night</b> " + "x".repeat(200) }));
  assert.strictEqual(b.json().pinged, 2);
  assert.strictEqual(w.pings[0][0], null, "a broadcast pings every signed-in phone");
  assert.strictEqual(w.pings[0][1].url, "/?msgs=1", "the tap opens the inbox");
  assert.ok(w.pings[0][1].body.startsWith("Big night x") && w.pings[0][1].body.length <= 120);
  assert.doesNotMatch(w.pings[0][1].title + w.pings[0][1].body, /—|load am/i);
  await w.call(post(w.boss, "send", { to: [w.ada.id], html: "Just you" }));
  assert.deepStrictEqual(w.pings[1][0], [w.ada.id], "a direct message pings only its reader");
  w.pingCtl.fail = true;
  const f = await w.call(post(w.boss, "send", { to: [w.ada.id], html: "Still sent" }));
  assert.strictEqual(f.code, 200); assert.strictEqual(f.json().pinged, 0);
  assert.strictEqual(w.rows.length, 3, "in the inbox whatever the push did");
});

/* Owner, 14 Oct 2026: "remove the reply for readers except i say otherwise". */
/* Owner, 14 Oct 2026: "lets give the users the ability to reply. i want feedback
   from users for now. make sure the input from the users are secure and cant
   access the backend. safe from hackers." */
test("users reply in their own thread, as plain text, and opening the inbox reads it", async () => {
  const w = await world();
  assert.strictEqual((await w.call(post(w.ada, "msgread", { what: "inbox" }))).code, 200);
  assert.strictEqual((await w.call(get(w.ada, "inbox"))).json().unread, 0);
  const r = await w.call(post(w.ada, "reply", { text: "  thanks wizard  ", user_id: w.ben.id, from_admin: true }));
  assert.strictEqual(r.code, 200);
  assert.strictEqual(w.rows[0].body, "thanks wizard");
  assert.strictEqual(w.rows[0].user_id, w.ada.id, "the thread is the session's, never the request's");
  assert.strictEqual(w.rows[0].from_admin, false, "a user can never post as the admin");
  assert.strictEqual((await w.call(get(w.ben, "inbox"))).json().messages.filter((m) => m.mine).length, 0, "Ben sees none of it");
  assert.match(fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8"), /\/api\/account\/reply/, "the inbox has its reply box");
  assert.match(M.WELCOME, /Reply right here/);
});

test("a hostile reply is stored as text and drawn as text everywhere", async () => {
  const w = await world();
  const evil = "<img src=x onerror=alert(1)><script>steal()</script><a href=javascript:x>hi</a> '); DROP TABLE messages;--";
  assert.strictEqual((await w.call(post(w.ada, "reply", { text: evil }))).code, 200);
  assert.strictEqual(w.rows[0].body, evil, "stored exactly as typed: it is only ever text, through PostgREST's JSON");
  /* Every view that draws a user's reply escapes it. */
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.ok(src.includes('(m.mine?esc(m.body).replace(/\\n/g,"<br>"):clean(m.body))'), "the bubble escapes a user's own words");
  for (const call of ["bubble({id:m.id,at:m.created_at,mine:!m.from_admin,body:m.body},Infinity,", "bubble({id:m.id,at:m.created_at,mine:!m.from_admin,body:m.body},Infinity); })"])
    assert.ok(src.includes(call), "admin views draw replies as the user's own (escaped): " + call.slice(0, 40));
  assert.ok(src.includes("esc(api.textOf(last.from_admin?last.body:esc(last.body)).slice(0,70))"), "the conversation preview escapes");
  assert.ok(src.includes("if(!m.user_id){ if(m.from_admin) (m.adminHidden?gone:bc).push(m); return; }"), "only the admin's broadcasts are drawn as HTML");
  /* And what the escape does to it. */
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  assert.doesNotMatch(esc(evil), /<img|<script|<a /);
});

test("replies are capped, rate limited, signed-in only, and cleaned of disguise characters", async () => {
  const w = await world();
  assert.strictEqual((await w.call(post(w.ada, "reply", { text: "x".repeat(1001) }))).json().error, "too_long");
  assert.strictEqual((await w.call(post(w.ada, "reply", { text: " \n\u200b " }))).json().error, "empty");
  const anon = Object.assign(postReq("account", { text: "hi" }, {}), { query: { action: "reply" } });
  assert.strictEqual((await w.call(anon)).code, 401, "no session, no reply");
  let last = null;
  for (let i = 0; i < 21; i++) last = await w.call(post(w.ben, "reply", { text: "spam " + i }));
  assert.strictEqual(last.code, 429, "the 21st reply in an hour is refused");
  const c = account.cleanReply("ok\u202Egnp.exe\u0000\u200B\n\n\n\nend\r\n");
  assert.strictEqual(c, "okgnp.exe\n\nend", "bidi overrides, zero-width and control characters go; blank lines are capped");
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

/* Owner, 14 Oct 2026: "there is no way to delete messages from the inbox". */
test("a reader deletes a message from their own inbox only, the welcome too", async () => {
  const w = await world();
  await w.call(post(w.boss, "send", { to: "all", html: "<b>Big night</b>" }));
  const id = w.rows[0].id;
  assert.strictEqual((await w.call(post(w.ada, "msghide", { id }))).code, 200);
  assert.strictEqual((await w.call(post(w.ada, "msghide", { id: 0 }))).code, 200);
  assert.strictEqual((await w.call(post(w.ada, "msghide", { id: "1;drop" }))).code, 400);
  assert.deepStrictEqual((await w.call(get(w.ada, "inbox"))).json().messages, [], "gone from Ada's inbox");
  assert.strictEqual((await w.call(get(w.ben, "inbox"))).json().messages.length, 2, "Ben still has the broadcast and the welcome");
  assert.strictEqual(w.rows.length, 1, "nothing deleted for real");
});

test("the inbox folds and deletes, and the banner keeps GIFs for the inbox", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.ok(src.includes("/api/account/msghide") && src.includes("Tap again to delete"), "delete asks twice, then hides");
  assert.ok(src.includes("swm-shut") && src.includes('(open?"Less":"More")'), "messages fold");
  assert.ok(src.includes("open to see it") && src.includes("swm-gifchip"), "a GIF in the banner is a chip");
  assert.ok(src.includes(".swm-ban .m-body .m-gif{display:none}"));
  assert.ok(src.includes("swAdminBadgeRefresh(); banner(); return; }"), "the admin sees the banner too");
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  /* Since 14 Oct 2026 the closed notice is a fingerprint that rides the account. */
  assert.ok(html.includes("if(seen()) return;") && html.includes('localStorage.setItem("sw.noticeX",h)') && html.includes('noticex:"sw.noticeX"'),
    "a closed notice stays closed, on every device, until a new one is posted");
  assert.ok(fs.readFileSync(path.join(__dirname, "..", "sql", "messages.sql"), "utf8").includes("add column if not exists hidden bigint[]"));
});

/* Owner, 14 Oct 2026: Twitch/Kick-style wavy emotes, done as our own CSS motions. */
test("emote motions and wavy text survive clean(), and nothing else rides along", () => {
  assert.strictEqual(M.clean('<img class="m-emo m-bounce evil" src="/emo/1f525.webp" alt="fire">'),
    '<img class="m-emo m-bounce" src="/emo/1f525.webp" alt="fire" width="28" height="28">');
  assert.strictEqual(M.clean('<img class="m-emo m-spin m-wave" src="/emo/1f525.webp">'),
    '<img class="m-emo m-spin" src="/emo/1f525.webp" alt="" width="28" height="28">', "one motion per emoji");
  assert.strictEqual(M.clean('<span class="m-wavy"><span>G</span><span>o</span></span>'), '<span class="m-wavy"><span>G</span><span>o</span></span>');
  assert.deepStrictEqual(M.MOT.map((m) => m[1]), ["None", "Wave", "Bounce", "Wiggle", "Jello", "Spin", "Pulse"]);
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  for (const [k] of M.MOT.slice(1)) assert.ok(src.includes("." + k + "{animation:"), k + " has its animation");
  assert.ok(src.includes(".m-wavy>span{animation:none}") || /prefers-reduced-motion:reduce\)\{[^}]*\.m-wavy>span\{animation:none\}/.test(src),
    "reduced motion stops them");
});

/* Owner, 14 Oct 2026: the Wizard's own emotes, in their own picker tab. */
test("every Wizard emote is in public/emo, survives clean() bigger, and nothing else under /emo/wiz- does", () => {
  for (const [k] of M.WIZ) assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "emo", "wiz-" + k + ".webp")), k);
  assert.ok(M.WIZ.length >= 50);
  assert.strictEqual(M.clean('<img class="m-emo m-wiz m-bounce" src="/emo/wiz-rave.webp" alt="glow sticks">'),
    '<img class="m-emo m-wiz m-bounce" src="/emo/wiz-rave.webp" alt="glow sticks" width="44" height="44">');
  for (const bad of ["/emo/wiz-../x.webp", "/emo/wiz-RAVE.webp", "/emo/wiz-.webp", "https://evil.com/emo/wiz-rave.webp"])
    assert.strictEqual(M.clean('<img src="' + bad + '">'), "", bad);
  for (const [, , mot] of M.WIZ) assert.ok(mot === "" || M.MOT.some((m) => m[0] === mot), mot);
});

test("the admin's editor builds (14 Oct 2026: a second var WIZ shadowed the emote list and the tab hung on Loading)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  const vars = [...src.matchAll(/\bvar\s+([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]);
  for (const v of ["WIZ_EMO", "EMO", "MOT", "WIZ"]) assert.strictEqual(vars.filter((x) => x === v).length, 1, v + " is declared once");
  assert.ok(src.includes("WIZ_EMO.map(function(e){"), "the picker draws from the emote list");
});

/* Owner, 14 Oct 2026: on a phone the picker sat behind the keyboard. It now takes
   the keyboard's place, like WhatsApp, Telegram and Discord. */
test("on a phone the emoji and GIF pickers open as a sheet in the keyboard's place", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.ok(src.includes('root.matchMedia("(pointer:coarse)")'), "phones and narrow screens get the sheet");
  assert.ok(src.includes("if(sheetOpen()){ keep(); area.blur(); }"), "opening it closes the keyboard and keeps the cursor");
  assert.ok(src.includes("r.deleteContents(); r.insertNode(t.content);"), "a tap inserts at the kept cursor without focusing the text");
  assert.ok(src.includes(".swm-pop.swm-sheet{position:fixed;left:0;right:0;bottom:0;"), "drawn at the bottom");
  assert.ok(src.includes("swm-sh-done") && src.includes('area.addEventListener("pointerdown"'), "Done or a tap on the text closes it");
});

test("the welcome never takes the banner: it waits in the inbox (owner, 14 Oct 2026)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.ok(src.includes("return !x.mine&&x.id!==0&&Date.parse(x.at)>since;"), "id 0 is the welcome, kept out of the banner");
});

/* Owner, 14 Oct 2026: "there should be an edit button for sent broadcast. resend. delete." */
test("the admin edits a sent broadcast in place, cleaned, without a new ping; nobody else can", async () => {
  const w = await world();
  await w.call(post(w.boss, "send", { to: "all", html: "<b>Old</b>" }));
  const id = w.rows[0].id, pings = w.pings.length;
  assert.strictEqual((await w.call(post(w.ada, "edit", { id, html: "hacked" }))).code, 403, "users cannot edit");
  const r = await w.call(post(w.boss, "edit", { id, html: "<b>New</b><script>x()</script>" }));
  assert.strictEqual(r.code, 200);
  assert.strictEqual(w.rows[0].body, "<b>New</b>", "cleaned like a send");
  assert.strictEqual(w.rows.length, 1, "same message, not a new one");
  assert.strictEqual(w.pings.length, pings, "no new ping for an edit");
  assert.strictEqual((await w.call(post(w.boss, "edit", { id, html: "<p> </p>" }))).json().error, "empty");
  assert.strictEqual((await w.call(post(w.boss, "edit", { id: "1;x", html: "a" }))).code, 400);
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.ok(src.includes("data-bc-edit") && src.includes("data-bc-resend") && src.includes(">Delete</button>"), "Edit, Resend and Delete on each broadcast");
  assert.ok(src.includes('go.textContent=editing?"Save changes"'), "Send becomes Save changes while editing");
  assert.ok(src.includes("class='swm-bc-hd' aria-expanded='false'") && src.includes("<div class='m-body' hidden>"), "each broadcast starts folded");
});

/* Owner, 14 Oct 2026: "let delete be for just me ... unsend should remove it from the board for everyone". */
test("Delete takes a broadcast off the admin's list only; Unsend takes it from everyone", async () => {
  const w = await world();
  await w.call(post(w.boss, "send", { to: "all", html: "<b>One</b>" }));
  await w.call(post(w.boss, "send", { to: "all", html: "<b>Two</b>" }));
  const [one, two] = w.rows.map((r) => r.id);
  assert.strictEqual((await w.call(post(w.boss, "msghide", { id: one }))).code, 200);
  const mine = (await w.call(get(w.boss, "threads"))).json().messages;
  /* Off the list, but still reachable to Unsend (owner, 16 Oct 2026): it comes back marked. */
  assert.ok(mine.find((m) => m.id === one).adminHidden, "marked as deleted from the admin's Broadcasts sent");
  assert.ok(!mine.find((m) => m.id === two).adminHidden);
  assert.ok((await w.call(get(w.ada, "inbox"))).json().messages.some((m) => m.id === one), "users keep it");
  assert.strictEqual((await w.call(post(w.boss, "unsend", { id: two }))).code, 200);
  assert.ok(!(await w.call(get(w.ada, "inbox"))).json().messages.some((m) => m.id === two), "Unsend takes it from users");
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.ok(src.includes(">Unsend</button>") && src.includes("data-bc-del="), "both buttons on each broadcast");
  assert.strictEqual((await w.call(post(w.boss, "unsend", { id: one }))).code, 200, "a deleted one can still be unsent");
  assert.ok(!(await w.call(get(w.ada, "inbox"))).json().messages.some((m) => m.id === one), "and then users lose it too");
  assert.match(src, /Deleted from this list, still showing to users/);
});

/* Owner, 14 Oct 2026 (screenshot): a sent broadcast's folded line read
   "&nbsp;Meet your new Wizard look&nbsp;&nbs..." - the editor's spaces were
   shown as code. Previews read them as plain spaces now. */
test("previews show the editor's non-breaking spaces as spaces, not code", () => {
  assert.strictEqual(M.textOf("<p>&nbsp;Meet your new Wizard look&nbsp;&nbsp;</p>"), "Meet your new Wizard look");
  assert.strictEqual(M.textOf("a&#160;b"), "a b");
  assert.strictEqual(M.textOf("&amp;nbsp;"), "&nbsp;", "a typed '&nbsp;' stays as typed");
});

/* Owner, 14 Oct 2026: the Wizard emotes "jump up way too close to the top that
   it hinders selection between the emotes and emoji". Measured at 390px in the
   phone sheet: before, a bouncing emote rose 16px over the tabs and 146 of 976
   tap points on them hit an emote; after, a 6px gap and 0 of 976. */
test("the emote tabs stay above the bouncing Wizard emotes", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.match(src, /\.swm-etabs\{position:relative;z-index:2;background:var\(--card-2\);/);
  assert.match(src, /\.swm-wizs\{[^}]*padding-top:22px;/, "room for the top row's bounce");
});

/* Sentry, 15 Oct 2026: "TypeError: A is not a function" in messages.js, and the
   admin's Conversations stuck on "Loading" (owner's screenshot). load() kept the
   sent broadcasts in a local `var byId={}`, which hoisted over the byId()
   reader lookup for the whole function, so drawing a conversation threw.
   Harness: before, "Loading" + "byId is not a function"; after, the row draws. */
test("the sent-broadcast index never shadows the reader lookup", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  assert.ok(!/var byId\s*=/.test(src), "no local named byId");
  assert.match(src, /var bcBy=\{\}; bc\.forEach\(function\(m\)\{ bcBy\[String\(m\.id\)\]=m; \}\);/);
  assert.match(src, /r=byId\(id\)\|\|\{id:id,email:"Deleted account"\}/);
});

/* Sentry, 15 Oct 2026: "Cannot set properties of null (setting 'onclick')" when the
   admin opened a conversation: the button is data-open-user but the click was wired
   to [data-open-reader], so the lookup returned null and the rest of open() never ran. */
test("every button the admin conversation wires up exists in its markup", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "messages.js"), "utf8");
  const wired = [...src.matchAll(/box\.querySelector\("\[(data-[a-z-]+)\]"\)\.onclick/g)].map((m) => m[1]);
  assert.ok(wired.length >= 2);
  // the attribute must also appear outside a [selector], i.e. in the markup that is drawn
  for (const attr of wired) assert.ok(new RegExp("[^\\[]" + attr + "(?![\\w-])").test(src), attr + " is wired but no button carries it");
});

test("a push's ?msgs=1 opens the inbox once, then leaves the address", () => {
  /* Owner, 16 Oct 2026: "when i refresh my app it goes to my messages" - the flag
     stayed in the address, so every refresh reopened the inbox. */
  const idx = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(idx, /history\.replaceState\(history\.state,"",location\.pathname\+location\.search\.replace\(re,""\)/);
  assert.match(idx, /if\(once\("msgs"\)\)\{/);
  assert.match(idx, /if\(once\("account"\)\)\{/);
});
