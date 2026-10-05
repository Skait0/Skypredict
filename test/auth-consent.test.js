"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { fakeDb } = require("./helpers/fakes.js");
const K = require("../lib/auth/consent.js");

test("the wording is the exact checkbox text", () => {
  assert.strictEqual(K.WORDING, "Email me the wizard's best picks. Unsubscribe any time.");
});

test("record writes only on a real true, never overwrites a live consent, and re-grants after unsubscribe", async () => {
  let T = Date.UTC(2026, 8, 30, 10); const db = fakeDb(() => T);
  const id = "00000000-0000-4000-8000-000000000001";
  for (const v of [false, "true", 1, null, undefined]) await K.record(db, id, v, "email-code", T);
  assert.strictEqual(db.t.consent[id], undefined, "only boolean true counts");
  await K.record(db, id, true, "email-code", T);
  const first = db.t.consent[id].granted_at;
  T += 60e3; await K.record(db, id, true, "google-onetap", T);
  assert.strictEqual(db.t.consent[id].granted_at, first, "a live consent is left alone");
  assert.strictEqual(db.t.consent[id].source, "email-code");
  await db.revokeConsent(id, new Date(T).toISOString());
  T += 60e3; await K.record(db, id, true, "google-onetap", T);
  assert.strictEqual(db.t.consent[id].revoked_at, null);
  assert.strictEqual(db.t.consent[id].source, "google-onetap");
  assert.strictEqual(db.t.consent[id].wording, K.WORDING);
});

test("unsubscribe tokens are per user, fixed length, and the URL carries both", () => {
  const p = "p".repeat(64), a = "00000000-0000-4000-8000-000000000001", b = "00000000-0000-4000-8000-000000000002";
  assert.strictEqual(K.unsubToken(p, a).length, 22);
  assert.notStrictEqual(K.unsubToken(p, a), K.unsubToken(p, b));
  assert.strictEqual(K.unsubToken(p, a), K.unsubToken(p, a));
  assert.match(K.unsubUrl(p, a), new RegExp("/api/auth/unsub\\?u=" + a + "&t=" + K.unsubToken(p, a) + "$"));
});

test("a failed consent write is reported, never thrown: sign-in must not fail over it", async () => {
  const db = fakeDb(() => Date.UTC(2026, 8, 30, 10));
  db.upsertConsent = async () => false;
  const logged = [], was = console.error, dsn = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;
  console.error = (...a) => logged.push(a.join(" "));
  try { await K.record(db, "00000000-0000-4000-8000-000000000001", true, "email-code", Date.now()); }
  finally { console.error = was; if (dsn !== undefined) process.env.SENTRY_DSN = dsn; }
  assert.ok(logged.some((l) => /consent write failed/.test(l)), "report() saw it");
});
