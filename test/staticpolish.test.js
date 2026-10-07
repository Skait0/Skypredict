"use strict";
/* Task 6 (7 Oct 2026 design fixes): the static shell's match page, calibration
   table, tokens and footer, checked on the rendered HTML. */
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");

const UP = { date: "2026-10-07", kickoff: "2026-10-07T23:30:00Z", league: "Brazil Serie A",
  home: "America MG", away: "Fortaleza", tip: "1X, home or draw", tip_p: 0.63,
  home_p: 0.41, draw_p: 0.29, away_p: 0.30, dc1x: 0.70, dc12: 0.71, dcx2: 0.59, o15: 0.71 };

test("the tip card and its table row print one number, and the row is marked", () => {
  const h = P.renderMatchPage(UP, null, []);
  assert.match(h, /<b>America MG or draw \(1X\)<\/b><span>63% confidence/, "1X explained in words");
  assert.match(h, /<tr class='tp'><th>America MG or draw<small>Our tip<\/small><\/th><td>63%<\/td>/);
  assert.ok(!/<td>70%<\/td>/.test(h), "the raw 70% still disagrees with the card");
  assert.strictEqual((h.match(/class='tp'/g) || []).length, 1, "exactly one tipped row");
  const o15 = P.renderMatchPage(Object.assign({}, UP, { tip: "Over 1.5", tip_p: 0.8 }), null, []);
  assert.match(o15, /<tr class='tp'><th>Over 1.5 goals<small>Our tip<\/small><\/th><td>80%<\/td>/);
});

test("a played page says the tip in words and keeps the bottom button", () => {
  const h = P.renderMatchPage(UP, { hg: 2, ag: 0, tip: "1X, home or draw", hit: true }, []);
  assert.match(h, /We tipped <strong>America MG or draw \(1X\)<\/strong>/);
  assert.match(h, /class="cta" href="\/">See today's predictions/);
});

test("an upcoming page has a next step where the tip is", () => {
  const h = P.renderMatchPage(UP, null, []);
  assert.match(h, /<div class='card tip'>[\s\S]*?<p class='tip-go'><a href='\/'>Build a slip<\/a>/);
  assert.ok(!/class="cta" href="\/">See today/.test(h), "two buttons to the same place");
});

test("same-day games are match rows with a kick-off or a score", () => {
  const h = P.renderMatchPage(UP, null, [UP,
    { date: "2026-10-07", kickoff: "2026-10-07T18:45:00Z", home: "Arsenal", away: "Chelsea" },
    { date: "2026-10-07", home: "Porto", away: "Benfica", hg: 2, ag: 0 }]);
  assert.match(h, /<ul class="mx-rows"><li><a href="[^"]+"><span>Arsenal v Chelsea<\/span><span class="mx-n">18:45 UTC<\/span>/);
  assert.match(h, /<span>Porto v Benfica<\/span><span class="mx-n">2-0<\/span>/);
  assert.match(h, /\.mx-rows\{/, "the row style ships on the match page itself");
});

test("the calibration table says it scrolls, in defined colours", () => {
  const mk = (market, said, act) => ({ market, total: 7184, exp: said * 7184, correct: act * 7184 });
  const h = P.renderHowItWorks({ markets: [mk("Home win", 0.47, 0.5), mk("Draw", 0.26, 0.24)] });
  assert.match(h, /<p class='cal-swipe'>Swipe the table for Landed and Diff\.<\/p>/);
  assert.match(h, /@media\(max-width:500px\)\{\.cal-swipe\{display:block\}\}/);
  assert.match(h, /\.cal \.under\{color:var\(--l\)\}/);
  assert.ok(!/#3ddc84|var\(--red\)/.test(h), "a colour outside the shell's tokens");
});

test("shell tokens match the app, cards are 12px, footer heads are h3", () => {
  const h = P.renderNotFound();
  assert.match(h, /--faint:#87848B/);
  assert.match(h, /--faint:#65605A/, "light faint is the app's AA value");
  assert.match(h, /--accent:#8E5B08/, "light gold is the app's AA value (was #9A6B00, 4.2:1 on a card)");
  assert.match(h, /\.card\{[^}]*border-radius:12px/);
  assert.ok(!/<h4>/.test(h), "h4 straight after an h2");
  assert.match(h, /<h3>What this is<\/h3>/);
});

test("the footer is the essential few, privacy and terms in the legal row", () => {
  const f = P.pageFooter();
  const pills = f.slice(f.indexOf('class="foot-links"'), f.indexOf("</nav>")).match(/<a /g).length;
  assert.ok(pills <= 8, pills + " footer pills");
  const legal = f.slice(f.indexOf('class="foot-legal"'));
  assert.match(legal, /href="\/privacy"/);
  assert.match(legal, /href="\/terms"/);
});

test("one uppercase label style on a page: the footer heads", () => {
  for (const h of [P.renderMatchPage(UP, null, []), P.renderCodesHub([], () => null), P.renderNotFound()]) {
    const css = (h.match(/<style>[\s\S]*?<\/style>/g) || []).join("");
    const rules = css.split("}").filter((r) => /text-transform:uppercase/.test(r)).map((r) => r.split("{")[0].trim());
    assert.deepStrictEqual(rules, [".foot-cols h3"], "uppercase on: " + rules.join(", "));
  }
});
