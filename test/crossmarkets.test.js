"use strict";
/* WHAT THE CONVERTER WILL ACTUALLY MOVE.
 *
 * The API maps a market on both books; the panel still has to be willing to
 * send it. Those are two different lists and they drifted: 1X2-or-Over/Under
 * at 2.5 was mapped on both books for a week while the panel refused every
 * such leg with "Bet9ja sells this at 1.5 and 3.5, not 2.5". That sentence was
 * true of the market it was looking at and false of the book - their 2.5 is a
 * different key, S_CHANCEMIXGGOU, which bet9ja.py has mapped since a punter's
 * real code turned it up.
 *
 * So this pins the two lists against each other: every market both books map
 * must have a name on the panel, and the panel must not carry a rule that
 * refuses a whole family the API can book.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const API = path.join(ROOT, "..", "..", "Documents", "soccerwizard-api");
const src = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8");

function grab(name) {
  const i = src.indexOf("function " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}") { d--; if (!d) break; }
  }
  return src.slice(i, k + 1);
}

const mLabel = new Function("esc", grab("mLabel") + "\nreturn mLabel;")((s) => String(s));
const mixReline = new Function(grab("mixReline") + "\nreturn mixReline;")();

/* The keys of both PASSTHROUGH_MAPs, asked of the API itself. Half of each
   table is generated in loops, so a copy here would go stale the first time a
   line is added, and a regex over the source reads only the literals. */
let TABLES = null;
function tables() {
  if (TABLES) return TABLES;
  const { execSync } = require("node:child_process");
  const code = "import sys,json;sys.path.insert(0,r'" + API + "');" +
    "import server,bet9ja;" +
    "print(json.dumps({'s':sorted(server.PASSTHROUGH_MAP),'b':sorted(bet9ja.PASSTHROUGH_MAP)}))";
  const out = execSync("python -c " + JSON.stringify(code), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const got = JSON.parse(out.slice(out.indexOf("{")));
  TABLES = { s: new Set(got.s), b: new Set(got.b) };
  return TABLES;
}
const passthroughKeys = (which) => tables()[which];

test("every market both books map has a name on the panel", () => {
  /* Unlabelled, a leg printed its own code - "CORNERS_OV_8.5" where a sentence
     belongs - which is how a reader finds out we shipped a market we did not
     finish. Only the literal keys are checked; the generated lines are covered
     by the shapes mLabel parses. */
  const shared = [...passthroughKeys("s")].filter((k) => passthroughKeys("b").has(k));
  assert.ok(shared.length >= 20, "read only " + shared.length + " shared codes");
  const f = { home: "Home", away: "Away" };
  const nameless = shared.filter((c) => {
    const l = mLabel(f, c);
    return !l || l === c || /^[A-Z0-9_.]+$/.test(l);
  });
  assert.deepEqual(nameless, [], "these would print as raw codes");
});

test("a 1X2-or-Over/Under leg at 2.5 is not refused on its way to Bet9ja", () => {
  /* The bug: a blanket rule on the family rather than on the line. */
  assert.doesNotMatch(src, /stuck\.push\(\{leg:l, why:to\.label\+" sells this at/,
    "the panel still refuses the family Bet9ja can book");
  assert.doesNotMatch(src, /else if\(\/\^MIX_\/\.test\(code\)/,
    "the blanket rule on the family is back");
  /* And the line that genuinely cannot travel is still the one that moves. */
  assert.equal(mixReline("MIX_1_OV_2.5"), null, "2.5 crosses untouched");
  assert.equal(mixReline("MIX_1_OV_1.5"), "MIX_1_OV_2.5");
  assert.equal(mixReline("MIX_X_UN_3.5"), "MIX_X_UN_2.5");
});

test("both books map the 2.5 line, which is what makes that legal", () => {
  const s = passthroughKeys("s"), b = passthroughKeys("b");
  for (const code of ["MIX_1_OV_2.5", "MIX_1_UN_2.5", "MIX_X_OV_2.5",
    "MIX_X_UN_2.5", "MIX_2_OV_2.5", "MIX_2_UN_2.5"]) {
    assert.ok(s.has(code), "SportyBet no longer maps " + code);
    assert.ok(b.has(code), "Bet9ja no longer maps " + code);
  }
});
