"use strict";
/* Step 3 of the refusal work (owner, 29 Sep 2026): the builders' own corners
 * and shots legs are checked at SportyBet as soon as a slip is shown, and the
 * answer is written into the price cache the builders read - so a dead line
 * stops being offered before anybody presses Get code. */
const test = require("node:test");
const assert = require("node:assert");
const { fn, decl } = require("./books.js");

function harness(reply) {
  const calls = [];
  const fx = {
    a: { id: "a", eventId: "sr:match:1", sportyOdds: { "CORNERS_OV_9.5": 1.8, "1X": 1.3 } },
    b: { id: "b", eventId: "sr:match:2", sportyOdds: { "SHOTS_OV_24.5": 1.6 } },
    c: { id: "c", eventId: "sr:match:3", sportyOdds: { "CORNERS_OV_8.5": 1.5 } },
  };
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (reply === "fail") throw new Error("down");
    return { json: async () => reply };
  };
  const B = { key: "sporty", odds: "sportyOdds", id: "eventId", book: "/api/book?book=sporty",
    sel: (c) => ({ eventId: fx[c.id].eventId, prediction: c.code }) };
  const api = new Function("fetch", "FX", "setTimeout", "clearTimeout",
    "function bookIdOf(c){ return FX[c.id]&&FX[c.id].eventId; }" +
    "function fixtureById(id){ return FX[id]; }" +
    decl("LINE_CODE") + "\n" + decl("PRECHECK") + "\n" + decl("PRECHECK_TTL") + "\n" + fn("precheckLines") +
    "\nreturn {precheckLines:precheckLines, PRECHECK:PRECHECK};")(fetch, fx, () => 0, () => {});
  const pick = (id, code) => ({ id, code, f: fx[id] });
  return { api, calls, fx, B, pick };
}
const settle = () => new Promise((r) => setImmediate(r));

test("a closed line loses its price and a moved one gains SportyBet's", async () => {
  const h = harness({ verdicts: [
    { eventId: "sr:match:1", prediction: "CORNERS_OV_9.5", reason: "line_moved", now: "CORNERS_OV_10.5", odds: 2.05 },
    { eventId: "sr:match:2", prediction: "SHOTS_OV_24.5", reason: "closed" },
  ] });
  let changed = 0;
  assert.ok(h.api.precheckLines([h.pick("a", "CORNERS_OV_9.5"), h.pick("b", "SHOTS_OV_24.5"), h.pick("a", "1X")],
    h.B, (n) => { changed = n; }));
  await settle(); await settle();
  assert.deepStrictEqual(h.calls[0].body.selections.map((s) => s.prediction), ["CORNERS_OV_9.5", "SHOTS_OV_24.5"],
    "only corners and shots are asked about");
  assert.strictEqual(h.fx.a.sportyOdds["CORNERS_OV_9.5"], undefined, "the dead line is closed");
  assert.strictEqual(h.fx.a.sportyOdds["CORNERS_OV_10.5"], 2.05, "the live line is open at their price");
  assert.strictEqual(h.fx.b.sportyOdds["SHOTS_OV_24.5"], undefined);
  assert.strictEqual(h.fx.a.sportyOdds["1X"], 1.3, "goals legs are left alone");
  assert.strictEqual(changed, 2, "the builder is told to redraw");
});

test("a line still on sale changes nothing and does not redraw", async () => {
  const h = harness({ verdicts: [] });
  let changed = 0;
  h.api.precheckLines([h.pick("c", "CORNERS_OV_8.5")], h.B, (n) => { changed = n; });
  await settle(); await settle();
  assert.strictEqual(h.fx.c.sportyOdds["CORNERS_OV_8.5"], 1.5);
  assert.strictEqual(changed, 0);
});

test("nothing is asked twice inside five minutes, and a failure changes nothing", async () => {
  const h = harness("fail");
  h.api.precheckLines([h.pick("c", "CORNERS_OV_8.5")], h.B, () => assert.fail("no redraw on failure"));
  await settle(); await settle();
  assert.strictEqual(h.fx.c.sportyOdds["CORNERS_OV_8.5"], 1.5, "a failed check leaves the cache as it was");
  assert.strictEqual(h.api.precheckLines([h.pick("c", "CORNERS_OV_8.5")], h.B), false, "already asked");
  assert.strictEqual(h.calls.length, 1);
});

test("only SportyBet, only when there is something to ask", () => {
  const h = harness({ verdicts: [] });
  assert.strictEqual(h.api.precheckLines([h.pick("a", "CORNERS_OV_9.5")], Object.assign({}, h.B, { key: "bet9ja" })), false);
  assert.strictEqual(h.api.precheckLines([h.pick("a", "1X")], h.B), false);
  assert.strictEqual(h.calls.length, 0);
});

test("the builders' own slip is what gets checked, not the ghost preview", () => {
  const src = require("./books.js").src;
  const out = fn("renderBuilderOutput");
  assert.match(out, /if\(!wizGhost&&picks\.length\) schedulePrecheck\(picks\);/);
  assert.match(fn("schedulePrecheck"), /WSP\._sig=null;[\s\S]*renderBuilder\(\);/, "the wizard's cached slip is rebuilt");
  assert.match(fn("cornersOpen"), /o\[c\]/, "the builders gate corners and shots on the price this writes");
  assert.ok(src.indexOf("function precheckLines(") > 0);
});
