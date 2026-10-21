"use strict";

/**
 * Pick for me (owner, 20 Oct 2026): "Build me a slip" asks how - Pick for me, Slider or
 * Wizard. Pick for me takes no options: the surest market this bookie sells in every game
 * still to come in the window, surest first with a per-reader shuffle among near-equals,
 * until the payout, at most 40 games ("40 is fine"). x2, x5 and x10 for everyone, x20 and up
 * with a pass. Held out over 60 days on our model alone: 82.7% of these legs landed against
 * 79.3% for the default chips.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
function grab(name) {
  const i = src.indexOf("\nfunction " + name + "(");
  assert.ok(i > 0, "not found in index.html: " + name);
  let d = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}") { d--; if (!d) break; } }
  return src.slice(i, k + 1);
}

/* The engine with what it reads: games with a probability per market and a price per market. */
function engine(games, opts = {}) {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const env = {
    DATA: { fixtures: games }, PFM_MAX: 40,
    curBook: () => ({ key: "sporty" }), slipMax: () => opts.slipMax || 50,
    refusedToday: () => ({}), allowedMarkets: () => opts.markets || ["1X", "X2", "OVER_1.5", "HOME_OVER_0.5", "AH_1_2", "GG2_Y"],
    bookAllows: () => true, cornersOpen: () => true, bookQuotes: () => true, BOOKS: { sporty: {} }, dcOk: () => true,
    HCAP_CODES: ["AH_1_2"], CORNER_CODES: [], TEAM_CORNER_CODES: [], SHOTS_CODES: [], TEAM_SHOTS_CODES: [], bookVerdict: (f, c) => (f.v && f.v[c]) || "priced", pricedFixture: () => true, safeUnpriced: () => true,
    notStarted: (f) => Date.parse(f.kickoff) > now, dayOff: (d) => d, fDay: (f) => f.day,
    fid: (f) => f.id, mProb: (f, c) => f.p[c], judgedP: (f, c, p) => p, legOdd: (f, c) => f.o[c],
  };
  return new Function(...Object.keys(env), grab("pickForMe") + "\nreturn pickForMe;")(...Object.values(env));
}
const game = (i, o) => Object.assign({ id: "g" + i, day: 0, kickoff: "2026-10-20T18:00:00Z",
  p: { "1X": 0.8 - i * 0.001, "X2": 0.4, "OVER_1.5": 0.7, "HOME_OVER_0.5": 0.75 },
  o: { "1X": 1.2, "X2": 2.2, "OVER_1.5": 1.3, "HOME_OVER_0.5": 1.25 } }, o);

test("each game gives its surest market, and the slip stops at the payout", () => {
  const pick = engine(Array.from({ length: 30 }, (_, i) => game(i)));
  const r = pick(5, "0", null, "s");
  assert.ok(r.odds >= 5 && !r.short);
  assert.strictEqual(r.picks[0].code, "1X", "the surest market leads");
  assert.ok(r.picks.length <= 9, "reaches x5 in about nine");
});

test("never more than 40 games, or the bookie's own limit", () => {
  const pick = engine(Array.from({ length: 80 }, (_, i) => game(i)));
  assert.ok(pick(1e9, "0", null, "s").picks.length <= 40);
  assert.ok(engine(Array.from({ length: 80 }, (_, i) => game(i)), { slipMax: 20 })(1e9, "0", null, "s").picks.length <= 20);
});

test("a big payout that the surest legs cannot reach in 40 asks every leg to pay payout^(1/40)", () => {
  /* x1000 in 40 needs 1.189 a leg: the 1.2 double chance still qualifies, the 1.15s do not. */
  const g = Array.from({ length: 60 }, (_, i) => game(i, { o: { "1X": i % 2 ? 1.15 : 1.2, "X2": 2.2, "OVER_1.5": 1.3, "HOME_OVER_0.5": 1.25 } }));
  const r = engine(g)(1000, "all", null, "s");
  assert.ok(r.picks.every((c) => c.o >= Math.pow(1000, 1 / 40)), "a leg under the floor got in");
});

