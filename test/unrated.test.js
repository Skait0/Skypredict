"use strict";

/**
 * Competitions we hold no ratings for must not be priced.
 *
 * Reported: "you picked a[n] Amateur match for me. VFB Stuttgart vs SC
 * Freiburg lol". The fixture was Germany Amateur DFB-Pokal Junioren - a youth
 * cup tie - and it went onto a slip looking exactly like a Bundesliga game.
 *
 * The mechanism is worth stating, because it is not "a low-quality league
 * slipped through the net". The fixture's own competition is not one we hold
 * results for, so league resolution fell through to matching on team name
 * alone, found "Stuttgart" and "Freiburg" in Bundesliga 1, and priced the
 * youth tie off the two senior first teams. The output was not a worse
 * prediction; it was a confident answer to a different question. The same
 * applies to the women's fixtures in the feed, whose clubs also share a name
 * with the men's sides - the objection there is that we would be quoting the
 * men's record, not anything about the competition.
 *
 * So the rule under test is: if we have no ratings for the competition, we
 * publish nothing for it, rather than borrowing a rating that fits the name.
 */

const test = require("node:test");
const assert = require("node:assert");

const { isUnratedCompetition } = require("../lib/build.js");

test("a competition name ending in a bare W is women's football (9 Oct 2026)", () => {
  assert.strictEqual(isUnratedCompetition("International Int. Friendly Games W"), true);
  assert.strictEqual(isUnratedCompetition("International Int. Friendly Games W", { has: () => true }), true);
  assert.strictEqual(isUnratedCompetition("Germany Bundesliga", { has: () => true }), false);
});

test("the reported fixture's competition is refused", () => {
  assert.strictEqual(isUnratedCompetition("Germany Amateur DFB-Pokal Junioren"), true);
});

test("every unrated competition in the published feed is caught", () => {
  /* The five that were actually in the payload when this was reported. */
  const seen = [
    "Germany Amateur DFB-Pokal Junioren",
    "Germany Amateur Women Bundesliga",
    "Portugal U19 Campeonato Nacional",
    "Turkiye Amateur U19 PAF Ligi",
    "Mexico U21 Liga MX",
  ];
  for (const l of seen) {
    assert.strictEqual(isUnratedCompetition(l), true, l + " should be refused");
  }
});

test("the shapes these names come in", () => {
  for (const l of [
    "Spain U19 Division de Honor", "Italy Primavera 1", "Netherlands Jong Eredivisie",
    "England Premier League U21", "Germany A-Junioren Bundesliga",
    "France Feminine Division 1", "Spain Primera Femenina", "Germany Frauen Bundesliga",
    "England Women Super League", "Portugal Youth Cup", "Croatia Reserve League",
    "Belgium Academy Cup", "Austria Amateure Liga",
  ]) {
    assert.strictEqual(isUnratedCompetition(l), true, l + " should be refused");
  }
});

/* The other half of the job, and the easier one to get wrong: a filter this
   blunt must not quietly eat the real card. */
test("the senior leagues we do rate are untouched", () => {
  for (const l of [
    "England Premier League", "Germany Bundesliga 1", "Germany Bundesliga 2",
    "Spain La Liga 1", "Italy Serie A", "France Ligue 1", "Netherlands Eredivisie",
    "England Championship", "Scotland Premiership", "Portugal Liga 1",
    "Belgium Pro League", "Turkiye Super Lig", "Mexico Liga MX", "Brazil Serie A",
    "Norway Eliteserien", "Sweden Allsvenskan", "Japan J1 League", "USA MLS",
    "England EFL Cup", "Germany DFB-Pokal", "Spain Copa del Rey",
  ]) {
    assert.strictEqual(isUnratedCompetition(l), false, l + " must NOT be refused");
  }
});

test("a league is not refused for merely containing the letters", () => {
  /* "Junior" inside "Juniors FC" is a club, not a competition marker; the word
     boundaries are what keep this from being a substring match. */
  assert.strictEqual(isUnratedCompetition("Uruguay Primera Division"), false,
    "Primera is not Primavera");
  assert.strictEqual(isUnratedCompetition("Argentina Primera Nacional"), false);
  assert.strictEqual(isUnratedCompetition("Denmark Superliga"), false);
});

test("nothing and nonsense are safe to ask about", () => {
  assert.strictEqual(isUnratedCompetition(""), false);
  assert.strictEqual(isUnratedCompetition(null), false);
  assert.strictEqual(isUnratedCompetition(undefined), false);
});

/* The end-to-end guard: whatever is on disk must be clean. Runs against the
   real payload so a regression is caught on the actual card. */
test("no unrated competition survives into the built payload", (t) => {
  let payload;
  try { payload = require("../public/predictions.json"); } catch (e) { return; }
  /* public/predictions.json is a git-ignored build file. Two days old it was
     baked under older rules, and failing on it hid a real women's-game leak
     on 9 Oct 2026 as "the known failure" - so it is skipped, saying so. */
  const age = Date.now() - Date.parse(payload.generatedAt || 0);
  if (!(age < 2 * 864e5)) return t.skip("public/predictions.json is " + Math.round(age / 864e5) + " days old - rebuild it to check this");
  /* Asked against the index the build fits, as the build asks it: a listed
     senior league is released once it holds ratings (Norway 1st Division and
     Denmark 1. Division, backfilled 23 Sep 2026). Asked without one, this
     called 34 correctly published fixtures unrated. */
  const B = require("../lib/build.js"), M = require("../lib/model.js");
  const idx = M.buildIndex(B.loadFloorMatches());
  const bad = [];
  for (const f of (payload.fixtures || []).concat(payload.results || [])) {
    if (f && isUnratedCompetition(f.league, idx)) {
      bad.push(f.league + ": " + f.home + " v " + f.away);
    }
  }
  assert.deepStrictEqual(bad, [], bad.length + " unrated fixture(s) published");
});

