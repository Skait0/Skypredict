"use strict";
/* /api/results feeds My slips fresh final scores (24 Sep: won tickets stayed "running"). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

test("the route maps banked results and clamps the window", async () => {
  const SB = require("../lib/supabase.js");
  const real = SB.recentResults; let asked = null;
  SB.recentResults = async (since) => { asked = since; return { ok: true, rows: [
    { match_date: "2026-09-24", home: "Andorra", away: "Malta", hg: 1, ag: 2 },
    { match_date: "2026-09-24", home: "X", away: "Y", hg: null, ag: null } ] }; };
  try {
    const h = require("../api/results.js");
    let body = null;
    const res = { setHeader() {}, getHeader() {}, status() { return this; }, json(b) { body = b; return this; } };
    await h({ query: { since: "1999-01-01" } }, res);
    assert.ok(asked > "2026-01-01", "a very old since is clamped to two weeks");
    assert.deepStrictEqual(body.results, [{ date: "2026-09-24", home: "Andorra", away: "Malta", hg: 1, ag: 2 }]);
  } finally { SB.recentResults = real; }
});

test("My slips reads it while a slip is open, and never overwrites a score it has", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const i = src.indexOf("function pullServerResults(){");
  assert.ok(i > 0);
  const fn = src.slice(i, i + 1400);
  assert.match(fn, /if\(!open\.length\) return;/);
  assert.match(fn, /if\(have\[k\]\) return;/);
  assert.match(src, /pullServerResults\(\); setInterval\(pullServerResults, 5\*60\*1000\)/);
});

test("a shared win gets a short /s/ link, and the long one only as a fallback", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const i = src.indexOf("function shareWin(sp,btn){");
  const fn = src.slice(i, i + 900);
  assert.match(fn, /shortWinUrl\(sp\)/, "registers a short link for the saved slip");
  assert.match(fn, /var url=got\[1\]\|\|snapSlipUrl\(sp\)/, "the long link only when that fails");
  const w = src.slice(src.indexOf("function shortWinUrl(sp){"), i);
  assert.match(w, /"\/api\/share"/);
  assert.match(w, /location\.origin\+"\/s\/"/);
  assert.match(w, /setTimeout\(function\(\)\{ done\(null\); \},4000\)/, "never hangs the share button");
});
