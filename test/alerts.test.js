"use strict";
/* Admin Alerts (owner, 16 Oct 2026: "log every alert"): lib/alerts.js. */
const test = require("node:test");
const assert = require("node:assert");
const { buildAlerts } = require("../lib/alerts.js");

test("every kind of alert, newest first, with names and amounts", () => {
  const a = buildAlerts({
    readers: [{ id: "u1", email: "ada@x.com", name: "Ada", created_at: "2026-10-16T08:00:00Z" }],
    messages: [{ user_id: "u1", from_admin: false, body: "<p>Thanks wizard!</p>", created_at: "2026-10-16T12:00:00Z" },
               { user_id: null, from_admin: true, body: "broadcast", created_at: "2026-10-16T12:30:00Z" },
               { user_id: "u1", from_admin: true, body: "our reply", created_at: "2026-10-16T12:40:00Z" }],
    payments: [{ user_id: "u1", pass: "month", amount_kobo: 150000, founder: true, paid_at: "2026-10-16T11:00:00Z" }],
    slips: [{ status: "landed", book: "sporty", code: "AB12CD", total_odds: 12.5, leg_count: 5, settled_at: "2026-10-16T13:00:00Z" },
            { status: "check", book: "sporty", settled_at: "2026-10-16T14:00:00Z" }],
  });
  assert.deepEqual(a.map((x) => x.kind), ["win", "reply", "founder", "signup"], "broadcasts, our replies and unchecked slips are not alerts");
  assert.equal(a[0].title, "A slip landed at x12.50");
  assert.equal(a[1].title, "Ada replied");
  assert.equal(a[1].detail, "Thanks wizard!", "markup stripped");
  assert.equal(a[2].title, "Ada became a Founding Wizard");
  assert.match(a[2].detail, /Month pass · ₦1,500/);
});

test("a source that failed is just left out", () => {
  assert.deepEqual(buildAlerts({ messages: null, readers: null, payments: [], slips: null }), []);
  assert.equal(buildAlerts({ readers: Array.from({ length: 300 }, (_, i) => ({ id: "u" + i, created_at: new Date(Date.UTC(2026, 9, 1) + i * 6e4).toISOString() })) }, 100).length, 100);
});

test("the page shows Alerts after Messages and marks new ones with a dot", () => {
  const ui = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "account-ui.js"), "utf8");
  assert.match(ui, /\["swaTMsg","Messages"\],\["swaTAlerts","Alerts"\]/);
  assert.match(ui, /swa-aldot/);
  assert.match(ui, /localStorage\.setItem\("sw\.alertsSeen"/);
});
