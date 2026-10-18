"use strict";
/* /wizard-pass (owner, 16 Oct 2026): the public page for the pass. Prices from
   lib/pricing.js: today's until 1 Nov 2026 with the new ones struck through, then
   the new table, with no N200 plan (owner, 18 Oct 2026). */
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");
const PR = require("../lib/pricing.js");
const { FOUNDER } = require("../api/pay.js");
const naira = (k) => "₦" + Math.round(k / 100).toLocaleString("en-GB");
const BEFORE = Date.parse("2026-10-20T12:00:00+01:00"), AFTER = Date.parse("2026-11-01T00:00:00+01:00");

test("the page charges what checkout charges, never says free, and leads into the app", () => {
  for (const t of [BEFORE, AFTER]) {
    const h = P.renderWizardPass(t), cur = PR.passesAt(t);
    for (const k of Object.keys(cur)) assert.ok(h.includes(naira(cur[k].kobo)), k + " price at " + new Date(t).toISOString());
    assert.ok(h.includes(naira(FOUNDER.kobo)), "the founders' price");
    const words = h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "");
    assert.doesNotMatch(words, /\bfree\b/i, "no \"free\" in marketing (owner, 13 Oct 2026)");
    assert.match(h, /<a class="go" href="\/\?pass=1">Get Wizard Pass<\/a>/);
    assert.match(h, /<link rel="canonical" href="https:\/\/[^"]+\/wizard-pass">/);
  }
});

test("until 1 Nov the new prices are struck through beside today's; from then they are the prices", () => {
  const before = P.renderWizardPass(BEFORE), after = P.renderWizardPass(AFTER);
  for (const k of ["day", "week", "month"]) assert.ok(before.includes("<s>" + naira(PR.NEXT[k].kobo) + "</s>"), k + " struck through");
  assert.match(before, /New prices from 1 Nov/);
  assert.doesNotMatch(after, /<s>|New prices from 1 Nov/);
  assert.doesNotMatch(after, /₦200/, "no N200 plan after the switch");
  assert.match(after, /60 codes a day/);
});
