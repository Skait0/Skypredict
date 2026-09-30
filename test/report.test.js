"use strict";
const test = require("node:test");
const assert = require("node:assert");
const R = require("../lib/report.js");
const DSN = "https://abc123@o1.ingest.de.sentry.io/42";

test("emails, codes and tokens never leave for Sentry", () => {
  const s = R.scrub("login ade@gmail.com code 482913 token " + "A".repeat(43) + " hash " + "f".repeat(64));
  assert.doesNotMatch(s, /ade@gmail\.com|482913|A{43}|f{64}/);
});

test("tokens edged with '-' are scrubbed", () => {
  const token1 = "-" + "A".repeat(42);
  const token2 = "A".repeat(42) + "-";
  const s = R.scrub("bad token " + token1 + " and " + token2 + " end");
  assert.ok(!s.includes(token1));
  assert.ok(!s.includes(token2));
});

test("the envelope goes to the project from the DSN, tagged server", () => {
  const e = R.envelope(DSN, new Error("boom for x@y.com"), { route: "email/send" }, Date.UTC(2026, 8, 29));
  assert.strictEqual(e.url, "https://o1.ingest.de.sentry.io/api/42/envelope/");
  assert.match(e.headers["X-Sentry-Auth"], /sentry_key=abc123/);
  const lines = e.body.split("\n");
  const evt = JSON.parse(lines[2]);
  assert.strictEqual(evt.tags.runtime, "server");
  assert.strictEqual(evt.tags.route, "email/send");
  assert.doesNotMatch(e.body, /x@y\.com/);
});

test("runtime tag cannot be overridden by extra", () => {
  const e = R.envelope(DSN, new Error("x"), { runtime: "browser" }, 0);
  const lines = e.body.split("\n");
  const evt = JSON.parse(lines[2]);
  assert.strictEqual(evt.tags.runtime, "server");
});

test("no DSN, nothing sent; a failing send never throws", async () => {
  assert.strictEqual(R.envelope("", new Error("x"), {}, 0), null);
  const saved = global.fetch; global.fetch = async () => { throw new Error("down"); };
  process.env.SENTRY_DSN = DSN;
  try { await R.report(new Error("x")); } finally { global.fetch = saved; delete process.env.SENTRY_DSN; }
});
