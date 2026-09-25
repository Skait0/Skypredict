/* lineCheck: a slip's corners and shots legs are read on SportyBet's live card
   before booking (25 Sep 2026). SportyBet re-lines those as the price moves
   and deletes the old line - 15% of our cached shots lines were gone - and a
   slip carrying a few came back "can't take 2 of these" about half the time.
   A moved line is offered, never swapped quietly; a failure books as before. */

const test = require("node:test");
const assert = require("node:assert");
const BOOKS = require("./books.js");
const { fn } = BOOKS;

function harness(book, answer) {
  const el = { innerHTML: "", _on: {}, classList: new Set(),
    querySelector(sel) { const k = sel.replace(".", ""); const self = this;
      return { addEventListener(_, f) { self._on[k] = f; } }; } };
  el.classList.add = Set.prototype.add.bind(el.classList);
  el.classList.remove = Set.prototype.delete.bind(el.classList);
  const calls = [];
  const fetchStub = (url, o) => { calls.push({ url, body: JSON.parse(o.body) });
    return answer === "fail" ? Promise.reject(new Error("down"))
      : Promise.resolve({ json: () => Promise.resolve(answer) }); };
  const api = new Function("EL", "fetch",
    "function $(){return EL;}\nfunction esc(s){return String(s);}\n" +
    "function fixtureById(){return null;}\n" +
    "function mLabel(f,c){var m=/_(OV)_([\\d.]+)$/.exec(c);return m?'Over '+m[2]+(c.indexOf('SHOTS')===0?' shots':' corners'):c;}\n" +
    "function mProb(f,c){return c==='SHOTS_OV_27.5'?0.61:null;}\n" +
    BOOKS.prelude(book) + "\nvar LINE_CODE=/^(CORNERS|SHOTS)_/;\n" + fn("lineCheck") +
    "\nreturn {lineCheck:lineCheck, BOOKS:BOOKS};")(el, fetchStub);
  return { api, el, calls };
}

const pick = (ev, code, extra) => Object.assign(
  { id: "id" + ev, code, p: 0.7, f: { home: "H" + ev, away: "A" + ev, eventId: ev, sportyOdds: {} } }, extra);
const tick = () => new Promise((r) => setTimeout(r, 0));

test("a slip with no corners or shots is not held up", () => {
  const h = harness("sporty", { verdicts: [] });
  const ran = h.api.lineCheck([pick("e1", "OVER_2.5")], h.api.BOOKS.sporty, "t", () => {});
  assert.strictEqual(ran, false);
  assert.strictEqual(h.calls.length, 0, "goals legs cost SportyBet no request");
});

test("only SportyBet is checked", () => {
  const h = harness("bet9ja", { verdicts: [] });
  assert.strictEqual(h.api.lineCheck([pick("e1", "SHOTS_OV_25.5")], h.api.BOOKS.bet9ja, "t", () => {}), false);
});

test("only the corners and shots legs are sent to be checked", async () => {
  const h = harness("sporty", { verdicts: [] });
  let got = null;
  const picks = [pick("e1", "OVER_2.5"), pick("e2", "SHOTS_OV_25.5")];
  assert.strictEqual(h.api.lineCheck(picks, h.api.BOOKS.sporty, "t", (p) => { got = p; }), true);
  await tick(); await tick();
  assert.deepStrictEqual(h.calls[0].body.selections.map((s) => s.prediction), ["SHOTS_OV_25.5"]);
  assert.match(h.calls[0].url, /check=lines/);
  assert.strictEqual(got, picks, "nothing moved: the slip books untouched, with no question");
});

test("a moved line is offered with SportyBet's price, and taken only on a tap", async () => {
  const h = harness("sporty", { verdicts: [
    { eventId: "e2", prediction: "SHOTS_OV_25.5", reason: "line_moved", now: "SHOTS_OV_27.5", odds: 1.85 },
    { eventId: "e3", prediction: "CORNERS_OV_9.5", reason: "closed" },
  ] });
  let got = null;
  const picks = [pick("e1", "OVER_2.5"), pick("e2", "SHOTS_OV_25.5"), pick("e3", "CORNERS_OV_9.5")];
  h.api.lineCheck(picks, h.api.BOOKS.sporty, "t", (p, swaps, dropped) => { got = { p, swaps, dropped }; });
  await tick(); await tick();
  assert.strictEqual(got, null, "nothing is booked before the reader answers");
  assert.match(h.el.innerHTML, /Over 25\.5 shots → Over 27\.5 shots @ 1\.85/);
  assert.match(h.el.innerHTML, /He3 v Ae3 \(market closed\)/);
  assert.match(h.el.innerHTML, /Update and book/);
  h.el._on["confirm-go"]();
  assert.deepStrictEqual(got.p.map((c) => c.code), ["OVER_2.5", "SHOTS_OV_27.5"]);
  assert.strictEqual(got.p[1].p, 0.61, "our probability for the new line, not the old one");
  assert.strictEqual(picks[1].f.sportyOdds["SHOTS_OV_27.5"], 1.85, "their live price is the one the slip totals");
  assert.deepStrictEqual(got.swaps, [{ id: "ide2", from: "SHOTS_OV_25.5", to: "SHOTS_OV_27.5" }]);
  assert.deepStrictEqual(got.dropped, [picks[2]]);
  assert.strictEqual(picks[1].code, "SHOTS_OV_25.5", "the reader's own pick object is not edited in place");
});

test("a check that fails books exactly as before", async () => {
  const h = harness("sporty", "fail");
  let got = null;
  const picks = [pick("e2", "SHOTS_OV_25.5")];
  h.api.lineCheck(picks, h.api.BOOKS.sporty, "t", (p) => { got = p; });
  await tick(); await tick();
  assert.strictEqual(got, picks);
  assert.strictEqual(h.api.lineCheck(picks, h.api.BOOKS.sporty, "t", () => {}), false,
    "and the second pass does not ask again");
});
