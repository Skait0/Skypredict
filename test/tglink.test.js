"use strict";
/* Connect Telegram (owner, 16 Oct 2026): the account panel's link ties the bot
   to an account, so a Wizard Pass works in the bot (lib/tglink.js, api/tg.js). */
const test = require("node:test");
const assert = require("node:assert");
const L = require("../lib/tglink.js");

const ID = "3f2b8c1e-9d4a-4b7e-a1c2-5e6f7a8b9c0d", SECRET = "s".repeat(64), NOW = Date.UTC(2026, 9, 16, 12);

test("a token reads back to the account it was made for, and fits Telegram's start parameter", () => {
  const t = L.makeToken(ID, NOW, SECRET);
  assert.match("link_" + t, /^[A-Za-z0-9_-]{1,64}$/);
  assert.strictEqual(L.readToken(t, NOW + 60e3, SECRET), ID);
});

test("a forged, re-signed or expired token reads as nothing", () => {
  const t = L.makeToken(ID, NOW, SECRET);
  const other = "0".repeat(32) + t.slice(32);                 /* someone else's id, same signature */
  assert.strictEqual(L.readToken(other, NOW, SECRET), null);
  assert.strictEqual(L.readToken(t, NOW, "x".repeat(64)), null, "signed with another secret");
  assert.strictEqual(L.readToken(t, NOW + (L.TTL_S + 1) * 1000, SECRET), null, "15 minutes on");
  assert.strictEqual(L.readToken("nonsense", NOW, SECRET), null);
});

/* The bot, with Telegram, Supabase and the account lookups stubbed. */
function bot(opts) {
  process.env.TELEGRAM_BOT_TOKEN = "123:abc";
  process.env.AUTH_PEPPER = SECRET;
  const sent = [], counted = [], links = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    if (String(url).includes("api.telegram.org")) {
      sent.push({ method: String(url).split("/").pop(), body: JSON.parse(init.body) });
      return { json: async () => ({ ok: true, result: {} }) };
    }
    throw new Error("no network in tests");
  };
  const SB = require("../lib/supabase.js"), A = require("../lib/auth/db.js");
  const saved = { c: SB.countBookings, u: SB.tgUserOf, p: SB.putTgLink, b: A.userById, g: A.grantFor, s: A.subscription };
  SB.countBookings = async (subject, day, cap) => { counted.push({ subject, day, cap }); return { ok: true, n: opts.used }; };
  SB.tgUserOf = async () => opts.linked || null;
  SB.putTgLink = async (tg, uid) => { links.push({ tg, uid }); return { ok: true }; };
  A.userById = async (id) => ({ id, email: "fan@x.com" });
  A.grantFor = async () => null;
  A.subscription = async () => (opts.plus ? { status: "active", current_period_end: new Date(Date.now() + 86400000).toISOString() } : null);
  delete require.cache[require.resolve("../api/tg.js")];
  const tg = require("../api/tg.js");
  const res = { status() { return this; }, json() { return this; } };
  const hdr = { "x-telegram-bot-api-secret-token": tg.secretFor("123:abc") };
  const tap = (data) => tg({ method: "POST", headers: hdr,
    body: { callback_query: { id: "q1", data, from: { id: 42 }, message: { message_id: 9, chat: { id: 42, type: "private" } } } } }, res);
  const text = (t) => tg({ method: "POST", headers: hdr,
    body: { message: { message_id: 5, text: t, from: { id: 42 }, chat: { id: 42, type: "private" } } } }, res);
  const done = () => { global.fetch = realFetch; Object.assign(SB, { countBookings: saved.c, tgUserOf: saved.u, putTgLink: saved.p });
    Object.assign(A, { userById: saved.b, grantFor: saved.g, subscription: saved.s }); delete process.env.TELEGRAM_BOT_TOKEN; };
  return { sent, counted, links, tap, text, done };
}

test("/start link_<token> ties this Telegram to the account and says so", async () => {
  const b = bot({ used: 0 });
  try {
    await b.text("/start link_" + L.makeToken(ID, Date.now(), SECRET));
    assert.strictEqual(b.links.length, 1);
    assert.strictEqual(b.links[0].uid, ID);
    assert.match(b.links[0].tg, /^tg-[0-9a-f]{24}$/, "the hashed Telegram id, never the raw one");
    assert.match(b.sent.find((s) => s.method === "sendMessage").body.text, /Connected/);
  } finally { b.done(); }
});

test("an expired link connects nothing", async () => {
  const b = bot({ used: 0 });
  try {
    await b.text("/start link_" + L.makeToken(ID, Date.now() - 3600e3, SECRET));
    assert.strictEqual(b.links.length, 0);
    assert.match(b.sent.find((s) => s.method === "sendMessage").body.text, /expired/);
  } finally { b.done(); }
});

test("a linked Wizard Pass books on the account's 20 a day, shared with the site", async () => {
  const b = bot({ used: 20, linked: ID, plus: true });
  try {
    await b.tap("cv|bet9ja|sporty|RQWKNC");
    assert.deepStrictEqual(b.counted[0].subject, "u:" + ID, "the same count the site uses");
    assert.notStrictEqual(b.counted[0].day, "*", "per day, not the trial");
    assert.strictEqual(b.counted[0].cap, 20);
    const msg = b.sent.find((s) => s.method === "sendMessage").body.text;
    assert.match(msg, /your 20 codes for today/);
    assert.ok(!/Wizard Pass on/.test(msg), "no selling the pass to someone who has it");
  } finally { b.done(); }
});

test("a linked free account stays on this Telegram's trial", async () => {
  const b = bot({ used: 2, linked: ID, plus: false });
  try {
    await b.tap("cv|bet9ja|sporty|RQWKNC");
    assert.match(b.counted[0].subject, /^tg-/);
    assert.strictEqual(b.counted[0].day, "*");
    assert.match(b.sent.find((s) => s.method === "sendMessage").body.text, /trial codes/);
  } finally { b.done(); }
});

test("the account panel's link opens the bot with a token for this reader", async () => {
  const { fakeDb, fakeRes, getReq } = require("./helpers/fakes.js");
  const S = require("../lib/auth/session.js");
  process.env.AUTH_ENABLED = "1";
  const account = require("../api/account.js");
  const clock = () => NOW;
  const db = fakeDb(clock);
  const u = await db.createUser({ email: "fan@x.com" });
  const cookie = S.COOKIE + "=" + (await S.startSession(db, u.id, "Chrome/129 Android", clock())).token;
  const h = account.make({ db, now: clock, env: { AUTH_PEPPER: SECRET } });
  const r = fakeRes();
  await h(Object.assign(getReq("account", {}, { cookie }), { query: { action: "tglink" } }), r);
  assert.strictEqual(r.code, 200);
  const m = /^https:\/\/t\.me\/Soccerwizardhqbot\?start=link_(.+)$/.exec(r.json().url);
  assert.ok(m);
  assert.strictEqual(L.readToken(m[1], NOW, SECRET), u.id);
});