test("women's leagues with no 'women' in the name, and Wales's second tier, are refused", () => {
  /* Both were live on 25 Sep 2026, priced off senior men's clubs that share
     the names: Brommapojkarna v Malmo FF, and a Swansea read as Swansea City. */
  for (const l of ["Sweden Damallsvenskan", "Sweden Amateur Elitettan", "Denmark Kvindeliga",
                   "Norway Toppserien", "Spain Liga F", "USA NWSL",
                   "Wales Cymru Championship South", "Wales Cymru Championship North"]) {
    assert.strictEqual(isUnratedCompetition(l), true, l);
  }
  assert.strictEqual(isUnratedCompetition("Sweden Allsvenskan"), false, "the men's top flight is untouched");
  assert.strictEqual(isUnratedCompetition("Wales Cymru Premier"), false);
});

test("women's cups and leagues named in other languages are refused, the men's are not", () => {
  /* "Spain Copa de SM La Reina" - the Queen's Cup, Spain's women's cup - was on
     the board on 30 Sep 2026 (CE Europa v Villarreal, priced off the men's
     Villarreal) after the owner had ruled women's football out that day. */
  for (const l of ["Spain Copa de SM La Reina", "Spain Liga F", "Spain Primera Femenina",
                   "Italy Serie A Femminile", "Netherlands Eredivisie Vrouwen",
                   "Norway Toppserien Kvinner", "Poland Ekstraliga Kobiet",
                   "England WSL", "England Women's Super League", "Scotland SWPL Ladies Cup",
                   "France Division 1 Feminine", "Germany Frauen Bundesliga",
                   "Sweden Damallsvenskan", "USA National Womens Soccer League"]) {
    assert.strictEqual(isUnratedCompetition(l), true, l + " should be refused");
  }
  for (const l of ["Spain Copa del Rey", "Spain La Liga 1", "Spain Segunda Division",
                   "Italy Serie A", "Italy Coppa Italia", "Netherlands Eredivisie",
                   "Norway Eliteserien", "Poland Ekstraklasa", "England Premier League",
                   "England FA Cup", "Germany DFB-Pokal", "France Coupe de France",
                   "Spain Supercopa de Espana"]) {
    assert.strictEqual(isUnratedCompetition(l), false, l + " must NOT be refused");
  }
});

test("women's competitions in Portuguese, Icelandic, Turkish, Finnish, Japanese and Belgian naming are refused", () => {
  for (const l of ["Brazil Brasileiro Feminino", "Portugal Liga BPI Feminino", "Mexico Liga MX Femenil",
                   "Iceland Besta deild kvenna", "Belgium Super League Dames", "Finland Kansallinen Liiga",
                   "Japan WE League", "Japan Nadeshiko League", "Turkey Kadinlar Ligi", "Turkiye Kad\u0131nlar Ligi"]) {
    assert.strictEqual(isUnratedCompetition(l), true, l + " should be refused");
  }
  for (const l of ["Iceland Besta deild", "Iceland Besta deild karla", "Brazil Serie A", "Portugal Liga Portugal",
                   "Mexico Liga MX", "Belgium Pro League", "Finland Veikkausliiga", "Japan J1 League",
                   "Turkiye Super Lig", "Fram v KR Reykjavik", "Stjarnan", "KA Akureyri", "Breidablik",
                   "Valur", "Vikingur Reykjavik", "IA Akranes", "Vestri", "Afturelding", "IBV Vestmannaeyjar"]) {
    assert.strictEqual(isUnratedCompetition(l), false, l + " must NOT be refused");
  }
});

test("a women's side under a neutral competition name is refused, and no team we hold is", () => {
  const { isWomensSide } = require("../lib/build.js");
  for (const n of ["Arsenal W", "Chelsea Women", "Corinthians Feminino", "America Femenil", "Glasgow City Ladies"]) {
    assert.strictEqual(isWomensSide(n), true, n);
  }
  /* Both directions, against the real names: every team on the board and in
     the results CSVs we fit on. A dead pattern and a greedy one both fail. */
  const fs = require("fs"), path = require("path"), zlib = require("zlib");
  const names = new Set(["Wigan", "Kawasaki Frontale", "Lens", "Inter Turku", "Fram", "KR Reykjavik"]);
  try { const p = require("../public/predictions.json");
        for (const f of (p.fixtures || []).concat(p.results || [])) { names.add(f.home); names.add(f.away); } } catch (e) {}
  const dir = path.join(__dirname, "..", "data", "results");
  for (const f of (fs.existsSync(dir) ? fs.readdirSync(dir) : [])) {
    if (!/\.csv(\.gz)?$/.test(f)) continue;
    let b = fs.readFileSync(path.join(dir, f)); if (f.endsWith(".gz")) b = zlib.gunzipSync(b);
    const L = b.toString("utf8").split(/\r?\n/), h = L[0].replace(/^\uFEFF/, "").split(",");
    const col = (ks) => ks.map((k) => h.indexOf(k)).filter((i) => i >= 0)[0];
    const hi = col(["HomeTeam", "Home", "home_team"]), ai = col(["AwayTeam", "Away", "away_team"]);
    if (hi == null) continue;
    for (const l of L.slice(1)) { const c = l.split(","); if (c[hi]) names.add(c[hi]); if (c[ai]) names.add(c[ai]); }
  }
  const hit = [...names].filter(isWomensSide);
  assert.deepStrictEqual(hit, [], "men's sides refused as women's");
  assert.ok(names.size > 500, "read only " + names.size + " team names - the scan is broken");
});
