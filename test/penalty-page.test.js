// test/penalty-page.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { render } = require("../api/p.js");

const base = { id: "K7Q2AB", challenger_name: "Tobi", friend_kicks: [], expires_at: "2026-10-09T10:00:00Z" };
const T = Date.parse("2026-10-08T12:00:00Z");

test("an open challenge previews the challenger on WhatsApp and X", () => {
  const h = render(base, T);
  assert.match(h, /<meta property="og:title" content="Tobi challenges you to a penalty shootout">/);
  assert.match(h, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(h, /og:image" content="https:\/\/www\.soccerwizard\.live\/penalty\/og\.png"/);
  assert.match(h, /location\.replace\("\/penalty\?c=K7Q2AB"\)/);
});

test("a finished challenge previews the score", () => {
  const m = Object.assign({}, base, { friend_name: "Ada", friend_kicks: ["goal", "save", "goal", "save", "goal", "save"].map((o) => ({ outcome: o })) });
  assert.match(render(m, T), /og:title" content="Ada beat Tobi 3-0 on Play Penalty"/);
});

test("an expired unstarted challenge says so", () => {
  assert.match(render(base, Date.parse("2026-10-10T00:00:00Z")), /This challenge ran out/);
});

test("names are escaped in every tag", () => {
  const h = render(Object.assign({}, base, { challenger_name: '"><script>x</script>' }), T);
  assert.doesNotMatch(h, /<script>x<\/script>/);
});

test("a missing challenge renders the not-found page", () => {
  assert.match(render(null, T), /This challenge doesn't exist/);
});
