# European Results Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fit Skypredict's country offsets from real cross-border results instead of importing them wholesale from the UEFA association coefficient, without adding any CPU to the Vercel build.

**Architecture:** A CC0 corpus of European club matches is harvested offline by `scripts/mkeurope.js`, resolved against the model's own index, and used to fit one strength offset per country - shrunk toward today's imported number by how much evidence that country actually has. The fit runs on a developer machine and its output is committed as `data/country-offsets.json`. The build reads that one small file and does no fitting, no fetching and no extra work.

**Tech Stack:** Node built-ins only. Tests are `node --test` (`npm test`). No dependencies are added by this plan - the repo has none and must keep none.

**Spec:** `docs/specs/2026-09-06-european-results-source-design.md`

## Global Constraints

- **No added CPU in the Vercel build.** No extra `fitModel` call, no network request, no corpus read. The build reads `data/country-offsets.json` and nothing else new.
- **European matches never enter `fitModel`.** Club ratings must not move. Any task that changes a domestic fixture's prediction is wrong.
- **No change to `CROSS_COUNTRY_SHRINK` (0.55)**, no change to the goals-only restriction in `bestTip`, no European ties in pick of the day.
- **A club that does not resolve is dropped and reported, never guessed.**
- **Only the 90-minute score may reach the fit.** Never an extra-time score, never a penalty shootout.
- **Every fallback degrades to today's behaviour.** A missing, empty or corrupt `data/country-offsets.json` must produce exactly the numbers the site produces now, and must never throw.
- **Zero new dependencies.** `package.json` has no `dependencies` or `devDependencies` and must still have none when this is done.
- Anchor country is `England`; `COUNTRY_ANCHOR = 102.019`, `COUNTRY_SCALE = 0.50`, `COUNTRY_CAP = 0.70`, all already in `lib/build.js`.

---

## File Structure

**Create:**
- `lib/openfootball.js` - parses openfootball match text into rows. Pure, no I/O. Owns the a.e.t./penalty score rules.
- `lib/euroresolve.js` - turns parsed rows into resolved cross-border matches against a model index. Pure, no I/O.
- `lib/eurofit.js` - fits the country offsets. Pure, no I/O.
- `lib/euroffsets.js` - loads and validates `data/country-offsets.json` at build time, with the fallback behaviour.
- `scripts/mkeurope.js` - the offline harvest CLI that wires the four together and writes the artefacts.
- `test/openfootball.test.js`, `test/euroalias.test.js`, `test/euroresolve.test.js`, `test/floorload.test.js`, `test/eurofit.test.js`, `test/countryoffsets.test.js`

**Modify:**
- `lib/model.js` - add entries to `TEAM_ALIAS_SRC` (the block ends around line 895).
- `lib/build.js` - add and export `loadFloorMatches()`; change `countryHandicap` (line 763) to consult the artefact.
- `scripts/prebuild.js:172` - add the new log line to the whitelist regex.

**Generated and committed by Task 8:**
- `data/europe/<season>-<comp>.txt.gz` - openfootball source text, verbatim.
- `data/country-offsets.json` - the fitted offsets.

Four small pure modules rather than one: each is separately testable, and the parser - the piece that can silently invent a football result - is isolated from everything else.

---

### Task 1: The openfootball parser

The dangerous part, so it goes first. openfootball writes `4-3 pen. 1-1 a.e.t. (1-1, 0-1)`; a naive reader takes `4-3`, a penalty shootout, for a 4-3 football match and feeds it to the model. Nothing downstream would catch that.

**Files:**
- Create: `lib/openfootball.js`
- Test: `test/openfootball.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `parse(text) -> { rows, dropped }` where `rows` is an array of `{ home, homeCC, away, awayCC, hg, ag, hth, hta, aet, pen }` (`hth`/`hta` are `null` when unknown, `aet`/`pen` are booleans) and `dropped` is an array of `{ line, why }`.

- [ ] **Step 1: Write the failing test**

```js
"use strict";
/* THE PARSER IS THE PLACE THIS WORK CAN INVENT A RESULT.
 *
 * openfootball records a knockout tie as
 *     4-3 pen. 1-1 a.e.t. (1-1, 0-1)
 * which is a penalty shootout, then the score after extra time, then
 * (90 minutes, half time). A reader that takes the first pair it sees
 * records a 4-3 football match that was really 1-1, and the model would
 * fit on it without a murmur.
 *
 * The model is fitted on 90-minute scores, so the 90-minute score is the
 * only one allowed out of here. */
const test = require("node:test");
const assert = require("node:assert");
const OF = require("../lib/openfootball.js");

const line = (s) => OF.parse(s).rows[0];

test("an ordinary result is the bare score, with the parens as half time", () => {
  const r = line("    18:45  Athletic Club (ESP)     v Arsenal FC (ENG)         0-2 (0-0)");
  assert.equal(r.home, "Athletic Club");
  assert.equal(r.homeCC, "ESP");
  assert.equal(r.away, "Arsenal FC");
  assert.equal(r.awayCC, "ENG");
  assert.deepEqual([r.hg, r.ag], [0, 2]);
  assert.deepEqual([r.hth, r.hta], [0, 0]);
  assert.equal(r.aet, false);
});

test("extra time: the parens carry the 90-minute score FIRST, then half time", () => {
  const r = line("    21:00  Juventus FC (ITA)  v Galatasaray SK (TUR)  3-2 a.e.t. (3-0, 1-0)");
  assert.deepEqual([r.hg, r.ag], [3, 0], "3-2 is after extra time; 90 minutes was 3-0");
  assert.deepEqual([r.hth, r.hta], [1, 0]);
  assert.equal(r.aet, true);
});

test("a shootout is never returned as a football result", () => {
  const r = line("    18:00  Paris SG (FRA)  v Arsenal FC (ENG)  4-3 pen. 1-1 a.e.t. (1-1, 0-1)");
  assert.deepEqual([r.hg, r.ag], [1, 1],
    "4-3 is a penalty shootout and 1-1 the extra-time score; 90 minutes was 1-1");
  assert.deepEqual([r.hth, r.hta], [0, 1]);
  assert.equal(r.pen, true);
});

test("extra time with only one pair in the parens leaves half time unknown", () => {
  const r = line("    19:00  FK Partizani (ALB)  v JK Nomme Kalju (EST)  0-1 a.e.t. (0-0)");
  assert.deepEqual([r.hg, r.ag], [0, 0]);
  assert.equal(r.hth, null, "a half-time score we do not have must be null, never 0");
  assert.equal(r.hta, null);
});

test("an inconsistent line is dropped and reported, not repaired", () => {
  /* The extra-time score can never be BEHIND the 90-minute score. */
  const out = OF.parse("    18:45  A Club (ESP)  v B Club (ITA)  1-0 a.e.t. (3-0, 1-0)");
  assert.equal(out.rows.length, 0);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0].why, /extra time/i);
});

test("headers, blank lines and matchday markers are ignored silently", () => {
  const out = OF.parse([
    "= UEFA Champions League 2025/26",
    "# Matches    189",
    "",
    "> League, Matchday 1",
    "  Tue Sep 16 2025",
    "    18:45  A Club (ESP)  v B Club (ITA)  1-0 (0-0)",
  ].join("\n"));
  assert.equal(out.rows.length, 1);
  assert.equal(out.dropped.length, 0, "structure lines are not failures and must not be reported");
});

