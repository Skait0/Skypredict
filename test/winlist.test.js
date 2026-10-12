"use strict";

/**
 * The list banner: the win banner with the slip's picks under it (owner, 12 Oct
 * 2026). Picks come from the site_slips row, never the URL, folded to ASCII,
 * cut to fit, and at most eight rows.
 */

const test = require("node:test");
const assert = require("node:assert");
const CARD = require("../lib/slipcard.js");
const SB = require("../lib/supabase.js");
const handler = require("../api/slipcard.js");

const SEVEN = ["Malmo FF to win", "Atalanta to win", "Aarhus to win", "Over 1.5 goals (KFUM Oslo v Valerenga)",
  "Over 1.5 goals (Coventry v Newcastle)", "AEK Larnaca to win", "Elfsborg to win"];

test("buildWinList returns a PNG of the list banner's size", () => {
  const png = CARD.buildWinList("sorcerer", 7, 11.55, SEVEN);
  assert.strictEqual(png.slice(1, 4).toString(), "PNG");
  assert.strictEqual(png.readUInt32BE(16), 1568);
  assert.strictEqual(png.readUInt32BE(20), 1360);
  assert.strictEqual(CARD.buildWinList("nobody", 7, 11.55, SEVEN), null, "unbaked rank");
  assert.strictEqual(CARD.buildWinList("sorcerer", 7, 0.5, SEVEN), null, "odds that cannot be drawn");
});

test("a pick too long for its row is cut with an ellipsis", () => {
  const long = "Over 2.5 goals (Wolverhampton Wanderers v Brighton & Hove Albion) in the first half, both teams to score";
  const [row] = CARD.listRows([long]);
  assert.ok(row.text.endsWith("…") && row.text.length < long.length, row.text);
  assert.ok(long.startsWith(row.text.slice(0, -1)));
  assert.deepStrictEqual(CARD.listRows(["Aarhus to win"]), [{ text: "Aarhus to win", muted: false }], "a short pick is left alone");
});

test("eight picks fill eight rows; more show seven and 'and N more', muted", () => {
  const eight = SEVEN.concat(["Porto or draw"]);
  assert.deepStrictEqual(CARD.listRows(eight).map((r) => r.text), eight);
  const rows = CARD.listRows(eight.concat(["Lazio to win", "Ajax to win", "Celtic to win"]));
  assert.strictEqual(rows.length, 8);
  assert.deepStrictEqual(rows.slice(0, 7).map((r) => r.text), SEVEN);
  assert.deepStrictEqual(rows[7], { text: "and 4 more", muted: true });
});

test("picks are folded to ASCII before they are drawn", () => {
  assert.strictEqual(CARD.asciiPick("Borussia Mönchengladbach to win"), "Borussia Monchengladbach to win");
  assert.strictEqual(CARD.asciiPick("Bodø/Glimt “double chance” – home"), 'Bodo/Glimt "double chance" - home');
  assert.strictEqual(CARD.asciiPick("Gençlerbirliği 🔥 to win"), "Genclerbirligi to win");
  assert.ok(CARD.buildWinList("sorcerer", 1, 11.55, ["Borussia Mönchengladbach to win"]));
});

/* A response stand-in: enough of Node's ServerResponse for the handler. */
function fakeRes() {
  const r = { headers: {}, statusCode: 0, body: null };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.getHeader = (k) => r.headers[k.toLowerCase()];
  r.end = (b) => { r.body = b; };
  return r;
}

test("?w= draws only from the row; text in the query string is ignored", async () => {
  const real = SB.siteSlipById;
  const asked = [];
  const row = { id: 77, status: "landed", total_odds: 11.55, leg_count: 7, legs: SEVEN.map((name) => ({ name })) };
  SB.siteSlipById = async (id) => { asked.push(id); return id === "77" ? row : null; };
  try {
    const res = fakeRes();
    await handler({ url: "/api/slipcard?w=77&r=grandwizard&g=99&o=9999&picks=FAKE%20WIN&legs=FAKE" }, res);
    assert.deepStrictEqual(asked, ["77"]);
    assert.ok(res.body.equals(CARD.buildWinList("sorcerer", 7, 11.55, SEVEN)), "the banner is the row's, not the query's");
    assert.match(res.headers["cache-control"] || JSON.stringify(res.headers), /immutable/);

    /* not landed, or no such row: the fallback, briefly cached */
    row.status = "check";
    const res2 = fakeRes();
    await handler({ url: "/api/slipcard?w=77" }, res2);
    assert.ok(!res2.body.equals(res.body));
    assert.doesNotMatch(JSON.stringify(res2.headers), /immutable/);
  } finally { SB.siteSlipById = real; }
});