test("only games still to come, only in the window asked for", () => {
  const g = [game(1, { kickoff: "2026-10-20T10:00:00Z" }), game(2, { day: 1 }), ...Array.from({ length: 10 }, (_, i) => game(10 + i))];
  const today = engine(g)(2, "0", null, "s").picks.map((c) => c.id);
  assert.ok(!today.includes("g1"), "a started game");
  assert.ok(!today.includes("g2"), "tomorrow's game on Today");
  assert.ok(engine(g)(1e6, "1", null, "s").picks.every((c) => c.id === "g2"));
});

test("a reader keeps their slip until they shuffle; two readers get different slips", () => {
  const g = Array.from({ length: 40 }, (_, i) => game(i, { p: { "1X": 0.8, "X2": 0.4, "OVER_1.5": 0.7, "HOME_OVER_0.5": 0.75 } }));
  const ids = (seed) => engine(g)(5, "0", null, seed).picks.map((c) => c.id).join(",");
  assert.strictEqual(ids("ada|2026-10-20|0"), ids("ada|2026-10-20|0"));
  assert.notStrictEqual(ids("ada|2026-10-20|0"), ids("ada|2026-10-20|1"), "Shuffle changed nothing");
  assert.notStrictEqual(ids("ada|2026-10-20|0"), ids("bola|2026-10-20|0"), "two readers got one slip");
});