test("a club with no country tag is dropped rather than half-read", () => {
  const out = OF.parse("    18:45  A Club  v B Club (ITA)  1-0 (0-0)");
  assert.equal(out.rows.length, 0);
  assert.equal(out.dropped.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/openfootball.test.js`
Expected: FAIL - `Cannot find module '../lib/openfootball.js'`

- [ ] **Step 3: Write minimal implementation**

```js
"use strict";
/**
 * openfootball match text -> rows.
 *
 * The format, by example:
 *
 *   2-3 (2-0)                        90 min 2-3, half time 2-0
 *   3-2 a.e.t. (3-0, 1-0)            90 min 3-0, half time 1-0   (3-2 after ET)
 *   0-1 a.e.t. (0-0)                 90 min 0-0, half time unknown
 *   4-3 pen. 1-1 a.e.t. (1-1, 0-1)   90 min 1-1, half time 0-1   (4-3 a shootout)
 *
 * THE RULE: when `a.e.t.` appears the parenthesised list is (90 minutes,
 * half time); otherwise it is (half time) and the bare pair is 90 minutes.
 * Any shootout pair is discarded.
 *
 * We take the 90-minute score because that is what the domestic model is
 * fitted on. Handing an extra-time or shootout score to the fit is not a
 * slightly wrong result, it is a match that never happened, and it would be
 * invisible in every check downstream.
 *
 * Anything that does not fit one of those four shapes is DROPPED and reported.
 * The corpus is worth less than its trustworthiness.
 *
 * Dates are deliberately not parsed. The fit works per season, and the season
 * comes from the filename, so a date carry-forward across "Tue Sep 16 2025"
 * and the bare "Wed Sep 17" that follows it would be risk with no buyer.
 */

/* "  18:45  Home Club (ESP)     v Away Club (ENG)         0-2 (0-0)" */
const LINE = /^\s*(?:\d{1,2}:\d{2}\s+)?(.+?)\s+v\s+(.+?)\s\s+(\d.*?)\s*$/;
const TAG = /^(.*?)\s*\(([A-Z]{3})\)$/;

function pairs(tail) {
  const re = /(\d+)-(\d+)/g;
  const out = [];
  let m;
  while ((m = re.exec(tail))) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

function score(tail) {
  const all = pairs(tail);
  if (!all.length) return { why: "no score" };
  const pen = /pen\./i.test(tail);
  const aet = /a\.?e\.?t\.?/i.test(tail);
  let ft, ht;
  if (aet) {
    /* drop the shootout pair when there is one: [aet, ft90, ht?] */
    const rest = pen ? all.slice(1) : all;
    if (rest.length < 2) return { why: "extra time without a 90-minute score" };
    ft = rest[1];
    ht = rest[2] || null;
    if (rest[0][0] < ft[0] || rest[0][1] < ft[1])
      return { why: "extra time score is behind the 90-minute score" };
  } else {
    if (pen) return { why: "penalties without extra time" };
    ft = all[0];
    ht = all[1] || null;
  }
  if (ht && (ht[0] > ft[0] || ht[1] > ft[1]))
    return { why: "half-time score is ahead of the 90-minute score" };
  return { hg: ft[0], ag: ft[1], hth: ht ? ht[0] : null, hta: ht ? ht[1] : null,
           aet: aet, pen: pen };
}

function parse(text) {
  const rows = [], dropped = [];
  for (const raw of String(text == null ? "" : text).split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;                       /* headers, dates, blank lines */
    const h = TAG.exec(m[1].trim()), a = TAG.exec(m[2].trim());
    if (!h || !a) { dropped.push({ line: raw, why: "club without a country tag" }); continue; }
    const s = score(m[3]);
    if (s.why) { dropped.push({ line: raw, why: s.why }); continue; }
    rows.push({ home: h[1], homeCC: h[2], away: a[1], awayCC: a[2],
                hg: s.hg, ag: s.ag, hth: s.hth, hta: s.hta,
                aet: s.aet, pen: s.pen });
  }
  return { rows, dropped };
}

module.exports = { parse };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/openfootball.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Verify the parse is complete against openfootball's own totals**

openfootball declares `# Matches 189` in `2025-26/cl.txt` and `# Matches 256` in `2025-26/confq.txt`. Fetch both and confirm `parse()` returns exactly those counts. This is the check that catches a regex silently skipping a shape.

Run:
```bash
node -e '
const https=require("https"),OF=require("./lib/openfootball.js");
const get=u=>new Promise(r=>https.get(u,x=>{let s="";x.on("data",d=>s+=d);x.on("end",()=>r(s))}));
(async()=>{
  for(const [f,want] of [["cl",189],["confq",256]]){
    const t=await get(`https://raw.githubusercontent.com/openfootball/champions-league/master/2025-26/${f}.txt`);
    const o=OF.parse(t);
    console.log(f, o.rows.length, "expected", want, "dropped", o.dropped.length,
                o.rows.length===want?"OK":"MISMATCH");
  }
})()'
```
Expected: `cl 189 expected 189 dropped 0 OK` and `confq 256 expected 256 dropped 0 OK`

- [ ] **Step 6: Commit**

```bash
git add lib/openfootball.js test/openfootball.test.js
git commit -m "Read openfootball results without mistaking a shootout for a scoreline"
```

---

### Task 2: The aliases

Every pair below was checked by hand against the index the model builds from the committed floor. This task changes no behaviour beyond name resolution.

**Files:**
- Modify: `lib/model.js` - `TEAM_ALIAS_SRC`, the block ending around line 895
- Test: `test/euroalias.test.js`

**Interfaces:**
- Consumes: `M.matchTeam(idx, name, li)`, `M.buildIndex(matches)` (both already exported).
- Produces: no new exports. `TEAM_ALIAS_SRC` gains the keys listed in Step 3.

- [ ] **Step 1: Write the failing test**

The test builds its index from a small literal fixture rather than the floor, so it does not depend on `data/results` being present or current.

```js
"use strict";
/* WHY THESE ARE EXPLICIT ALIASES AND NOT A LOWER FUZZY THRESHOLD.
 *
 * openfootball uses full official names. Measured against our index, the
 * nearest fuzzy candidate is frequently the WRONG CLUB:
 *
 *   HJK Helsinki      -> JJK Jyvaskyla    (0.31)   a different club
 *   Real Betis        -> Real Madrid      (0.55)   a different club
 *   FC Internazionale -> Salernitana      (0.29)   a different club
 *   AEK Athen         -> Athens Kallithea (0.44)   a different club
 *   Stade Brestois 29 -> St Etienne       (0.35)   a different club
 *   Wisla Krakow      -> Wisla Plock      (0.42)   a different club
 *
 * matchTeam refuses all of these today, because the bar is 0.82 with a league
 * given. That refusal is the system working. Lowering the bar to admit the
 * corpus would admit these too - the same failure as York City scoring 0.889
 * against Cork City. So the names are stated, once, by hand. */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");

const D = new Date("2026-05-01");
const m = (league, home, away) => ({ date: D, league, home, away, hg: 1, ag: 0 });

/* Only the clubs these assertions need, in their real leagues. */
const idx = M.buildIndex([
  m("Spain La Liga 1", "Ath Bilbao", "Betis"),
  m("Spain La Liga 1", "Real Madrid", "Ath Madrid"),
  m("Italy Serie A", "Inter", "Lazio"),
  m("Italy Serie A", "Salernitana", "Fiorentina"),
  m("Finland Veikkausliiga", "HJK", "JJK Jyvaskyla"),
  m("Finland Veikkausliiga", "KuPS", "VPS"),
  m("Finland Veikkausliiga", "SJK", "Ekenas"),
  m("Greece Super League", "AEK", "Athens Kallithea"),
  m("France Ligue 1", "Paris SG", "Marseille"),
  m("France Ligue 1", "Lyon", "Brest"),
  m("France Ligue 1", "St Etienne", "Le Havre"),
  m("Germany Bundesliga 1", "Bayern Munich", "Leverkusen"),
  m("Germany Bundesliga 1", "Hoffenheim", "Heidenheim"),
  m("Germany Bundesliga 1", "Mainz", "Schalke 04"),
  m("England Premier League", "Man City", "Man United"),
  m("Netherlands Eredivisie", "PSV Eindhoven", "Ajax"),
  m("Belgium Pro League", "St. Gilloise", "Charleroi"),
  m("Portugal Primeira Liga", "Sp Lisbon", "Benfica"),
  m("Portugal Primeira Liga", "Sp Braga", "Porto"),
  m("Denmark Superliga", "FC Copenhagen", "Odense"),
  m("Poland Ekstraklasa", "Wisla", "Wisla Plock"),
  m("Poland Ekstraklasa", "Jagiellonia", "Legia"),
  m("Turkey Super Lig", "Buyuksehyr", "Galatasaray"),
  m("Sweden Allsvenskan", "AIK", "GAIS"),
  m("Austria Bundesliga", "Salzburg", "Hartberg"),
  m("Ireland Premier Division", "St. Patricks", "Shamrock Rovers"),
  m("Romania Superliga", "Univ. Craiova", "CFR Cluj"),
]);
const li = (league) => idx.lIdx[league];

/* openfootball spelling -> what our index calls it, and where it plays. */
const PAIRS = [
  ["Paris Saint-Germain FC", "Paris SG", "France Ligue 1"],
  ["Olympique de Marseille", "Marseille", "France Ligue 1"],
  ["Olympique Lyonnais", "Lyon", "France Ligue 1"],
  ["Stade Brestois 29", "Brest", "France Ligue 1"],
  ["FC Bayern München", "Bayern Munich", "Germany Bundesliga 1"],
  ["Bayer 04 Leverkusen", "Leverkusen", "Germany Bundesliga 1"],
  ["1899 Hoffenheim", "Hoffenheim", "Germany Bundesliga 1"],
  ["1. FC Heidenheim 1846", "Heidenheim", "Germany Bundesliga 1"],
  ["1. FSV Mainz 05", "Mainz", "Germany Bundesliga 1"],
  ["Club Atlético de Madrid", "Ath Madrid", "Spain La Liga 1"],
  ["Athletic Club", "Ath Bilbao", "Spain La Liga 1"],
  ["Real Betis", "Betis", "Spain La Liga 1"],
  ["FC Internazionale Milano", "Inter", "Italy Serie A"],
  ["Lazio Roma", "Lazio", "Italy Serie A"],
  ["Manchester City FC", "Man City", "England Premier League"],
  ["Manchester United", "Man United", "England Premier League"],
  ["PSV", "PSV Eindhoven", "Netherlands Eredivisie"],
  ["Union Saint-Gilloise", "St. Gilloise", "Belgium Pro League"],
  ["Royale Union Saint-Gilloise", "St. Gilloise", "Belgium Pro League"],
  ["Sporting Charleroi", "Charleroi", "Belgium Pro League"],
  ["Sporting Clube de Portugal", "Sp Lisbon", "Portugal Primeira Liga"],
  ["Sport Lisboa e Benfica", "Benfica", "Portugal Primeira Liga"],
  ["Sporting Braga", "Sp Braga", "Portugal Primeira Liga"],
  ["FC København", "FC Copenhagen", "Denmark Superliga"],
  ["HJK Helsinki", "HJK", "Finland Veikkausliiga"],
  ["Kuopion PS", "KuPS", "Finland Veikkausliiga"],
  ["Vaasan PS", "VPS", "Finland Veikkausliiga"],
  ["SJK Seinäjoki", "SJK", "Finland Veikkausliiga"],
  ["AEK Athen", "AEK", "Greece Super League"],
  ["AIK Solna", "AIK", "Sweden Allsvenskan"],
  ["FC Red Bull Salzburg", "Salzburg", "Austria Bundesliga"],
  ["Wisła Kraków", "Wisla", "Poland Ekstraklasa"],
  ["Jagiellonia Białystok", "Jagiellonia", "Poland Ekstraklasa"],
  ["İstanbul Başakşehir", "Buyuksehyr", "Turkey Super Lig"],
  ["St Patrick's Athletic", "St. Patricks", "Ireland Premier Division"],
  ["CS Universitatea Craiova", "Univ. Craiova", "Romania Superliga"],
];

test("every openfootball spelling resolves to the club we mean", () => {
  for (const [name, want, league] of PAIRS) {
    assert.equal(M.matchTeam(idx, name, li(league)), want,
      name + " should resolve to " + want);
  }
});

test("the near misses that fuzzy matching would have taken are not taken", () => {
  assert.notEqual(M.matchTeam(idx, "HJK Helsinki", li("Finland Veikkausliiga")), "JJK Jyvaskyla");
  assert.notEqual(M.matchTeam(idx, "Real Betis", li("Spain La Liga 1")), "Real Madrid");
  assert.notEqual(M.matchTeam(idx, "FC Internazionale Milano", li("Italy Serie A")), "Salernitana");
  assert.notEqual(M.matchTeam(idx, "AEK Athen", li("Greece Super League")), "Athens Kallithea");
  assert.notEqual(M.matchTeam(idx, "Stade Brestois 29", li("France Ligue 1")), "St Etienne");
  assert.notEqual(M.matchTeam(idx, "Wisła Kraków", li("Poland Ekstraklasa")), "Wisla Plock");
});

test("a club we hold no ratings for still resolves to nothing", () => {
  /* Corvinul Hunedoara plays below the Romanian top flight and is not in our
     index. It must stay a clean drop - inventing an alias for it would put a
     club we cannot rate into a fit that assumes we can. */
  assert.equal(M.matchTeam(idx, "FC Corvinul Hunedoara", li("Romania Superliga")), null);
});

test("the aliases have not disturbed the clubs already resolving", () => {
  assert.equal(M.matchTeam(idx, "Real Madrid", li("Spain La Liga 1")), "Real Madrid");
  assert.equal(M.matchTeam(idx, "Wisla Plock", li("Poland Ekstraklasa")), "Wisla Plock");
  assert.equal(M.matchTeam(idx, "JJK Jyvaskyla", li("Finland Veikkausliiga")), "JJK Jyvaskyla");
  assert.equal(M.matchTeam(idx, "Athens Kallithea", li("Greece Super League")), "Athens Kallithea");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/euroalias.test.js`
Expected: FAIL - most `PAIRS` resolve to `null` or the wrong club.

- [ ] **Step 3: Add the aliases**

Append inside `TEAM_ALIAS_SRC` in `lib/model.js`, before the object's closing brace (around line 895), keeping the existing per-country comment style:

```js
  /* ---- openfootball spellings, for the European corpus ----
     Full official names, which is what openfootball carries. These are stated
     rather than fuzzily matched because the nearest candidate is frequently a
     DIFFERENT CLUB: HJK Helsinki scores highest against JJK Jyvaskyla, Real
     Betis against Real Madrid, Inter against Salernitana, Wisla Krakow against
     Wisla Plock. matchTeam refuses all of those today and should keep refusing
     them.
     openfootball also spells the same club several ways across seasons, so a
     club can appear here more than once. */
  "Paris Saint-Germain FC": "Paris SG",
  "Paris Saint-Germain": "Paris SG",
  "Olympique de Marseille": "Marseille",
  "Olympique Marseille": "Marseille",
  "Olympique Lyonnais": "Lyon",
  "Stade Brestois 29": "Brest",
  "FC Bayern München": "Bayern Munich",
  "Bayern München": "Bayern Munich",
  "Bayer 04 Leverkusen": "Leverkusen",
  "1899 Hoffenheim": "Hoffenheim",
  "1. FC Heidenheim 1846": "Heidenheim",
  "1. FSV Mainz 05": "Mainz",
  "Club Atlético de Madrid": "Ath Madrid",
  "Athletic Club": "Ath Bilbao",
  "Real Betis": "Betis",
  "FC Internazionale Milano": "Inter",
  "Lazio Roma": "Lazio",
  "Manchester City FC": "Man City",
  "Manchester United FC": "Man United",
  "Manchester United": "Man United",
  "PSV": "PSV Eindhoven",
  "Union Saint-Gilloise": "St. Gilloise",
  "Royale Union Saint-Gilloise": "St. Gilloise",
  "Sporting Charleroi": "Charleroi",
  "Sporting Clube de Portugal": "Sp Lisbon",
  "Sporting CP": "Sp Lisbon",
  "Sport Lisboa e Benfica": "Benfica",
  "Sporting Braga": "Sp Braga",
  "Sporting Clube de Braga": "Sp Braga",
  "FC København": "FC Copenhagen",
  "HJK Helsinki": "HJK",
  "Kuopion PS": "KuPS",
  "Vaasan PS": "VPS",
  "SJK Seinäjoki": "SJK",
  "AEK Athen": "AEK",
  "AIK Solna": "AIK",
  "FC Red Bull Salzburg": "Salzburg",
  "Wisła Kraków": "Wisla",
  "Jagiellonia Białystok": "Jagiellonia",
  "İstanbul Başakşehir": "Buyuksehyr",
  "St Patrick's Athletic": "St. Patricks",
  /* ROMANIA CARRIES THREE CRAIOVA CLUBS - "U Craiova", "Univ. Craiova" and
     "U Craiova 1948" - and they are not the same club. CS Universitatea
     Craiova is the one that plays in Europe. VERIFY THIS ONE against the
     current index before trusting it; if it cannot be settled, delete the line
     and let those few Romanian ties drop. A wrong club is worse than a smaller
     corpus. */
  "CS Universitatea Craiova": "Univ. Craiova",
```

`TEAM_ALIAS` is built from this object by `normName` on both sides at line 900, so accents and punctuation are handled there and need no special treatment here.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/euroalias.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Run the whole suite - nothing else may move**

Run: `npm test`
Expected: PASS. The suite was 1078 tests before this plan; alias additions must not change any existing resolution.

- [ ] **Step 6: Commit**

```bash
git add lib/model.js test/euroalias.test.js
git commit -m "Name the European clubs openfootball spells differently, by hand"
```

---

### Task 3: The resolver

**Files:**
- Create: `lib/euroresolve.js`
- Test: `test/euroresolve.test.js`

**Interfaces:**
- Consumes: `OF.parse` rows (Task 1); `M.matchTeam`, `M.buildIndex`.
- Produces: `resolve(rows, idx) -> { matches, dropped, byCountry }`. Each match is `{ home, away, homeCountry, awayCountry, homeLeague, awayLeague, hg, ag }` with `home`/`away` being **our** index names and `homeLeague`/`awayLeague` our league names. `byCountry` is `{ [country]: count }` over cross-border matches only. Also exports `COUNTRY_OF_CODE`.

- [ ] **Step 1: Write the failing test**

```js
"use strict";
/* Resolution is safe here for one reason: openfootball stamps the country on
   every club - "Athletic Club (ESP)" - so every lookup is matchTeam's narrow
   league-filtered case (bar 0.82) and never the whole-index case (bar 0.90)
   that produced confident singular errors. Measured over 367 distinct clubs
   across five seasons this produced zero ambiguous and zero wrong matches. */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");
const R = require("../lib/euroresolve.js");

const D = new Date("2026-05-01");
const m = (league, home, away) => ({ date: D, league, home, away, hg: 1, ag: 0 });
const idx = M.buildIndex([
  m("Spain La Liga 1", "Real Madrid", "Barcelona"),
  m("England Premier League", "Arsenal", "Chelsea"),
  m("Italy Serie A", "Inter", "Juventus"),
]);

const row = (home, homeCC, away, awayCC, hg, ag) =>
  ({ home, homeCC, away, awayCC, hg, ag, hth: null, hta: null, aet: false, pen: false });

test("a cross-border tie between two clubs we rate comes through named as we name them", () => {
  const out = R.resolve([row("Real Madrid CF", "ESP", "Arsenal FC", "ENG", 2, 1)], idx);
  assert.equal(out.matches.length, 1);
  const g = out.matches[0];
  assert.equal(g.home, "Real Madrid");
  assert.equal(g.away, "Arsenal");
  assert.equal(g.homeCountry, "Spain");
  assert.equal(g.awayCountry, "England");
  assert.equal(g.homeLeague, "Spain La Liga 1");
  assert.deepEqual([g.hg, g.ag], [2, 1]);
});

test("a club from a country we hold no ratings for is dropped, not guessed", () => {
  const out = R.resolve([row("Real Madrid CF", "ESP", "Qarabag Agdam FK", "AZE", 3, 0)], idx);
  assert.equal(out.matches.length, 0);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0].why, /country/i);
});

test("a club we cannot name is dropped and reported by name", () => {
  const out = R.resolve([row("Real Madrid CF", "ESP", "Some Unknown FC", "ENG", 1, 1)], idx);
  assert.equal(out.matches.length, 0);
  assert.match(out.dropped[0].why, /resolve/i);
  assert.match(out.dropped[0].what, /Some Unknown FC/);
});

test("a domestic tie is kept out of byCountry - it carries no cross-border signal", () => {
  const out = R.resolve([
    row("Real Madrid CF", "ESP", "FC Barcelona", "ESP", 1, 1),
    row("Real Madrid CF", "ESP", "Arsenal FC", "ENG", 2, 1),
  ], idx);
  assert.equal(out.matches.length, 2, "both are usable matches");
  assert.equal(out.byCountry.Spain, 1, "only the cross-border one counts as evidence");
  assert.equal(out.byCountry.England, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/euroresolve.test.js`
Expected: FAIL - `Cannot find module '../lib/euroresolve.js'`

- [ ] **Step 3: Write minimal implementation**

```js
"use strict";
/**
 * openfootball rows -> matches named the way our index names them.
 *
 * Only the countries our ratings cover are listed. A club from anywhere else
 * is dropped: 188 of the 367 clubs in five seasons of European football play
 * in countries we hold no ratings for, and that is an expected outcome rather
 * than a failure to fix.
 */
const M = require("./model.js");

const COUNTRY_OF_CODE = {
  ESP: "Spain", ENG: "England", ITA: "Italy", GER: "Germany", FRA: "France",
  POR: "Portugal", NED: "Netherlands", BEL: "Belgium", TUR: "Turkey",
  GRE: "Greece", SCO: "Scotland", DEN: "Denmark", NOR: "Norway",
  SWE: "Sweden", AUT: "Austria", SUI: "Switzerland", POL: "Poland",
  ROU: "Romania", RUS: "Russia", IRL: "Ireland", FIN: "Finland",
};

function leaguesByCountry(idx) {
  const by = new Map();
  idx.leagues.forEach((name, li) => {
    const country = String(name).split(" ")[0];
    if (!by.has(country)) by.set(country, []);
    by.get(country).push(li);
  });
  return by;
}

/* Unique hit across that country's divisions, or nothing. A club that matches
   in two divisions is ambiguous and is refused - the same rule matchTeam uses
   for an alias. */
function findIn(idx, by, country, name) {
  const lis = by.get(country) || [];
  const hits = new Map();
  for (const li of lis) {
    const t = M.matchTeam(idx, name, li);
    if (t) hits.set(t, li);
  }
  if (hits.size !== 1) return null;
  const team = [...hits.keys()][0];
  return { team, league: idx.leagues[hits.get(team)] };
}

function resolve(rows, idx) {
  const by = leaguesByCountry(idx);
  const matches = [], dropped = [], byCountry = {};
  for (const r of (rows || [])) {
    const hc = COUNTRY_OF_CODE[r.homeCC], ac = COUNTRY_OF_CODE[r.awayCC];
    if (!hc || !ac) {
      dropped.push({ what: r.home + " v " + r.away, why: "country we hold no ratings for" });
      continue;
    }
    const h = findIn(idx, by, hc, r.home), a = findIn(idx, by, ac, r.away);
    if (!h || !a) {
      dropped.push({ what: (h ? r.away : r.home), why: "could not resolve the club" });
      continue;
    }
    matches.push({ home: h.team, away: a.team,
                   homeCountry: hc, awayCountry: ac,
                   homeLeague: h.league, awayLeague: a.league,
                   hg: r.hg, ag: r.ag });
    if (hc !== ac) {
      byCountry[hc] = (byCountry[hc] || 0) + 1;
      byCountry[ac] = (byCountry[ac] || 0) + 1;
    }
  }
  return { matches, dropped, byCountry };
}

module.exports = { resolve, COUNTRY_OF_CODE };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/euroresolve.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add lib/euroresolve.js test/euroresolve.test.js
git commit -m "Resolve European clubs through their own country, or drop them"
```

---

### Task 4: Loading the committed floor

`scripts/mkeurope.js` needs the floor as matches with correct league names. `lib/build.js` already knows how - `RESULTS_CACHE`, `MAIN`, `EXTRA`, `EXTRA_FILE` - but does not expose it. This task exposes it rather than duplicating it.

**Files:**
- Modify: `lib/build.js` (add `loadFloorMatches`, add to `module.exports` at lines 2530-2532)
- Test: `test/floorload.test.js`

**Interfaces:**
- Consumes: `M.parseCSV`, `M.normalise`, and the existing `MAIN` / `EXTRA` / `EXTRA_FILE` / `RESULTS_CACHE` constants in `lib/build.js`.
- Produces: `loadFloorMatches() -> matches[]` in the build's own match shape (`{ date: Date, league, home, away, hg, ag, ... }`), read from `data/results/*.csv.gz` only, with no network access.

- [ ] **Step 1: Write the failing test**

```js
"use strict";
/* The floor is the only history this repo can rely on: football-data.co.uk
   has been answering 503 since 5 Sep 2026, and the whole point of committing
   finished seasons was that they never change. The European offset fit reads
   the same files the build reads, so the two can never disagree about what a
   club's rating was. */
const test = require("node:test");
const assert = require("node:assert");
const B = require("../lib/build.js");

test("the floor loads without touching the network", () => {
  const ms = B.loadFloorMatches();
  assert.ok(ms.length > 40000, "expected the committed floor, got " + ms.length + " matches");
  for (const m of ms.slice(0, 50)) {
    assert.ok(m.date instanceof Date && !isNaN(m.date), "every row needs a real date");
    assert.equal(typeof m.league, "string");
    assert.ok(m.league.length > 0, "a match with no league cannot be fitted");
    assert.equal(typeof m.hg, "number");
  }
});

test("league names are the ones the model indexes on, not raw division codes", () => {
  const leagues = new Set(B.loadFloorMatches().map((m) => m.league));
  assert.ok(leagues.has("England Premier League"), "expected mapped names, not E0");
  assert.ok(!leagues.has("E0"), "a raw division code means the mapping was skipped");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/floorload.test.js`
Expected: FAIL - `B.loadFloorMatches is not a function`

- [ ] **Step 3: Add `loadFloorMatches` to `lib/build.js`**

Place it directly after `cachedResultsFor` (which ends around line 570), so it sits with the other floor code:

```js
/* THE FLOOR, READ AS MATCHES.
 *
 * The build reads these files through the download path, falling back to disk.
 * The European offset fit has no download path and wants only the disk - it
 * runs offline, by hand, and must produce the same ratings the build would.
 * Sharing this function is what keeps those two in step; re-deriving the
 * filename-to-league mapping in a script is how they would drift.
 *
 * Read-only, no network, no season filter: callers decide what they want. */
function loadFloorMatches() {
  const out = [];
  let names;
  try { names = fs.readdirSync(RESULTS_CACHE); } catch (e) { return out; }
  for (const name of names) {
    const mMain = /^(\d{4})_([A-Za-z0-9]+)\.csv(?:\.gz)?$/.exec(name);
    const mExtra = /^extra_([A-Za-z0-9]+)\.csv(?:\.gz)?$/.exec(name);
    if (!mMain && !mExtra) continue;

    let text = null;
    const full = path.join(RESULTS_CACHE, name);
    try {
      text = name.endsWith(".gz")
        ? zlib.gunzipSync(fs.readFileSync(full)).toString("utf8")
        : fs.readFileSync(full, "utf8");
    } catch (e) { continue; }
    if (!text || text.length < 100) continue;

    const rows = M.parseCSV(text);
    if (rows.length < 2) continue;
    const res = M.normalise(rows);
    if (res.error) continue;

    if (mMain) {
      /* Trust the configured name over the file's own Div, exactly as
         rowsToMatches does. */
      const league = MAIN[mMain[2]];
      if (!league) continue;
      for (const r of res.matches) { r.league = league; out.push(r); }
    } else {
      /* A combined country file holds several competitions; keep the one
         configured for that country. */
      const country = Object.keys(EXTRA_FILE)
        .find((c) => EXTRA_FILE[c] === mExtra[1] + ".csv");
      if (!country) continue;
      const want = country + " " + EXTRA[country];
      for (const r of res.matches) if (r.league === want) out.push(r);
    }
  }
  return out;
}
```

Then add it to the export list at the end of the file:

```js
  tierEdge, countryHandicap, rungOf, UEFA_COEFFICIENT, TIER_HANDICAP,
  CROSS_TIER_SHRINK, CROSS_COUNTRY_SHRINK, COUNTRY_CAP, loadFloorMatches };
```

`fs`, `path` and `zlib` are already required at the top of `lib/build.js` - `cachedResultsFor` uses all three.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/floorload.test.js`
Expected: PASS, 2 tests. Roughly 67,000 matches.

- [ ] **Step 5: Commit**

```bash
git add lib/build.js test/floorload.test.js
git commit -m "Expose the committed floor so the offset fit reads what the build reads"
```

---

### Task 5: The offset fit

**Files:**
- Create: `lib/eurofit.js`
- Test: `test/eurofit.test.js`

**Interfaces:**
- Consumes: resolved matches (Task 3) each carrying a `season`; per-season models from `M.fitModel`; `rungOf`, `UEFA_COEFFICIENT` and `COUNTRY_CAP` from `lib/build.js`.
- Produces:
  - `priorFor(country, coefficients, { anchor, scale, cap }) -> number|null`
  - `fitOffsets({ matches, modelOf, rungOf, priors, K, cap, anchorCountry, iters }) -> { [country]: { offset, prior, matches, clamped } }`
  - `chooseK({ matches, modelOf, rungOf, priors, cap, grid, folds }) -> { K, deviance, grid }`
  - `deviance(preparedRows, C) -> number`

- [ ] **Step 1: Write the failing test**

```js
"use strict";
/* WHAT THIS FIT IS ALLOWED TO CLAIM.
 *
 * The mean structure is predictTotals' and tierEdge's, exactly:
 *   e   = (rung(away league) + C_away) - (rung(home league) + C_home)
 *   lh  = exp(lgI[home league] + att[h] - def[a] + hadv + e)
 *   la  = exp(lgI[home league] + att[a] - def[h] - e)
 * so the number that comes out is in the units countryHandicap hands to
 * tierEdge, and nothing has to be converted on the way in.
 *
 * England is pinned at 0 because that is the anchor COUNTRY_ANCHOR already
 * uses. Everything else is measured relative to it, shrunk toward the
 * imported coefficient by how much evidence there is.
 *
 * Russia has been banned from UEFA competitions since 2022 and will never
 * acquire evidence. It must come out carrying today's number exactly. */
const test = require("node:test");
const assert = require("node:assert");
const F = require("../lib/eurofit.js");

/* A toy world: two countries, ratings all zero, so the ONLY thing that can
   explain a goal difference is the country offset. */
const model = {
  index: { tIdx: { A1: 0, A2: 1, B1: 2, B2: 3 }, lIdx: { "Aland Top": 0, "Bland Top": 1 } },
  att: [0, 0, 0, 0], def: [0, 0, 0, 0],
  lgI: [Math.log(1.3), Math.log(1.3)], hadv: 0, k: 200,
};
const modelOf = () => model;
const rungOf = () => 0;
const isA = (t) => t === "A1" || t === "A2";
const tie = (home, away, hg, ag) => ({
  home, away, hg, ag, season: "2025-26",
  homeCountry: isA(home) ? "Aland" : "Bland",
  awayCountry: isA(away) ? "Aland" : "Bland",
  homeLeague: isA(home) ? "Aland Top" : "Bland Top",
  awayLeague: isA(away) ? "Aland Top" : "Bland Top",
});

test("a country with no evidence comes out on exactly its prior", () => {
  const out = F.fitOffsets({
    matches: [tie("A1", "A2", 1, 1)],          /* domestic - no cross-border signal */
    modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.31, Neverland: 0.55 },
    K: 40,
  });
  assert.equal(out.Neverland.matches, 0);
  assert.equal(out.Neverland.offset, 0.55,
    "a country with nothing measured must keep the imported number, unchanged");
});

test("the anchor is pinned at zero and never drifts", () => {
  const ms = [];
  for (let i = 0; i < 200; i++) ms.push(tie("A1", "B1", 4, 0));
  const out = F.fitOffsets({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.31 }, K: 1 });
  assert.equal(out.Aland.offset, 0, "England's analogue must stay the anchor");
});

test("lopsided evidence moves the weaker country away from the anchor", () => {
  /* Aland clubs beat Bland clubs 4-0, every time, home and away. */
  const ms = [];
  for (let i = 0; i < 200; i++) { ms.push(tie("A1", "B1", 4, 0)); ms.push(tie("B2", "A2", 0, 4)); }
  const out = F.fitOffsets({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.10 }, K: 1 });
  assert.ok(out.Bland.offset > 0.10,
    "with overwhelming evidence Bland is weaker than the prior said; got " + out.Bland.offset);
  assert.equal(out.Bland.matches, 400);
});

test("shrinkage: thin evidence stays near the prior, thick evidence leaves it", () => {
  const thin = [tie("A1", "B1", 4, 0), tie("B2", "A2", 0, 4)];
  const thick = [];
  for (let i = 0; i < 400; i++) { thick.push(tie("A1", "B1", 4, 0)); thick.push(tie("B2", "A2", 0, 4)); }
  const priors = { Aland: 0, Bland: 0.10 };
  const a = F.fitOffsets({ matches: thin, modelOf, rungOf, priors, K: 40 }).Bland.offset;
  const b = F.fitOffsets({ matches: thick, modelOf, rungOf, priors, K: 40 }).Bland.offset;
  assert.ok(Math.abs(a - 0.10) < Math.abs(b - 0.10),
    "two matches must move the number less than eight hundred do");
});

test("a fitted value never escapes the cap", () => {
  const ms = [];
  for (let i = 0; i < 400; i++) ms.push(tie("A1", "B1", 9, 0));
  const out = F.fitOffsets({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.10 }, K: 1, cap: 0.70 });
  assert.ok(out.Bland.offset <= 0.70);
  assert.equal(out.Bland.clamped, true, "the artefact must record that the cap bound");
});

test("the prior is the number the site ships today", () => {
  const coef = { England: 102.019, Spain: 82.493, Russia: 17.332 };
  const o = { anchor: 102.019, scale: 0.5, cap: 0.7 };
  assert.equal(F.priorFor("England", coef, o), 0);
  const spain = F.priorFor("Spain", coef, o);
  assert.ok(Math.abs(spain - 0.1062) < 0.0005, "0.5*(ln 102.019 - ln 82.493); got " + spain);
  assert.equal(F.priorFor("Russia", coef, o), 0.7,
    "Russia's raw 0.886 must clamp to the cap, as it does today");
  assert.equal(F.priorFor("Narnia", coef, o), null,
    "no coefficient means refuse, never treat as equal");
});

test("chooseK scores every K on the grid and picks by held-out deviance", () => {
  const ms = [];
  for (let i = 0; i < 300; i++) { ms.push(tie("A1", "B1", 3, 0)); ms.push(tie("B2", "A2", 0, 3)); }
  const got = F.chooseK({ matches: ms, modelOf, rungOf,
    priors: { Aland: 0, Bland: 0.02 }, grid: [1, 40, 10000], folds: 5 });
  assert.equal(got.grid.length, 3, "every K on the grid must be scored");
  assert.ok(got.grid.every((g) => isFinite(g.deviance)));
  assert.notEqual(got.K, 10000,
    "with 600 consistent matches the fit should not be dragged back to a badly wrong prior");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/eurofit.test.js`
Expected: FAIL - `Cannot find module '../lib/eurofit.js'`

- [ ] **Step 3: Write minimal implementation**

```js
"use strict";
/**
 * One strength offset per country, fitted from cross-border matches and shrunk
 * toward the imported UEFA-derived prior.
 *
 * THE MEAN STRUCTURE IS COPIED FROM predictTotals AND tierEdge ON PURPOSE, so
 * what comes out is already in the units countryHandicap hands to tierEdge:
 *
 *   e  = (rung(awayLeague) + C_away) - (rung(homeLeague) + C_home)
 *   lh = exp(lgI[homeLeague] + att[h] - def[a] + hadv + e)
 *   la = exp(lgI[homeLeague] + att[a] - def[h] - e)
 *
 * The home side's league carries the intercept for both, which is what
 * build.js does when it sets li = hl for a cross-tier fixture.
 *
 * FITTED BY POISSON QUASI-LIKELIHOOD. The model's dispersion k is a variance
 * parameter: it widens the interval and does not move the location, so the
 * Poisson score equations give consistent estimates of the mean parameters
 * without it. It is neither used nor re-estimated here.
 *
 * dl/de = (hg - lh) - (ag - la),  de/dC_home = -1,  de/dC_away = +1
 */

/* How much weaker than the anchor this country is, in log goal-rate - the
   number countryHandicap computes today, and the centre of the prior. */
function priorFor(country, coefficients, opts) {
  const o = opts || {};
  const c = coefficients[String(country || "")];
  if (c === undefined || !(c > 0)) return null;
  const raw = o.scale * (Math.log(o.anchor) - Math.log(c));
  return Math.min(o.cap, Math.max(0, raw));
}

function prepare(matches, modelOf, rungOf) {
  const out = [];
  for (const m of (matches || [])) {
    const model = modelOf(m.season);
    if (!model) continue;
    const i = model.index;
    const h = i.tIdx[m.home], a = i.tIdx[m.away], l = i.lIdx[m.homeLeague];
    if (h === undefined || a === undefined || l === undefined) continue;
    const rh = rungOf(m.homeLeague), ra = rungOf(m.awayLeague);
    if (rh === null || ra === null) continue;
    out.push({
      baseH: model.lgI[l] + model.att[h] - model.def[a] + model.hadv,
      baseA: model.lgI[l] + model.att[a] - model.def[h],
      rung: ra - rh,
      hc: m.homeCountry, ac: m.awayCountry,
      hg: m.hg, ag: m.ag,
      cross: m.homeCountry !== m.awayCountry,
    });
  }
  return out;
}

/* Mean per-match Fisher information, evaluated at the prior. Expressing the
   penalty in these units is what makes K read as "this prior is worth K
   matches", so the result behaves as (n*MLE + K*prior)/(n + K). */
function meanInfo(rows, C) {
  if (!rows.length) return 1;
  let s = 0;
  for (const r of rows) {
    const e = (r.rung + (C[r.ac] || 0)) - (C[r.hc] || 0);
    s += Math.exp(r.baseH + e) + Math.exp(r.baseA - e);
  }
  return s / rows.length;
}

function fitOffsets(opts) {
  const priors = opts.priors || {};
  const K = opts.K == null ? 40 : opts.K;
  const cap = opts.cap == null ? 0.70 : opts.cap;
  const anchorCountry = opts.anchorCountry || "England";
  const iters = opts.iters || 600;
  const rows = prepare(opts.matches, opts.modelOf, opts.rungOf);

  const countries = Object.keys(priors);
  const C = {};
  for (const c of countries) C[c] = priors[c];

  const seen = {};
  for (const r of rows) if (r.cross) {
    seen[r.hc] = (seen[r.hc] || 0) + 1;
    seen[r.ac] = (seen[r.ac] || 0) + 1;
  }

  const pen = K * meanInfo(rows, C);
  const lr = 0.02, b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const mom = {}, vel = {};
  for (const c of countries) { mom[c] = 0; vel[c] = 0; }

  for (let it = 1; it <= iters; it++) {
    const g = {};
    for (const c of countries) g[c] = 0;
    for (const r of rows) {
      const e = (r.rung + (C[r.ac] || 0)) - (C[r.hc] || 0);
      const lh = Math.exp(r.baseH + e), la = Math.exp(r.baseA - e);
      const d = (r.hg - lh) - (r.ag - la);
      if (r.hc in g) g[r.hc] -= d;
      if (r.ac in g) g[r.ac] += d;
    }
    for (const c of countries) {
      if (c === anchorCountry) continue;
      g[c] -= pen * (C[c] - priors[c]);
      mom[c] = b1 * mom[c] + (1 - b1) * g[c];
      vel[c] = b2 * vel[c] + (1 - b2) * g[c] * g[c];
      const step = lr * (mom[c] / (1 - Math.pow(b1, it))) /
                   (Math.sqrt(vel[c] / (1 - Math.pow(b2, it))) + eps);
      C[c] = Math.min(cap, Math.max(0, C[c] + step));
    }
    C[anchorCountry] = 0;
  }

  const out = {};
  for (const c of countries) {
    const raw = c === anchorCountry ? 0 : C[c];
    const n = seen[c] || 0;
    /* No evidence means the penalty was the whole objective, so the answer is
       the prior - said exactly rather than left to converge to it. */
    const v = n === 0 ? priors[c] : raw;
    out[c] = {
      offset: Math.round(v * 1e4) / 1e4,
      prior: Math.round(priors[c] * 1e4) / 1e4,
      matches: n,
      clamped: n > 0 && (v >= cap - 1e-9 || (v <= 1e-9 && priors[c] > 1e-9)),
    };
  }
  return out;
}

/* Poisson deviance, the held-out score. y*log(y/lambda) is 0 at y = 0. */
function deviance(rows, C) {
  let d = 0;
  for (const r of rows) {
    const e = (r.rung + (C[r.ac] || 0)) - (C[r.hc] || 0);
    const pairs = [[r.hg, Math.exp(r.baseH + e)], [r.ag, Math.exp(r.baseA - e)]];
    for (const p of pairs) {
      const y = p[0], lam = p[1];
      d += 2 * ((y > 0 ? y * Math.log(y / lam) : 0) - (y - lam));
    }
  }
  return d;
}

function chooseK(opts) {
  const folds = opts.folds || 5;
  const grid = opts.grid || [5, 10, 20, 40, 80, 160, 320];
  const all = (opts.matches || []).slice();
  const scored = [];
  for (const K of grid) {
    let total = 0;
    for (let f = 0; f < folds; f++) {
      const train = all.filter((_, i) => i % folds !== f);
      const test = all.filter((_, i) => i % folds === f);
      const fit = fitOffsets(Object.assign({}, opts, { matches: train, K }));
      const C = {};
      for (const c in fit) C[c] = fit[c].offset;
      total += deviance(prepare(test, opts.modelOf, opts.rungOf), C);
    }
    scored.push({ K: K, deviance: total });
  }
  const best = scored.slice().sort((a, b) => a.deviance - b.deviance)[0];
  return { K: best.K, deviance: best.deviance, grid: scored };
}

module.exports = { priorFor, fitOffsets, chooseK, deviance, prepare };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/eurofit.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add lib/eurofit.js test/eurofit.test.js
git commit -m "Fit a country offset from cross-border results, shrunk to the coefficient"
```

---

### Task 6: The offline harvest script

Nothing in this task runs on Vercel. It is the piece a person runs by hand.

**Files:**
- Create: `scripts/mkeurope.js`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: `data/europe/<season>-<comp>.txt.gz` (openfootball source, verbatim) and `data/country-offsets.json`.

- [ ] **Step 1: Write the script**

```js
"use strict";
/**
 * Harvest the European corpus and fit the country offsets. OFFLINE ONLY.
 *
 *   node scripts/mkeurope.js
 *
 * Run by hand, roughly once a season, alongside refreshing UEFA_COEFFICIENT.
 * The Vercel build never runs this and never reads the corpus - it reads only
 * data/country-offsets.json, which this writes.
 *
 * WHY THE RAW TEXT IS COMMITTED AND THE RESOLVED CORPUS IS NOT: keeping
 * openfootball's own files means a later improvement to the alias table
 * re-resolves the whole history without re-fetching, and any argument about a
 * fitted number can be traced back to the line it came from.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const https = require("https");

const M = require("../lib/model.js");
const B = require("../lib/build.js");
const OF = require("../lib/openfootball.js");
const R = require("../lib/euroresolve.js");
const F = require("../lib/eurofit.js");

const RAW = "https://raw.githubusercontent.com/openfootball/champions-league/master";
const API = "https://api.github.com/repos/openfootball/champions-league/commits/master";
const COMPS = ["cl", "clq", "el", "elq", "conf", "confq"];
const DIR = path.join(__dirname, "..", "data", "europe");
const OUT = path.join(__dirname, "..", "data", "country-offsets.json");

/* Seasons the floor can rate. A European match is only usable if we can
   reconstruct what its clubs were worth AT THE TIME - fitModel is weighted on
   a 200-day half-life, so today's ratings do not describe two seasons ago.
   The floor's main-league files cover 2425, 2526 and 2627; add older seasons
   here as they reach the floor. */
const SEASONS = ["2024-25", "2025-26"];

/* Roughly the middle of a season, as the reference date for that season's fit. */
function midpoint(season) {
  return new Date(Date.UTC(Number(season.slice(0, 4)) + 1, 0, 15));
}

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "user-agent": "skypredict-mkeurope" } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); return rej(new Error(url + " -> " + r.statusCode)); }
      let s = ""; r.setEncoding("utf8");
      r.on("data", (d) => s += d);
      r.on("end", () => res(s));
    }).on("error", rej);
  });
}

(async () => {
  fs.mkdirSync(DIR, { recursive: true });

  let sha = "unknown";
  try { sha = JSON.parse(await get(API)).sha.slice(0, 12); } catch (e) {}

  /* 1. Fetch and store the source text verbatim. */
  const parsed = [];
  let dropped = 0, lines = 0;
  for (const season of SEASONS) {
    for (const comp of COMPS) {
      let text;
      try { text = await get(`${RAW}/${season}/${comp}.txt`); }
      catch (e) { continue; }                    /* not every season has every comp */
      fs.writeFileSync(path.join(DIR, `${season}-${comp}.txt.gz`), zlib.gzipSync(text));
      const o = OF.parse(text);
      lines += o.rows.length + o.dropped.length;
      dropped += o.dropped.length;
      for (const r of o.rows) parsed.push(Object.assign({ season }, r));
      console.log(`${season}/${comp}: ${o.rows.length} matches, ${o.dropped.length} dropped`);
    }
  }
  if (!parsed.length) throw new Error("no matches parsed - refusing to write an empty corpus");
  /* A parser that has quietly stopped understanding the format shows up here
     as a drop rate, not as an error. Fail loudly rather than fit on a thinned
     corpus. */
  if (dropped / Math.max(1, lines) > 0.02)
    throw new Error(`dropped ${dropped} of ${lines} lines - the format has probably changed`);

  /* 2. Era-correct ratings: one fit per season, from the committed floor. */
  const floor = B.loadFloorMatches();
  if (floor.length < 400) throw new Error("the committed floor is too thin to fit on");
  const index = M.buildIndex(floor);
  const models = {};
  for (const season of SEASONS) {
    const ref = midpoint(season);
    const upto = floor.filter((m) => m.date <= ref);
    models[season] = M.fitModel(upto, { index, reference: ref });
    console.log(`fitted ${season} on ${upto.length} matches to ${ref.toISOString().slice(0, 10)}`);
  }

  /* 3. Resolve, per season. */
  const bySeason = {};
  for (const r of parsed) (bySeason[r.season] = bySeason[r.season] || []).push(r);
  const matches = [], byCountry = {};
  let unresolved = 0;
  for (const season of SEASONS) {
    const out = R.resolve(bySeason[season] || [], index);
    for (const g of out.matches) matches.push(Object.assign({ season }, g));
    for (const c in out.byCountry) byCountry[c] = (byCountry[c] || 0) + out.byCountry[c];
    unresolved += out.dropped.length;
  }
  console.log(`resolved ${matches.length} matches; ${unresolved} rows dropped`);

  /* 4. Priors, then K, then the fit. */
  const priors = {};
  for (const country in B.UEFA_COEFFICIENT) {
    const p = F.priorFor(country, B.UEFA_COEFFICIENT,
      { anchor: B.UEFA_COEFFICIENT.England, scale: 0.50, cap: B.COUNTRY_CAP });
    if (p !== null) priors[country] = p;
  }
  const shared = { matches, modelOf: (s) => models[s], rungOf: B.rungOf,
                   priors, cap: B.COUNTRY_CAP };
  const picked = F.chooseK(shared);
  console.log("K chosen by five-fold held-out deviance:", picked.K);
  const offsets = F.fitOffsets(Object.assign({}, shared, { K: picked.K }));

  /* 5. Write. */
  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    source: "openfootball/champions-league @ " + sha,
    seasons: SEASONS,
    shrinkageK: picked.K,
    anchor: "England",
    countries: offsets,
  }, null, 2) + "\n");

  for (const c of Object.keys(offsets).sort())
    console.log(`  ${c.padEnd(14)} ${offsets[c].offset.toFixed(3)}` +
                `  (prior ${offsets[c].prior.toFixed(3)}, n=${offsets[c].matches})`);
  console.log("\nwrote", OUT);
})().catch((e) => { console.error(e.message); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run: `node scripts/mkeurope.js`
Expected: per-competition counts, two season fits, roughly 305 resolved matches, a chosen `K`, and a table of offsets. Russia must print `n=0` with `offset` equal to `prior`.

- [ ] **Step 3: Commit the script only**

The artefacts it produced are committed in Task 8, once the build can read them.

```bash
git add scripts/mkeurope.js
git commit -m "Harvest the European corpus and fit the offsets, offline and by hand"
```

---

### Task 7: What the build does

**Files:**
- Create: `lib/euroffsets.js`
- Modify: `lib/build.js` - `countryHandicap` at line 763, plus a require and a log line
- Modify: `scripts/prebuild.js:172` - the log whitelist
- Test: `test/countryoffsets.test.js`

**Interfaces:**
- Consumes: `data/country-offsets.json`.
- Produces: `offsetFor(country) -> number|undefined`, `meta() -> { generated, seasons, fitted }|null`, and `_loadFrom(pathOrNull)` so tests can point the loader at a fixture.

- [ ] **Step 1: Write the failing test**

```js
"use strict";
/* THE FALLBACK IS THE FEATURE.
 *
 * This file must never be the reason the site fails to build. A missing,
 * empty or broken data/country-offsets.json has to produce EXACTLY the numbers
 * the site produces today - which is why these assertions compare against a
 * recomputed coefficient value rather than a constant typed in here. A test
 * that hardcodes 0.106 keeps passing when countryHandicap stops being called
 * at all; this codebase has shipped that bug before. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const B = require("../lib/build.js");
const E = require("../lib/euroffsets.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "offsets-"));
const write = (name, body) => {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, body);
  return p;
};
const artefact = (countries) => JSON.stringify({
  generated: "2026-09-07", seasons: ["2025-26"], shrinkageK: 40,
  anchor: "England", countries,
});

/* What the coefficient arithmetic alone would say - the behaviour we must
   degrade to. */
const fromCoefficient = (country) => {
  const c = B.UEFA_COEFFICIENT[country];
  return Math.min(B.COUNTRY_CAP, Math.max(0,
    0.5 * (Math.log(B.UEFA_COEFFICIENT.England) - Math.log(c))));
};

test("a fitted offset is what countryHandicap returns", () => {
  E._loadFrom(write("good.json", artefact({
    Spain: { offset: 0.2222, prior: 0.1062, matches: 38, clamped: false },
  })));
  assert.equal(B.countryHandicap("Spain"), 0.2222,
    "countryHandicap must actually consult the artefact, not merely load it");
});

test("a fitted offset changes tierEdge for a cross-border pair", () => {
  /* The caller is what matters. An offset nothing reads is not a feature. */
  E._loadFrom(write("wide.json", artefact({
    Spain: { offset: 0.60, prior: 0.1062, matches: 38, clamped: false },
  })));
  const wide = B.tierEdge("England Premier League", "Spain La Liga 1");
  E._loadFrom(write("narrow.json", artefact({
    Spain: { offset: 0.10, prior: 0.1062, matches: 38, clamped: false },
  })));
  const narrow = B.tierEdge("England Premier League", "Spain La Liga 1");
  assert.notEqual(wide, narrow, "the offset has to reach tierEdge, not stop at countryHandicap");
  assert.ok(wide > narrow);
});

test("a country absent from the artefact keeps the imported number", () => {
  E._loadFrom(write("partial.json", artefact({
    Spain: { offset: 0.2222, prior: 0.1062, matches: 38, clamped: false },
  })));
  assert.ok(Math.abs(B.countryHandicap("Norway") - fromCoefficient("Norway")) < 1e-9);
});

test("Russia, which can never be fitted, is unchanged", () => {
  E._loadFrom(null);
  assert.ok(Math.abs(B.countryHandicap("Russia") - fromCoefficient("Russia")) < 1e-9);
  assert.equal(B.countryHandicap("Russia"), B.COUNTRY_CAP, "0.886 raw, clamped to the cap");
});

test("a missing, empty or broken file degrades to today's behaviour and never throws", () => {
  const cases = [
    null,
    write("empty.json", ""),
    write("broken.json", "{ this is not json"),
    write("wrongshape.json", JSON.stringify({ countries: "nonsense" })),
    path.join(tmp, "does-not-exist.json"),
  ];
  for (const p of cases) {
    assert.doesNotThrow(() => E._loadFrom(p));
    assert.ok(Math.abs(B.countryHandicap("Spain") - fromCoefficient("Spain")) < 1e-9,
      "a bad artefact must leave the site exactly as it is today");
  }
});

test("a country with no coefficient is still refused, never treated as equal", () => {
  E._loadFrom(null);
  assert.equal(B.countryHandicap("Brazil"), null);
  assert.equal(B.countryHandicap(""), null);
});

test("the artefact cannot introduce a country we hold no coefficient for", () => {
  E._loadFrom(write("intruder.json", artefact({
    Narnia: { offset: 0.20, prior: 0.20, matches: 9, clamped: false },
  })));
  assert.equal(B.countryHandicap("Narnia"), null,
    "non-UEFA countries keep being refused; the artefact is not a back door");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/countryoffsets.test.js`
Expected: FAIL - `Cannot find module '../lib/euroffsets.js'`

- [ ] **Step 3: Write `lib/euroffsets.js`**

```js
"use strict";
/**
 * The fitted country offsets, as the build sees them.
 *
 * Read once, at module load, from a small committed JSON. No fit, no fetch, no
 * corpus - the build's whole cost for this feature is one readFileSync.
 *
 * EVERY FAILURE PATH LANDS ON TODAY'S BEHAVIOUR. A missing file is the normal
 * state before the first harvest; a broken one is a bad commit. Neither is
 * worth failing a deploy over, because the fallback - computing from the UEFA
 * coefficient - is exactly what the site did before this existed.
 */
const fs = require("fs");
const path = require("path");

const DEFAULT = path.join(__dirname, "..", "data", "country-offsets.json");

let data = null;

function valid(d) {
  return d && typeof d === "object" && d.countries &&
         typeof d.countries === "object" && !Array.isArray(d.countries);
}

function _loadFrom(file) {
  data = null;
  if (file === null) return null;
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!valid(d)) return null;
    const clean = {};
    for (const c in d.countries) {
      const v = d.countries[c] && d.countries[c].offset;
      if (typeof v === "number" && isFinite(v) && v >= 0) clean[c] = v;
    }
    data = { offsets: clean, generated: d.generated, seasons: d.seasons || [],
             shrinkageK: d.shrinkageK };
    return data;
  } catch (e) {
    return null;
  }
}

function offsetFor(country) {
  return data ? data.offsets[String(country || "")] : undefined;
}

function meta() {
  if (!data) return null;
  return { generated: data.generated, seasons: data.seasons,
           fitted: Object.keys(data.offsets).length };
}

_loadFrom(DEFAULT);

module.exports = { offsetFor, meta, _loadFrom };
```

- [ ] **Step 4: Change `countryHandicap` in `lib/build.js`**

Add near the other requires at the top of `lib/build.js`:

```js
const EUROFF = require("./euroffsets.js");
```

Replace the function at line 763, extending the comment that is already above it:

```js
/* How much weaker than England's top flight this country's is, in log
   goal-rate. Null for a country with no coefficient, which means "refuse",
   never "treat as equal".
 *
 * MEASURED WHERE WE HAVE EVIDENCE, IMPORTED WHERE WE DO NOT. A fitted offset
 * from data/country-offsets.json wins when there is one; everything else falls
 * through to the coefficient arithmetic, which is what this did on its own
 * until Sep 2026. The coefficient check comes FIRST so the artefact can never
 * introduce a country we hold no coefficient for - a non-UEFA country stays
 * refused whatever the file says.
 *
 * See docs/specs/2026-09-06-european-results-source-design.md. */
function countryHandicap(country) {
  const c = UEFA_COEFFICIENT[String(country || "")];
  if (c === undefined || !(c > 0)) return null;
  const fitted = EUROFF.offsetFor(country);
  if (typeof fitted === "number" && isFinite(fitted))
    return Math.min(COUNTRY_CAP, Math.max(0, fitted));
  const raw = COUNTRY_SCALE * (Math.log(COUNTRY_ANCHOR) - Math.log(c));
  return Math.min(COUNTRY_CAP, Math.max(0, raw));
}
```

Where the build assembles its log, alongside the "committed floor" line around line 1549, add:

```js
  const off = EUROFF.meta();
  log.push(off
    ? `country offsets: ${off.fitted} fitted from ${off.seasons.join(", ")} ` +
      `(generated ${off.generated}); the rest imported from the coefficient`
    : "country offsets: none committed - all imported from the UEFA coefficient");
```

- [ ] **Step 5: Whitelist the log line in `scripts/prebuild.js:172`**

The build log filters what it prints, and a diagnostic that does not match this regex is invisible for the whole deploy - which has already cost this repo a deploy's worth of debugging. Add `country offsets` to the alternation:

```js
    .filter((l) => /held back|unavailable|failed|oracle|soccervista|suspended|committed floor|country offsets|record:|recorded result|score source|FT score map|backfill|of \d+ confirmed|^\S+ \d{4}-\d{2}-\d{2}:|^downloaded \d+\/\d+|^skip \S+\.csv/i.test(l))
```

- [ ] **Step 6: Run the tests**

Run: `node --test test/countryoffsets.test.js`
Expected: PASS, 7 tests

Run: `npm test`
Expected: PASS. `test/crosscountry.test.js` must still pass untouched - the goals-only rule has not moved.

- [ ] **Step 7: Commit**

```bash
git add lib/euroffsets.js lib/build.js scripts/prebuild.js test/countryoffsets.test.js
git commit -m "Read the fitted country offsets, and fall back to the coefficient"
```

---

### Task 8: Run the harvest, commit the artefacts, prove nothing else moved

**Files:**
- Create: `data/europe/*.txt.gz`, `data/country-offsets.json` (generated)

- [ ] **Step 1: Capture what the board says now**

Before the artefact exists, record the current handicaps so the change is provable rather than asserted:

```bash
node -e '
const B=require("./lib/build.js");
const out={};
for(const c in B.UEFA_COEFFICIENT) out[c]=B.countryHandicap(c);
require("fs").writeFileSync("handicaps-before.json",JSON.stringify(out,null,1));
console.log(out);'
```

- [ ] **Step 2: Run the harvest**

Run: `node scripts/mkeurope.js`
Expected: `data/country-offsets.json` written, roughly 305 resolved matches across 2024-25 and 2025-26.

- [ ] **Step 3: Read the diff before trusting it**

```bash
cat data/country-offsets.json
```

Check by eye, and stop if any of these is false:
- `Russia` has `matches: 0` and `offset` exactly equal to `prior`.
- `Finland` has a single-figure `matches` and an `offset` close to its `prior`.
- `England` has `offset: 0`.
- No country moved more than about 0.3 from its prior - a jump wider than one English division is a reason to look again, not to ship.
- Every `offset` is between 0 and 0.70.

- [ ] **Step 4: Confirm the zero-evidence countries did not move**

```bash
node -e '
const before=require("./handicaps-before.json");
const B=require("./lib/build.js");
const off=require("./data/country-offsets.json").countries;
let bad=0;
for(const c in before){
  const now=B.countryHandicap(c), was=before[c];
  const n=(off[c]&&off[c].matches)||0;
  if(n===0 && Math.abs(now-was)>1e-9){ console.log("MOVED WITH NO EVIDENCE:",c,was,"->",now); bad++; }
  else console.log((n?"fitted ":"kept   ")+c.padEnd(14)+was.toFixed(4)+" -> "+now.toFixed(4)+"  n="+n);
}
process.exit(bad?1:0);'
```
Expected: exit 0, and `Russia kept` with an unchanged number.

- [ ] **Step 5: Full suite**

Run: `npm test`
Expected: PASS, all of it.

- [ ] **Step 6: Commit the artefacts**

```bash
rm handicaps-before.json
git add data/europe data/country-offsets.json
git commit -m "Commit the European corpus and the offsets fitted from it"
```

- [ ] **Step 7: Stop here and hand back**

Do **not** merge to `main` or push. `main` deploys to production, and the board's European ties re-price the moment this lands. That is the intended effect, but it is the user's call when it happens, and it should be watched rather than fired off at the end of a task list.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. Corpus committed, build never reads it | 6, 8 |
| 2. Score extraction (a.e.t. / penalties) | 1 |
| 3. Name resolution reuses `matchTeam`; the aliases | 2, 3 |
| 4. Era-correct ratings, per season | 4, 6 |
| 5. The offset fit, prior, shrinkage, `K` by cross-validation | 5 |
| 6. The artefact format | 5, 6 |
| 7. Build consumption + prebuild whitelist | 7 |
| Failure modes | 7 (tests), 6 (drop-rate guard) |
| Testing, all six items | 1, 2, 3, 5, 7, 8 |
| Refresh procedure | 6 |

**Deviations from the spec, and why:**

1. The spec says "about 52 aliases". This plan commits **36 verified pairs** plus five alternate spellings, because only 2024-25 and 2025-26 are in the first cut and only those misses were checked by hand against the real index. The rest are added when older seasons reach the floor. Committing an unverified alias is the one thing this design exists to avoid.
2. **Match dates are not parsed** (Task 1). The fit is per season and the season comes from the filename, so a date carry-forward across openfootball's bare `Wed Sep 17` lines would be risk with no buyer. YAGNI.
3. `FC Corvinul Hunedoara` gets **no alias** - it is not in our index and must stay a clean drop. Task 2 asserts that.
4. `fitOffsets` returns the prior *exactly* for a zero-evidence country rather than relying on the optimiser to converge there. The spec asserts the behaviour; this makes it true by construction, so the Russia test cannot pass by luck.

**Open item requiring a human:** the `CS Universitatea Craiova` alias. Romania carries `U Craiova`, `Univ. Craiova` and `U Craiova 1948` in our index and they are not the same club. Task 2 flags it in a comment; if it cannot be settled, delete the line and let those ties drop.
