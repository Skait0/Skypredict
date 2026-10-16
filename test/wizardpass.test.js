"use strict";
/* /wizard-pass (owner, 16 Oct 2026): the public page for the pass. */
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/pages.js");
const { PASSES, FOUNDER } = require("../api/pay.js");

test("the page charges what checkout charges, never says free, and leads into the app", () => {
  const h = P.renderWizardPass();
  const naira = (k) => "₦" + Math.round(k / 100).toLocaleString("en-GB");
  for (const k of ["day", "week", "month"]) assert.ok(h.includes(naira(PASSES[k].kobo)), k + " price");
  assert.ok(h.includes(naira(FOUNDER.kobo)), "the founders' price");
  const words = h.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "");
  assert.doesNotMatch(words, /\bfree\b/i, "no \"free\" in marketing (owner, 13 Oct 2026)");
  assert.match(h, /<a class="go" href="\/\?pass=1">Get Wizard Pass<\/a>/);
  assert.match(h, /<link rel="canonical" href="https:\/\/[^"]+\/wizard-pass">/);
});