test("the big button opens the chooser; x20 and up need a pass; it books as pickforme", () => {
  assert.match(src, /if\(b\.classList\.contains\("sc-go-primary"\)\) openBuildChooser\(goMode\); else goMode\(b\.dataset\.scmode\);/);
  assert.match(src, /var PFM_MAX=40, PFM_PAYS=\[2,5,10,20,50,100,150,200\], PFM_FREE=10;/);
  const run = grab("pfmRun");
  assert.match(run, /if\(T>PFM_FREE&&!pfmPass\(\)\)/);
  assert.match(run, /bookRounds\(r\.picks,B,K\.tag,K\.p\+"Out",/);
  assert.match(src, /PFM_K=\{p:"pfm",card:"bmPfm",st:PFM,eng:pickForMe,tag:"pickforme"/, "Pick for me still books as pickforme");
  assert.match(run, /CLIMB=reduced\?0:\(1\.4\+0\.6\*Math\.log10\(T\)\)\*1000/, "the bigger the payout, the longer the spell");
  /* The three ways, named in the site's words. */
  const open = grab("openBuildChooser");
  for (const w of ["Pick for me", "Slider", "Wizard", "Build me a slip", "18+"]) assert.ok(open.includes(w), w + " missing");
});

test("a market the price sweep never fetches still counts, as it does in the Slider", () => {
  /* Live on 20 Oct 2026 every market read "unknown" and Pick for me said "not enough games"
     for x2 on all upcoming. Only "no" (the bookie lists the game without the market) is out. */
  const g = Array.from({ length: 12 }, (_, i) => game(i, { v: { "1X": "unknown", "X2": "unknown", "OVER_1.5": "unknown", "HOME_OVER_0.5": "unknown" } }));
  assert.ok(engine(g)(2, "0", null, "s").picks.length >= 2, "unknown markets were thrown away");
  const no = Array.from({ length: 12 }, (_, i) => game(i, { v: { "1X": "no", "X2": "no", "OVER_1.5": "no", "HOME_OVER_0.5": "no" } }));
  assert.strictEqual(engine(no)(2, "0", null, "s").picks.length, 0, "a market the bookie does not sell got in");
});

test("markets people know: no handicaps or GG+, however sure the model is", () => {
  /* Live on 20 Oct 2026 the surest picks were all Asian handicaps. */
  const g = Array.from({ length: 12 }, (_, i) => game(i, { p: { "1X": 0.8, "X2": 0.4, "OVER_1.5": 0.7, "HOME_OVER_0.5": 0.75, "AH_1_2": 0.97, "GG2_Y": 0.99 },
    o: { "1X": 1.2, "X2": 2.2, "OVER_1.5": 1.3, "HOME_OVER_0.5": 1.25, "AH_1_2": 1.2, "GG2_Y": 5 } }));
  const r = engine(g)(5, "0", null, "s");
  assert.ok(r.picks.length && r.picks.every((c) => c.code !== "AH_1_2" && c.code !== "GG2_Y"));
});

test("the chooser sits under the code pop-up, the toasts and booking questions", () => {
  /* The first live code (K1JL6P, 20 Oct 2026) opened behind it. */
  const chooser = +/\.bm-scrim\{[^}]*z-index:(\d+)/.exec(src)[1];
  const code = +/\.code-modal-scrim\{[^}]*z-index:(\d+)/.exec(src)[1];
  assert.ok(chooser > 151 && chooser < 200 && chooser < code, "chooser " + chooser + ", code pop-up " + code);
});

test("no market family on more than 40% of the slip, on the site as in the bot", () => {
  /* Owner, 14 Oct 2026, on Daily odds: "all the games always seem to double chance". */
  const g = Array.from({ length: 30 }, (_, i) => game(i));
  const r = engine(g)(20, "0", null, "s");
  const dc = r.picks.filter((c) => c.code === "1X" || c.code === "X2").length;
  assert.ok(dc <= Math.max(2, Math.ceil(0.4 * r.picks.length)), dc + " double chances in " + r.picks.length);
});

/* MERLIN'S PICK (owner, 21 Oct 2026): its own card beside Pick for me. Not the surest leg in
   every game until the payout, but the slip MOST LIKELY TO LAND that still reaches it, searched
   over every mix of games. Measured on the 21 Oct board at x30: 2.25% against 1.56% for the
   default Wizard, same model, same prices. */
function special(games, opts = {}) {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const env = {
    DATA: { fixtures: games }, PFM_MAX: 40, WSX_MINP: 0.6, WSX_STEP: 0.005, VOL_IN: !!opts.volIn,
    curBook: () => ({ key: "sporty", odds: "sportyOdds" }), slipMax: () => opts.slipMax || 50,
    refusedToday: () => ({}), allowedMarkets: () => ["1X", "X2", "OVER_1.5", "OVER_2.5", "UNDER_3.5", "HOME_OVER_0.5", "MIXGG_1", "MIXGG_2", "AH_1_2"],
    bookAllows: () => true, cornersOpen: () => true, hasRealOdd: () => false, bookQuotes: (f, c) => !!(f.sportyOdds && f.sportyOdds[c] > 1.01), BOOKS: { sporty: {} }, dcOk: () => true,
    HCAP_CODES: ["AH_1_2"], CORNER_CODES: [], TEAM_CORNER_CODES: [], SHOTS_CODES: [], TEAM_SHOTS_CODES: [],
    bookVerdict: () => "priced", pricedFixture: () => true, safeUnpriced: () => true,
    isVolatile: (l) => /Volatile/.test(l || ""),
    notStarted: (f) => Date.parse(f.kickoff) > now, dayOff: (d) => d, fDay: (f) => f.day,
    fid: (f) => f.id, mProb: (f, c) => f.p[c], judgedP: (f, c, p) => p, legOdd: (f, c) => f.o[c], mLabel: (f, c) => "L " + c,
  };
  return new Function(...Object.keys(env), grab("backsUnderdog") + grab("wizardSpecial") + "\nreturn wizardSpecial;")(...Object.values(env));
}
const sg = (i, p, o, x) => Object.assign({ sportyOdds: o, id: "s" + i, day: 0, kickoff: "2026-10-20T18:00:00Z", league: "Spain La Liga",
  home_p: 0.5, away_p: 0.25, p, o }, x);
const chanceOf = (r) => r.picks.reduce((a, c) => a * c.p, 1);

test("Merlin's Pick: the likeliest slip that reaches the payout, not the surest leg in every game", () => {
  /* Twelve games each with a safe 1X (80% at 1.20) and three bigger picks (66% at 1.50) in other
     families. x5 from the surest legs takes nine (0.8^9 = 13.4%); four bigger ones make x5.06 at
     0.66^4 = 19%, two families at most two each, inside the 40% cap. */
  const big = { "OVER_1.5": 0.66, "HOME_OVER_0.5": 0.66, "UNDER_3.5": 0.66 }, bigO = { "OVER_1.5": 1.5, "HOME_OVER_0.5": 1.5, "UNDER_3.5": 1.5 };
  const g = Array.from({ length: 12 }, (_, i) => sg(i, Object.assign({ "1X": 0.8 }, big), Object.assign({ "1X": 1.2 }, bigO)));
  const r = special(g)(5, "0", null, "s");
  assert.ok(r.odds >= 5 && !r.short, "reaches the payout: x" + r.odds);
  assert.ok(chanceOf(r) > Math.pow(0.8, 9) * 1.3, "likelier than the surest-first slip: " + chanceOf(r).toFixed(3) + " v " + Math.pow(0.8, 9).toFixed(3));
  assert.ok(Math.abs(r.chance - chanceOf(r)) < 1e-9, "the chance it reports is the slip's own");
});

test("Merlin's Pick finds the true best mix (checked against every combination on a small board)", () => {
  const P = [[0.82, 1.18], [0.7, 1.45], [0.62, 1.7]];
  const g = Array.from({ length: 6 }, (_, i) => sg(i, { "1X": P[0][0] - i * 0.01, "OVER_1.5": P[1][0] + i * 0.005, "OVER_2.5": P[2][0] },
    { "1X": P[0][1], "OVER_1.5": P[1][1] + i * 0.02, "OVER_2.5": P[2][1] }));
  const r = special(g)(8, "0", null, "s");
  let best = 0;
  const codes = ["1X", "OVER_1.5", "OVER_2.5"];
  (function walk(i, p, o) {
    if (i === g.length) { if (o >= 8 && p > best) best = p; return; }
    walk(i + 1, p, o);
    for (const c of codes) walk(i + 1, p * g[i].p[c], o * g[i].o[c]);
  })(0, 1, 1);
  assert.ok(chanceOf(r) >= best * 0.97, "the search's x" + r.odds.toFixed(2) + " at " + chanceOf(r).toFixed(4) + " v the best " + best.toFixed(4));
});

test("Merlin's Pick's rules: 60%+, the favourite's side, no Under in a cup rout, volatile only with a yes", () => {
  const legs = (g, o) => special(g, o)(3, "0", null, "s").picks.map((c) => c.id + ":" + c.code);
  /* Filler from three families, so the 40% cap is not what decides. */
  const base = (i, x) => { const c = ["1X", "HOME_OVER_0.5", "UNDER_3.5"][i % 3]; return sg(i, { [c]: 0.8 }, { [c]: 1.2 }, x); };
  const filler = Array.from({ length: 10 }, (_, i) => base(100 + i));
  /* A 58% leg at a fat price never gets in. */
  assert.ok(!legs([sg(1, { "OVER_2.5": 0.58 }, { "OVER_2.5": 2.6 }), ...filler]).includes("s1:OVER_2.5"));
  /* The weaker team's "or both score" never, even at a price the search would love. */
  assert.ok(!legs([sg(2, { "MIXGG_2": 0.7 }, { "MIXGG_2": 1.9 }), ...filler]).includes("s2:MIXGG_2"));
  /* Under 3.5 in a cup tie with a 70% favourite: the rout shape, out. */
  const cup = sg(3, { "UNDER_3.5": 0.72 }, { "UNDER_3.5": 1.7 }, { league: "Cyprus Cup", home_p: 0.7, away_p: 0.1 });
  assert.ok(!legs([cup, ...filler]).includes("s3:UNDER_3.5"));
  /* A volatile league sits out until the reader has said yes to them. */
  const vol = sg(4, { "OVER_1.5": 0.75 }, { "OVER_1.5": 1.6 }, { league: "Volatile 3rd tier" });
  assert.ok(!legs([vol, ...filler]).includes("s4:OVER_1.5"));
  assert.ok(legs([vol, ...filler], { volIn: true }).includes("s4:OVER_1.5"));
});

test("Merlin's Pick keeps any one market family to 40% of the slip, says when it cannot reach, and shuffles", () => {
  const g = Array.from({ length: 20 }, (_, i) => sg(i, { "OVER_1.5": 0.7, "1X": 0.66 }, { "OVER_1.5": 1.5, "1X": 1.48 }));
  const r = special(g)(20, "0", null, "s");
  const over = r.picks.filter((c) => c.code === "OVER_1.5").length;
  assert.ok(over <= Math.max(2, Math.ceil(0.4 * r.picks.length)), over + " of " + r.picks.length + " are Over 1.5");
  assert.ok(r.odds >= 20);
  assert.ok(special(g.slice(0, 3))(1e6, "0", null, "s").short, "x1,000,000 from three games");
  const ids = (seed) => special(g)(5, "0", null, seed).picks.map((c) => c.id).join(",");
  assert.strictEqual(ids("a|0"), ids("a|0"), "one seed, one slip");
  assert.notStrictEqual(ids("a|0"), ids("a|1"), "Shuffle changed nothing");
});

test("Merlin's Pick on a board with one market family still builds, instead of nothing", () => {
  /* No prices anywhere leaves only the safe markets; the 40% cap cannot be met, and the best
     slip without it stands. */
  const g = Array.from({ length: 12 }, (_, i) => sg(i, { "1X": 0.8 }, { "1X": 1.2 }));
  const r = special(g)(3, "0", null, "s");
  assert.ok(!r.short && r.odds >= 3 && r.picks.length === 7, r.picks.length + " legs, x" + r.odds);
});

test("Merlin's Pick takes a leg only at a bookie's real price, never our own estimate", () => {
  /* Measured 21 Oct 2026: estimated prices carry no margin, look free, and the search stacked
     30+ of them. A game with no quote for the market is passed over. */
  const quoted = Array.from({ length: 10 }, (_, i) => sg(i, { "OVER_1.5": 0.72, "HOME_OVER_0.5": 0.72 }, { "OVER_1.5": 1.35, "HOME_OVER_0.5": 1.35 }));
  const est = sg(99, { "OVER_1.5": 0.9 }, { "OVER_1.5": 1.4 }, { sportyOdds: {} });
  const r = special([est, ...quoted])(5, "0", null, "s");
  assert.ok(!r.picks.some((c) => c.id === "s99"), "an unquoted leg got in");
  assert.ok(r.odds >= 5);
});

test("Merlin's Pick: All day, Next 60 min and All upcoming (owner, 21 Oct 2026)", () => {
  const soon = new Date(Date.now() + 30 * 60e3).toISOString(), later = new Date(Date.now() + 5 * 3600e3).toISOString();
  const g = Array.from({ length: 16 }, (_, i) => sg(i, { "OVER_1.5": 0.75, "HOME_OVER_0.5": 0.75, "UNDER_3.5": 0.75 },
    { "OVER_1.5": 1.3, "HOME_OVER_0.5": 1.3, "UNDER_3.5": 1.3 }, { kickoff: i < 8 ? soon : later, day: 0 }));
  const ids = (d) => special(g)(3, d, null, "s").picks.map((c) => +c.id.slice(1));
  assert.ok(ids("60").length && ids("60").every((i) => i < 8), "Next 60 min takes only games kicking off within the hour");
  assert.ok(special(g.slice(8))(3, "60", null, "s").short, "nothing kicking off soon: says so");
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(src, /\[\["0","All day"\],\["60","Next 60 min"\],\["all","All upcoming"\]\]/);
  assert.match(src, /Not enough games "\+\(ST\.day==="60"\?"kicking off in the next 60 minutes"/);
});

test("Merlin's Pick and Pick for me fold their games until asked, and say the window (owner, 21 Oct 2026)", () => {
  const run = grab("pfmRun");
  assert.match(run, /gOpen=ST\.open!=null\?ST\.open:true/, "the games show once the slip is built (owner, 21 Oct 2026, later the same day)");
  assert.match(src, /\.bm-pf \.bm-games,\.bm-wsx \.bm-games\{max-height:132px/, "in a short box, so the panel still fits the phone");
  assert.match(run, /games · "\+\(when\?when\+" · ":""\)\+bookMark/, "the result names its time window");
  assert.match(run, /data-a='back'>Payout or time</, "the way back says it changes the time too");
  assert.match(src, /bmRow\("wsx",PFM_ICON\.merlin,"Merlin's Pick"/, "Merlin has his own mark, not the Wizard's");
  assert.match(run, /id='"\+K\.p\+"List2'"\+\(gOpen\?"":" hidden"\)/);
  assert.match(run, /\(gOpen\?"Hide games":"Show games"\)/);
  assert.match(run, /ST\.open=!g\.hidden/, "the reader's own Show or Hide holds through Shuffle");
  assert.match(run, /ST\.busy=true; ST\.open=null;/, "a new payout starts folded again");
});

test("Build me a slip: Slider and Wizard first, then Pick for me, then Merlin's Pick, each in its own colour (owner, 21 Oct 2026)", () => {
  const open = grab("openBuildChooser");
  const at = (s) => open.indexOf(s);
  assert.ok(at("bm-sl'") < at("bm-wz'") && at("bm-wz'") < at("id='bmPfm'") && at("id='bmPfm'") < at("id='bmWsx'"), "the order");
  assert.match(open, /bm-pfm bm-pf"\+\(open==="pfm"\?" is-open":""\)\+"' id='bmPfm'/);
  assert.match(open, /bm-pfm bm-wsx"\+\(open==="wsx"\?" is-open":""\)\+"' id='bmWsx'/);
  assert.match(src, /\.bm-pf\{border-color:rgba\(255,138,61/, "Pick for me is orange (owner, 21 Oct 2026 pm)");
  assert.match(src, /\.bm-wsx\{border-color:rgba\(59,130,246/, "night blue: violet is kept for the Conjure button alone (aitells)");
  assert.match(open, /Bigger odds\? Use the Slider or the Wizard\./);
});

test("Merlin's Pick has its own animation: a sky that weighs the games, then draws the chosen ones into a constellation", () => {
  const run = grab("pfmRun");
  assert.match(run, /if\(K===WSX_K\)\{ merlinSky\(\); return; \}/);
  assert.match(run, /"Weighing "\+Math\.round\(W\*s\/MS\)/, "it counts the games it really weighed");
  assert.match(run, /path\.setAttribute\("points",pts\.slice\(0,k\+1\)\.join\(" "\)\)/, "the constellation grows a star at a time");
  assert.match(run, /if\(reduced\)\{ show\(\); return; \}/, "reduced motion goes straight to the slip");
  assert.match(src, /weighed:groups\.length/);
});

test("Build me a slip is four rows; Slider and Wizard open their builders, the quick ones open in place (owner, 21 Oct 2026)", () => {
  const open = grab("openBuildChooser"), row = grab("bmRow");
  assert.match(row, /data-open='"\+key\+"' aria-expanded=/, "the quick builders open in place");
  assert.match(row, /data-go='"\+key\+"'/, "Slider and Wizard go to their builders");
  assert.match(open, /open=localStorage\.getItem\("sw\.bmopen"\)/, "the one used last opens by itself");
  assert.match(open, /localStorage\.setItem\("sw\.bmopen",opening\?b\.dataset\.open:""\)/);
  assert.match(open, /Four ways to build a slip\. Get a "\+bookMark\(B\.key\)\+" code\./, "not 'same code at the end' (owner: confusing)");
  assert.match(src, /\.bm-pfm:not\(\.is-open\) \.bm-pane\{display:none\}/);
  assert.ok(!/bm-duo/.test(open), "the side-by-side pair is gone");
  assert.match(src, /\.bm-pf \.bm-pay,\.bm-wsx \.bm-pay\{grid-template-columns:repeat\(8,1fr\)/);
  assert.match(src, /@media \(max-height:760px\)\{\.bm-scrim\{padding:8px\}/, "short screens give back the margins");
  assert.match(src, /@media \(max-height:690px\)\{\.bm-sub\{display:none\}/);
});

test("the quick card in use is highlighted and the rest dim (owner, 21 Oct 2026)", () => {
  assert.match(grab("pfmRun"), /x\.classList\.toggle\("bm-sel",x===card\); if\(x!==card\) x\.classList\.remove\("conj"\)/);
  assert.match(src, /\.bm-other \.bm-pfm:not\(\.bm-sel\)\{opacity:\.45/);
});

test("Get code on the quick cards books with the wand, like every other Book button (owner, 21 Oct 2026)", () => {
  assert.match(grab("pfmRun"), /if\(on\) get\.innerHTML=wandHTML\("Booking…"\)/);
});

test("Get code asks before a booking code is used (owner, 21 Oct 2026: a mistake tap)", () => {
  const run = grab("pfmRun");
  const ask = run.indexOf("get.dataset.sure"), book = run.indexOf("bookRounds(");
  assert.ok(ask > 0 && ask < book, "the question comes before any booking");
  assert.match(run, /Yes, use 1 code/);
  assert.match(run, /Not now/);
});

test("opening or folding a quick builder ends the last one's highlight, so the other unfolds (owner, 21 Oct 2026)", () => {
  const open = grab("openBuildChooser");
  const h = open.indexOf('m.querySelectorAll("[data-open]")');
  const body = open.slice(h, open.indexOf("m.querySelectorAll(\"[data-go]\")", h));
  assert.match(body, /classList\.remove\("bm-other"\)/);
  assert.match(body, /classList\.remove\("bm-sel"\)/);
});

/* Owner, 21 Oct 2026: "under games are insanely risky. ruined all tickets today" (Lille 2-2 at
   half time sank three posted codes on one Under 3.5). Neither quick builder takes an Under of
   any kind - match, team or line - even when it is the surest leg on the board. */
test("neither quick builder ever picks an Under, even the surest leg on the board", () => {
  const U = ["UNDER_3.5", "UNDER_4.5", "AWAY_UNDER_1.5", "HOME_UNDER_1.5"];
  const g = Array.from({ length: 30 }, (_, i) => game(i, {
    p: { "1X": 0.7, "X2": 0.4, "OVER_1.5": 0.68, "HOME_OVER_0.5": 0.69, "UNDER_3.5": 0.9, "UNDER_4.5": 0.95, "AWAY_UNDER_1.5": 0.9, "HOME_UNDER_1.5": 0.9 },
    o: { "1X": 1.3, "X2": 2.2, "OVER_1.5": 1.35, "HOME_OVER_0.5": 1.3, "UNDER_3.5": 1.25, "UNDER_4.5": 1.2, "AWAY_UNDER_1.5": 1.3, "HOME_UNDER_1.5": 1.3 } }));
  const pfm = engine(g, { markets: ["1X", "X2", "OVER_1.5", "HOME_OVER_0.5"].concat(U) })(20, "0", null, "s");
  assert.ok(pfm.picks.length && pfm.picks.every((c) => !/UNDER_/.test(c.code)), "Pick for me: " + pfm.picks.map((c) => c.code).join(","));
  const sp = g.map((x, i) => sg(i, x.p, x.o));
  const ws = special(sp)(20, "0", null, "s");
  assert.ok(ws.picks.length && ws.picks.every((c) => !/UNDER_/.test(c.code)), "Merlin's Pick: " + ws.picks.map((c) => c.code).join(","));
});
