// test/penalty-html.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const P = require("../lib/penalty.js");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "penalty.html"), "utf8");

test("the page stays light", () => {
  /* measured as served (LF): a Windows checkout with autocrlf adds a byte a line */
  /* 100KB until the leaderboard; owner, 9 Oct 2026: "if we have to increase limit. okay" */
  assert.ok(Buffer.byteLength(html.replace(/\r\n/g, "\n")) < 140 * 1024, "under 140KB before art");
});

test("the browser rules are the server's rules, verbatim", () => {
  for (const f of ["strike", "neighbour", "judge", "shootout"]) {
    const server = P[f].toString().replace(/\s+/g, "");
    assert.ok(html.replace(/\s+/g, "").includes(server), f + " drifted from lib/penalty.js");
  }
  assert.match(html, /var ZONES=\{weakBelow:0\.55,overAbove:0\.88\}/);
});

test("site tokens only, and gold is never the main colour", () => {
  assert.match(html, /--red:#E63946/);
  assert.match(html, /--gold:#F2B84B/);
  assert.doesNotMatch(html, /background:\s*var\(--gold\)\s*;\s*\}\s*body/);
});

test("effects move only transform and opacity, and rest under reduced motion", () => {
  const keys = html.match(/@keyframes [\w-]+\{[^@]*?\}\}/g) || [];
  assert.ok(keys.length >= 5);
  for (const k of keys) assert.doesNotMatch(k, /(?:^|[{;])\s*(?:left|top|width|height|margin)\s*:/, k.slice(0, 40));
  assert.match(html, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("names are written as text, never as HTML", () => {
  assert.doesNotMatch(html, /innerHTML\s*=\s*[^;]*NAME/);
  assert.doesNotMatch(html, /innerHTML\s*=\s*[^;]*\.challenger/);
});


/* Owner, 8 Oct 2026: "best motion and fluid movements, ball physics and
   dynamics, thunder lightning - catchy, not noisy - Soccerwizard on the
   advert boards", drawn with the Nano Banana sheets. */
function grabFn(name) {
  const i = html.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " exists");
  let depth = 0, j = html.indexOf("{", i);
  for (let k = j; k < html.length; k++) {
    if (html[k] === "{") depth++;
    else if (html[k] === "}" && --depth === 0) return html.slice(i, k + 1);
  }
  throw new Error("unbalanced " + name);
}

test("the ball flies on real physics and arrives on the aimed point at the goal line", () => {
  const plan = new Function(grabFn("flightPlan") + "\nreturn flightPlan;")();
  for (const t of [{ x: -2.44, y: 0.5 }, { x: 2.44, y: 1.85 }, { x: 0, y: 3.2 }]) {
    for (const power of [0.3, 0.72, 0.95]) {
      const f = plan(t, power, 1);
      const at = (s) => ({ x: f.vx * s + 0.5 * f.ax * s * s, y: f.vy * s - 0.5 * 9.81 * s * s, z: f.vz * s });
      const end = at(f.T);
      assert.ok(Math.abs(end.x - t.x) < 0.01 && Math.abs(end.y - t.y) < 0.01 && Math.abs(end.z - 11) < 0.01, JSON.stringify({ t, power, end }));
      assert.ok(f.T > 0.25 && f.T < 0.8, "flight time is a real kick's: " + f.T);
    }
  }
  const soft = plan({ x: 0, y: 0.5 }, 0.3, 1), hard = plan({ x: 0, y: 0.5 }, 0.95, 1);
  assert.ok(soft.T > hard.T, "a weak shot travels slower");
});

test("the ball bounces with energy loss, so it settles instead of bouncing forever", () => {
  assert.match(html, /var RESTITUTION=0\.4\d*;/);
});

test("Soccerwizard is on the advert boards", () => {
  assert.match(html, /class="boards"/);
  assert.match(html.replace(/<[^>]+>/g, ""), /SOCCERWIZARD/);
});

test("lightning strikes only on a legendary shot, a perfect strike or a hot streak", () => {
  const calls = html.match(/lightning\(/g) || [];
  assert.strictEqual(calls.length, 2, "one definition, one call");
  assert.match(html, /if\(you&&\(spell\|\|perfect\|\|streak>=3\)&&k\.outcome==="goal"\)\{?\s*lightning\(/);
});

test("every sprite the page names exists on disk", () => {
  const names = [...new Set((html.match(/\b(?:kw|sw|k|s|p)-[a-z-]+(?=\.webp)/g) || []))];
  assert.ok(names.length >= 15, names.join(","));
  for (const n of names) assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "penalty", n + ".webp")), n);
});

test("only the first pose of each character and the ball load up front", () => {
  const eager = (html.match(/<link rel="preload" as="image" href="\/penalty\/[a-z-]+\.webp\?v=\d+">/g) || []).length;
  assert.strictEqual(eager, 3);
});

test("shares go to WhatsApp and X equally, X credits the account", () => {
  assert.match(html, /https:\/\/wa\.me\/\?text=/);
  assert.match(html, /https:\/\/x\.com\/intent\/post\?text=/);
  assert.match(html, /via @SoccerWizardhq/);
});

test("every POST carries the site's request header", () => {
  assert.match(html, /"X-SW-Request":"1"/);
});

test("analytics events named in the spec are sent", () => {
  for (const e of ["challenge_created", "challenge_opened", "challenge_finished", "tips_clicked", "share"]) assert.match(html, new RegExp('track\\("' + e + '"'));
});

test("the challenger takes 5 shots and 3 bonus shots, 5 dives and 3 bonus dives", () => {
  assert.match(grabFn("kicks"), /for\(var n=0;n<REG\+BONUS;n\+\+\)/);
});


test("daily share line is numbered, Wordle-style, with the grid and the streak (owner, 9 Oct 2026)", () => {
  assert.ok(html.includes('"Play Penalty #"+num+" vs the Wizard Keeper'), "numbered share line");
  assert.ok(html.includes('F.el("p","dgrid",grid)'), "the grid shows on the result too");
  assert.match(html, /"⚽":"❌"/);
});

test("the streak advances only on consecutive Lagos days", () => {
  assert.match(html, /function bumpStreak\(day\)/);
  assert.match(html, /function lagos\(ms\)\{return new Date\(ms\+3600000\)/);
});

test("the daily go is tracked", () => {
  assert.match(html, /track\("daily_played"/);
});

test("a challenge link opens the friend flow, anything else the home screen", () => {
  assert.match(html, /new URLSearchParams\(location\.search\)\.get\("c"\)/);
});

/* Owner, 8 Oct 2026: "another character as the wizard. players can choose
   who they want to use". */
test("players choose Ten or The Wizard, the choice is kept, the opponent is the other", () => {
  assert.match(html, /localStorage\.setItem\("pw\.char"/);
  assert.match(html, /function charPicker\(/);
  for (const pose of ["set", "spring", "dive-low", "dive-high", "jump", "catch", "beaten", "roar", "taunt"]) assert.match(html, new RegExp('"kw-' + pose + '\.webp"'), "wizard keeper " + pose);
  for (const pose of ["stand", "run", "strike", "follow", "arms", "slide", "head"]) assert.match(html, new RegExp('"sw-' + pose + '\.webp"'), "wizard shooter " + pose);
});

test("the daily keeper is always The Wizard", () => {
  assert.match(html, /function daily\(\)\{[^}]*PW\.setOpponent\("wizard"\)/);
});

/* Final review fixes, 8 Oct 2026. */
test("lightning is yours alone, and only for a real perfect strike or a hot streak", () => {
  assert.match(html, /if\(you&&\(spell\|\|perfect\|\|streak>=3\)&&k\.outcome==="goal"\)lightning\(/);
  assert.doesNotMatch(html, /power=k\.shot\.power!=null\?k\.shot\.power:\(kind==="green"\?0\.72/, "a guessed power must never land in the perfect band");
  assert.match(html, /shot:\{spot:s\.spot,kind:R\.strike\(s\.spot,s\.power\)\.kind,power:s\.power,aim:s\.aim,curl:s\.curl\}/, "your own shots carry their real power, aim and curl");
});

test("the streak starts at zero every match", () => {
  assert.match(html, /resetStreak:function\(\)\{streak=0;/);
  for (const f of ["challenger", "friend", "daily"]) assert.match(html, new RegExp("function " + f + "\\([^)]*\\)\\{[^]{0,200}PW\\.resetStreak\\(\\)"), f);
});


test("a challenge is told from the opener's side", () => {
  assert.match(html, /api\("GET","match",null,\{id:id,device:PW\.DEV\}\)/);
  assert.match(html, /m\.role==="challenger"/);
  assert.match(html, /function result\(a,b,winner,chName,id,role,frName\)/);
});

test("a daily go resumes where it stopped, and a finished day can be replayed for fun", () => {
  assert.match(html, /api\("GET","dailystate",null,\{device:PW\.DEV\}\)/);
  assert.match(html, /function forFun\(\)/);
  assert.match(html, /Play again for fun/);
});


/* Owner on the preview, 8 Oct 2026: "i get, cant reach the pitch". The server
   had answered (forbidden / not configured); only a dead connection is "can't reach". */
test("the error screen says what actually happened", () => {
  assert.match(html, /LAST=\{status:r\.status,error:j&&j\.error\}/);
  assert.match(html, /isn't switched on here yet/);
  assert.match(html, /LAST\.status===0\?"Can't reach the pitch, try again\."/);
});

/* Owner on the preview, 8 Oct 2026: "how do i play against computer?" and
   "the wizard keeper text is cutting off and doesnt even show on mobile". */
test("a full match against the computer needs no server and is offered from home and from the error screen", () => {
  const f = grabFn("practice");
  assert.doesNotMatch(f, /api\(/, "practice never calls the server");
  assert.match(f, /shootout\(/, "scored with the real shootout rules");
  assert.match(html, /"Play the computer"/);
  assert.match(grabFn("offline"), /Play the computer/);
});

test("the scoreboard names fit a phone", () => {
  assert.doesNotMatch(html, /\.score \.who\{[^}]*max-width:80px/);
  assert.doesNotMatch(html, /setScore\(0,0,"Wizard Keeper"\)/, "the long label is gone");
  assert.match(html, /newBoard\("The Wizard",true\)/);
});

test("Play the computer is the first button on the home screen", () => {
  const home = grabFn("home");
  const i = home.indexOf('"Play the computer"'), j = home.indexOf("Face today's Wizard Keeper"), k = home.indexOf('"Challenge a friend"');
  assert.ok(i > 0 && i < j && i < k, "first, above the fold on a phone");
});

/* Round 3, owner 8 Oct 2026: "the select, the meter and the flick at the same
   time is a hassle" -> one swipe; "make sure the ball moves in the direction of
   the swipe, also ball physics and curve"; the name is Play Penalty; more
   texture on the grass; a coach to teach people how to play. */
function swipe() { return new Function(grabFn("swipeShot") + "\nreturn swipeShot;")(); }
const H = 800;
const swp = (pts, ms) => pts.map((p, i) => ({ x: p[0], y: p[1], t: i * ms / (pts.length - 1) }));

test("a swipe straight up goes down the middle; a swipe to the right goes right", () => {
  const S = swipe();
  const up = S(swp([[200, 700], [200, 600], [200, 520]], 150), H);
  assert.ok(up.ok && Math.abs(up.aim.x) < 0.3 && up.spot % 3 === 1, JSON.stringify(up));
  const right = S(swp([[200, 700], [260, 600], [310, 520]], 150), H);
  assert.ok(right.aim.x > 1.3 && right.spot % 3 === 2, "right swipe, right side: " + JSON.stringify(right));
  const left = S(swp([[200, 700], [140, 600], [90, 520]], 150), H);
  assert.ok(left.aim.x < -1.3 && left.spot % 3 === 0, "left swipe, left side");
});

test("a longer swipe aims higher, and the aim never leaves the frame", () => {
  const S = swipe();
  const short = S(swp([[200, 700], [200, 640]], 80), H), long = S(swp([[200, 700], [200, 440]], 260), H);
  assert.ok(long.aim.y > short.aim.y && long.spot >= 3 && short.spot < 3, JSON.stringify({ short, long }));
  const wild = S(swp([[200, 700], [600, 650]], 120), H);
  assert.ok(Math.abs(wild.aim.x) <= 3.5 && wild.aim.y <= 2.3);
});

test("swipe speed is power: a lazy swipe is weak, a wild one sails over", () => {
  const S = swipe();
  const slow = S(swp([[200, 700], [200, 560]], 400), H), fast = S(swp([[200, 700], [200, 420]], 90), H);
  assert.ok(slow.power < 0.55, "slow = weak " + slow.power);
  assert.ok(fast.power > 0.88, "too fast = over " + fast.power);
});

test("a curved swipe curls the ball, a straight one does not", () => {
  const S = swipe();
  const straight = S(swp([[200, 700], [220, 610], [240, 520]], 150), H);
  const bent = S(swp([[200, 700], [240, 640], [250, 580], [240, 520]], 150), H);
  assert.ok(Math.abs(straight.curl) < 0.15, "straight " + straight.curl);
  assert.ok(bent.curl < -0.3, "bowed right then back: curls back left " + bent.curl);
});

test("a tap or a downward drag is not a shot", () => {
  const S = swipe();
  assert.strictEqual(S(swp([[200, 700], [202, 698]], 100), H).ok, false);
  assert.strictEqual(S(swp([[200, 600], [200, 700]], 100), H).ok, false);
});

test("the ball leaves along the swipe and lands on the aim; the spin bends it on the way", () => {
  const plan = new Function(grabFn("flightPlan") + "\nreturn flightPlan;")();
  const f = plan({ x: 2, y: 1.5 }, 0.75, 0.8);
  const at = (s) => ({ x: f.vx * s + 0.5 * f.ax * s * s, y: f.vy * s - 0.5 * 9.81 * s * s });
  assert.ok(Math.abs(at(f.T).x - 2) < 0.01 && Math.abs(at(f.T).y - 1.5) < 0.01);
  assert.ok(f.ax > 0 && plan({ x: 2, y: 1.5 }, 0.75, 0).ax === 0, "curl is the bend, none without it");
});

test("one swipe shoots: no meter, no second gesture", () => {
  assert.doesNotMatch(html, /id="bar"/);
  assert.match(html, /SWIPE THE BALL TO SHOOT/);
  assert.match(grabFn("aimAndShoot"), /swipeShot\(/);
});

test("the game is called Play Penalty", () => {
  assert.doesNotMatch(html, /Penalty Wahala|PENALTY WAHALA/);
  assert.match(html, /<title>Play Penalty \| Soccerwizard<\/title>/);
  assert.match(html, /PLAY PENALTY/);
});

test("the turf has perspective stripes and a grain", () => {
  assert.match(grabFn("drawTurf"), /polygon/);
  assert.match(html, /feTurbulence/);
});

test("The Wizard coaches a first-timer, once per lesson, and How to play replays it", () => {
  assert.match(html, /function coach\(key,/);
  assert.match(html, /localStorage\.setItem\("pw\.coach"/);
  assert.match(html, /\/penalty\/kw-taunt\.webp/);
  for (const k of ["shoot", "dive", "over"]) assert.match(html, new RegExp('coach\\("' + k + '"'), k);
  assert.match(html, /"How to play"/);
});

/* Round 4, owner 8 Oct 2026: new set-position sheets; "when the keeper jumps
   he gets hidden by the goal post, fix that, give this crazy nice motion";
   "if i hold the ball i see the direction the ball is going to - should it be so?" */
test("the keeper is drawn in front of the posts", () => {
  assert.ok(html.indexOf('id="posts"') < html.indexOf('id="keeper"'), "posts first, keeper over them");
});

test("the waiting keeper keeps both feet down in his set position, hops across the line, and casts a shadow", () => {
  assert.match(html, /"k-set\.webp"/);
  assert.doesNotMatch(html, /k-step-/, "the one-foot step frames read as a foot on an invisible ball");
  assert.match(html, /if\(K\.idle&&K\.img==="k-set\.webp"&&!REDUCED\)\{/);
  assert.match(html, /K\.bob=-hop\*7;/);
  assert.match(html, /id="kshadow"/);
  assert.doesNotMatch(html, /"k-ready\.webp"/, "the leaning pose is retired");
});

test("the keeper loads up when the kicker puts a finger on the ball", () => {
  assert.match(grabFn("aimAndShoot"), /K\.img="k-spring\.webp"/);
});

test("a dive leaves an afterimage trail and lands with a bounce and a puff of turf", () => {
  assert.match(html, /function afterimage\(/);
  assert.match(html, /function dust\(/);
});


/* Round 6, owner 8 Oct 2026: "when the keeper saves, the keeper gets smaller - the
   sizes are not proportional", plus the landing sheets for both keepers. */
test("every keeper pose has its own measured height, per character, so he never changes size", () => {
  const KH = JSON.parse(/var KH=(\{[^;]*\});/.exec(html)[1]);
  for (const c of ["k-", "kw-"]) for (const p of ["set", "spring", "dive-low", "dive-high", "jump", "catch", "beaten", "roar", "land", "down", "held", "crash"])
    assert.ok(KH[c + p + ".webp"] > 0.4 && KH[c + p + ".webp"] < 2.8, c + p);
  assert.match(html, /kh=KH\[file\(K\.img\)\]\*kp\.s/, "looked up by the file actually drawn");
});

test("a diving keeper lands on the landing frames: impact or crash, then down, or holding the ball", () => {
  for (const f of ["k-land", "k-crash", "k-down", "k-held"]) assert.match(html, new RegExp('"' + f + '\\.webp"'), f);
  assert.match(html, /K\.img=high\(k\.dive\)\?"k-crash\.webp":"k-land\.webp"/);
});

/* Round 6b, owner 8 Oct 2026: "use the normal penalty scoreboard style",
   "there is no football net physics", "in the advert runner, add all the bookies
   and their colors". */
test("the scoreboard is a shootout board: a row per side, a circle per kick, filled as they go", () => {
  assert.match(html, /class="sboard"/);
  assert.match(html, /id="kA"/); assert.match(html, /id="kB"/);
  assert.match(html, /function drawBoard\(/);
  assert.match(grabFn("playKick"), /BOARD\[you\?"a":"b"\]\.push\(/, "every kick is written to its side");
});

test("the net is a cloth: an impact billows it and it settles back to rest", () => {
  const mk = new Function(grabFn("netMake") + "\n" + grabFn("netHit") + "\n" + grabFn("netStep") + "\nreturn {netMake:netMake,netHit:netHit,netStep:netStep};")();
  const N = mk.netMake(18, 9);
  mk.netHit(N, 9, 5, 6);
  let peak = 0; for (let i = 0; i < 20; i++) { mk.netStep(N, 1 / 60); peak = Math.max(peak, ...N.d.map(Math.abs)); }
  assert.ok(peak > 0.2, "it billows: " + peak);
  for (let i = 0; i < 600; i++) mk.netStep(N, 1 / 60);
  assert.ok(Math.max(...N.d.map(Math.abs)) < 0.01, "it settles");
  assert.ok(N.d.every((v, i) => (i % 18 === 0 || i % 18 === 17 || i < 18 || i >= 18 * 8) ? v === 0 : true), "the frame edges are pinned");
});

test("every bookmaker runs on the LED boards in its own colours", () => {
  const boards = /<div class="boards"[\s\S]*?<div class="bflash"/.exec(html)[0];
  for (const b of ["SPORTYBET", "BET9JA", "BETKING", "BETPAWA", "1XBET", "SOCCERWIZARD"]) assert.match(boards.replace(/<[^>]+>/g, ""), new RegExp(b, "i"), b);
  /* the site's own wordmarks and colours (owner, 9 Oct 2026), not our type */
  for (const m of ["sbm", "b9m", "bkm", "bwm", "xbm"]) assert.match(boards, new RegExp('class="' + m + '"'), m);
  for (const c of ["#E63946", "#D42127", "#14B151", "#FFC400", "#9CE800", "#14A0FF"]) assert.match(html, new RegExp(c), c);
  assert.doesNotMatch(html, /\.track[^{]*\{[^}]*text-shadow:0 0/, "no zero-offset glows on the boards");
});

/* Round 7, owner 8 Oct 2026: "act a renowned game dev and add features to make it
   mad addictive and interactive". */
function pure(names) { return new Function(names.map(grabFn).join("\n") + "\nreturn {" + names.map((n) => n + ":" + n).join(",") + "};")(); }

test("style points: a plain goal is 100, top bins, curl and perfect power add, the streak multiplies", () => {
  const { stylePoints } = pure(["stylePoints"]);
  assert.deepStrictEqual(stylePoints({ top: false, curl: 0, perfect: false, streak: 1 }), { pts: 100, tags: [] });
  const big = stylePoints({ top: true, curl: 0.6, perfect: true, streak: 3 });
  assert.strictEqual(big.pts, Math.round((100 + 60 + 40 + 50) * 1.5));
  assert.deepStrictEqual(big.tags, ["TOP BINS", "CURL", "PERFECT", "x1.5"]);
});

test("levels climb and slow down; trails unlock at 3, 5 and 8", () => {
  const { levelOf, trailFor } = pure(["levelOf", "trailFor"]);
  assert.strictEqual(levelOf(0), 1);
  assert.ok(levelOf(400) === 2 && levelOf(1600) === 3 && levelOf(10000) === 6);
  assert.strictEqual(trailFor(1).name, "red"); assert.strictEqual(trailFor(3).name, "gold");
  assert.strictEqual(trailFor(5).name, "electric"); assert.strictEqual(trailFor(9).name, "white-hot");
});

test("the Sudden Death keeper reads you better with every goal, but never perfectly", () => {
  const { smartDive } = pure(["smartDive"]);
  const hit = (streak) => { let n = 0; for (let i = 0; i < 4000; i++) { const d = smartDive(4, streak, Math.random); if (d % 3 === 4 % 3) n++; } return n / 4000; };
  const early = hit(0), late = hit(12);
  assert.ok(late > early + 0.2, "smarter: " + early.toFixed(2) + " -> " + late.toFixed(2));
  assert.ok(late < 0.75, "still beatable: " + late.toFixed(2));
});

test("Sudden Death is Ranked (owner, 9 Oct 2026): judged on the server, on the home screen beside the leaderboard", () => {
  const f = grabFn("survival");
  assert.match(f, /api\("POST","ranked",\{device:PW\.DEV,name:name,club:club,run:run,i:i,spot:s\.spot,power:s\.power\}\)/);
  assert.doesNotMatch(f, /smartDive|consumeSpell/, "nothing on the phone decides a ranked kick");
  assert.match(html, /F\.btn\("Ranked","ghost".*F\.btn\("Leaderboard","ghost"/);
  assert.match(grabFn("leaderboard"), /api\("GET","board",null,\{period:per,device:PW\.DEV\}\)/);
});

test("your goals earn points with a floating tag, and the level shows at home", () => {
  assert.match(grabFn("playKick"), /award\(/);
  assert.match(html, /id="pts"/);
  assert.match(grabFn("home"), /levelOf\(/);
});

test("nothing calls the retired dot strip", () => {
  assert.doesNotMatch(html, /\bdots\(/);
  assert.doesNotMatch(html, /\.dots\{/);
});

/* Owner, 8 Oct 2026: "when the ball hits the bar, dont say saved - missed, or hit the post". */
test("your miss is WAHALA with its reason under it; the bar never says saved", () => {
  /* Owner: "when the ball hits the bar, dont say saved" then "i liked the wahala lol". */
  const f = grabFn("playKick");
  const bar = f.slice(f.indexOf('what==="bar"'), f.indexOf("}else{", f.indexOf('what==="bar"')));
  assert.match(bar, /fx\.pop\(you\?pick\(\["WAHALA!","MISSED!"\]\):"MISSED!",you\?"#E63946":"#2FD48A","OFF THE BAR"\)/); assert.match(bar, /fx\.board\("OFF THE BAR"/);
  assert.doesNotMatch(bar, /SAVED/);
  assert.match(f, /fx\.pop\(you\?pick\(\["WAHALA!","MISSED!"\]\):"MISSED!",you\?"#E63946":"#2FD48A","OVER THE BAR"\);fx\.board\("MISSED"/);
  assert.match(html, /pop:function\(word,color,why\)/);
});

/* Round 8, owner 8 Oct 2026: "your save tap where to dive runs into the score
   board", "the miss icon has its x not centralised", "sometimes it looks like the
   ball went inside but it says saved", "it seems like the game is cropped". */
test("the slow-motion zoom starts at the strike, never while you aim", () => {
  assert.match(html, /slowmo:function\(on\)\{SLOWNEXT=!!on&&!REDUCED;if\(!on\)\{TS=1;CAM_FX\.zoomTo=1;\}\}/);
  assert.match(grabFn("playKick"), /if\(SLOWNEXT\)\{TS=0\.38;CAM_FX\.zoomTo=1\.14;\}/);
});

test("a save is made where the ball is; a goal keeps the keeper clear of it", () => {
  const f = grabFn("playKick");
  assert.match(f, /if\(k\.outcome==="save"\)\{kp\.x=Math\.max\(-3\.2,Math\.min\(3\.2,aim\.x\)\)/);
  assert.match(f, /if\(\(k\.outcome==="over"\|\|k\.outcome==="goal"&&Math\.abs\(kp\.y-aim\.y\)<1\.1\)&&Math\.abs\(kp\.x-aim\.x\)<1\.2\)/);
  assert.match(f, /if\(k\.outcome==="over"\)kp\.arc=0;/, "over the bar: the keeper never leaps into the ball's path");
  assert.match(f, /B\.x=Math\.max\(-3\.5,Math\.min\(3\.5,ox\+vx/, "a goal stays inside the posts as it settles in the net");
});

test("the turn label sits below the scoreboard, and the miss cross is centred", () => {
  assert.match(html, /#tag\{position:absolute;top:calc\(86px \+ env\(safe-area-inset-top\)\)/);
  assert.match(html, /\.kicks i\.m:before,\.kicks i\.m:after\{content:"";position:absolute;left:50%;top:50%;width:8px;height:1\.5px;margin:-\.75px 0 0 -4px;/);
});

/* Round 9, owner 8 Oct 2026: "our selling point is picking games for people and
   offering codes - incorporate it", "the arrow when you are about to take the
   shot - remove it", "trailing fire when the ball is in flight", "if i shoot
   while i do a curl motion, let the ball curl in the direction", "it looks like
   the stand is empty", "the red dot on the ball stays on after shooting". */
test("no stakes in the game: nothing is wagered, but the wizard's slip and codes are offered", () => {
  assert.doesNotMatch(html, /place a bet|your stake|stake to win/i);
  assert.match(grabFn("tipsCard"), /Today's wizard slip/);
  assert.match(grabFn("tipsCard"), /nm\.innerHTML=BOOKM\[k\]/, "bookmaker names are their wordmarks, in their colours");
  assert.doesNotMatch(grabFn("tipsCard"), /See all predictions/, "one button per destination");
  assert.match(grabFn("tipsCard"), /r\.j\.code/);
  assert.match(grabFn("tipsCard"), /Build me a slip/);
});

test("no aim arrow while you hold the ball", () => {
  assert.doesNotMatch(html, /function guide\(/);
  assert.doesNotMatch(html, /id="guide"/);
});


test("a swipe that turns right curls the ball right; one that turns left, left", () => {
  const S = swipe();
  const right = S(swp([[200, 700], [200, 640], [210, 580], [240, 530]], 150), H);
  const left = S(swp([[200, 700], [200, 640], [190, 580], [160, 530]], 150), H);
  assert.ok(right.curl > 0.3, "turning right " + right.curl);
  assert.ok(left.curl < -0.3, "turning left " + left.curl);
});

test("the stand is full: a drawn crowd that jumps on a goal", () => {
  assert.match(html, /<canvas id="crowdc"/);
  assert.match(html, /function drawCrowd\(/);
  assert.match(html, /\.hype #crowdc\{animation:pw-jump/);
});

test("the ball's red glow goes out in flight and comes back at rest", () => {
  assert.match(html, /B\.fly\?"saturate\(\.12\) brightness\(1\.06\)":"none"/);
});

test("a catch is a catch: no parry burst, the ball rides into his hands and lands with him", () => {
  const f = grabFn("playKick");
  assert.match(f, /var catchIt=kind==="weak"&&k\.dive===k\.shot\.spot;impact\("save",catchIt\);/);
  assert.match(f, /if\(caught\)\{fx\.pop\("CAUGHT!"/);
  assert.match(f, /if\(B\.att\)\{B\.x=K\.x;/);
});

test("the keeper is happy when he saves or the kicker misses: up off the floor, roaring or taunting", () => {
  const f = grabFn("playKick");
  assert.match(f, /if\(k\.outcome!=="goal"\)return wait\([^)]*\)\.then\(function\(\)\{K\.img=k\.outcome==="save"\?"k-roar\.webp":"k-taunt\.webp";/);
  assert.doesNotMatch(f, /"k-shrug\.webp"/, "no shrugging at a miss");
  assert.doesNotMatch(html, /The line turns red/, "the aim line is gone; the coach must not mention it");
});

/* Round 11, owner 8 Oct 2026: "the fiery trail is too much, give me something
   wizardry", "the controls dont feel fluid enough, ball direction seems
   limited", "more game mechanics to make the penalty crazier". */
test("every flow flies the ball to your real aim with your curl, not to a spot's centre", () => {
  assert.doesNotMatch(html, /kind:R\.strike\(s\.spot,s\.power\)\.kind,power:s\.power\}/, "a shot without aim/curl lands on a fixed spot");
  assert.doesNotMatch(html, /kind:R\.strike\(o\.s\.spot,o\.s\.power\)\.kind,power:o\.s\.power\}/);
  assert.match(html, /power:s\.power,aim:s\.aim,curl:s\.curl\}/);
});

test("the swipe projects to a point on the goal: the whole frame is reachable", () => {
  const S = swipe();
  const geo = { bx: 200, by: 700, gx: 200, gy: 380, sG: 45, k: 2.4 };
  const top = S(swp([[200, 700], [240, 600], [270, 520]], 150), H, geo);
  assert.ok(top.aim.x > 3 && top.aim.y > 2, "top corner: " + JSON.stringify(top.aim));
  const low = S(swp([[200, 700], [185, 640]], 120), H, geo);
  assert.ok(low.aim.y < 0.8 && low.aim.x < 0, "low left: " + JSON.stringify(low.aim));
  const mid = S(swp([[200, 700], [210, 630], [215, 540]], 160), H, geo);
  assert.ok(Math.abs(mid.aim.x) < 2 && mid.aim.y > 0.4 && mid.aim.y < 2.3, "anywhere between: " + JSON.stringify(mid.aim));
});

test("a long fast swipe fires as it crosses, without waiting for the finger to lift", () => {
  assert.match(grabFn("aimAndShoot"), /if\(\w+>CAM\.H\*0\.3\)fire\(/);
});

test("the trail is a spell: star motes spiral round the ball's path; a summoning circle marks the strike", () => {
  assert.doesNotMatch(html, /function fireTick\(/);
  assert.match(html, /function spellTick\(/);
  assert.match(grabFn("playKick"), /spellTick\(/);
  assert.match(html, /function summon\(/);
});

test("solo modes add wind and a spell meter; challenges and the daily stay plain and fair", () => {
  for (const f of ["practice", "forFun"]) assert.match(grabFn(f), /PW\.setSolo\(true\)/, f);
  for (const f of ["challenger", "friend", "daily", "survival"]) assert.match(grabFn(f), /PW\.setSolo\(false\)/, f);
  assert.match(html, /function consumeSpell\(/);
  assert.match(html, /id="cast"/);
  assert.match(html, /id="wind"/);
  assert.match(grabFn("playKick"), /SPELLNOW/);
});

test("the legendary shot: LEGEND shows only while you aim, freezes the keeper, and on target always scores", () => {
  assert.match(html, /c\.hidden=!\(SOLO&&SPELL>=100&&AIMING\)/);
  const aim = grabFn("aimAndShoot");
  assert.match(aim, /AIMING=true;drawSpell\(\)/);
  assert.match(aim, /AIMING=false;drawSpell\(\)/);
  assert.match(html, /#cast\{[^}]*width:64px;height:64px;[^}]*border-radius:50%/, "a round button that never covers the ball");
  assert.match(html, /#cast\[hidden\]\{display:none\}/);
  assert.match(grabFn("playKick"), /\$\("app"\)\.classList\.add\("legend"\)/);
  assert.match(html, /#app\.legend #keeper\{filter:/);
  assert.doesNotMatch(html, /id="runes"/, "the rune circle is gone");
  assert.match(html, /#spellbox\[hidden\]\{display:none\}/, "display:flex must not beat hidden: no meter in challenges or the daily");
  for (const f of ["practice", "forFun"]) assert.match(grabFn(f), /if\(sp&&o==="save"\)o="goal"/, f);
});

test("every sprite address carries the art version, so new art is never served from an old cache", () => {
  assert.match(html, /var SPV="\d+";/);
  assert.match(html, /function setImg\(el,f\)\{[^}]*"\/penalty\/"\+f\+"\?v="\+SPV/);
  assert.doesNotMatch(html.replace(/<script>[\s\S]*<\/script>/g, ""), /\.webp"/, "static tags too");
});

test("owner, 9 Oct 2026: a far-corner shot always gets a dive, faces on the scoreboard, a turn banner you notice", () => {
  assert.match(grabFn("playKick"), /col\(k\.dive\)===1&&Math\.abs\(aim\.x\)>2\.2\)\{var sd=aim\.x>0\?1:-1;kp=keeperPose\(/);
  assert.match(html, /<i class="av" id="avA"><\/i>/);
  assert.match(html, /<i class="av" id="avB"><\/i>/);
  assert.match(grabFn("drawBoard"), /face\(ME\)[\s\S]*face\(OPP\|\|other\(\)\)/);
  assert.match(grabFn("aimAndShoot"), /setTag\("YOUR SHOT","shot"\)/);
  assert.match(grabFn("pickDive"), /setTag\("YOUR SAVE","save"\)/);
  assert.match(html, /#tag\.go\{animation:pw-turn/);
});

test("owner, 9 Oct 2026: goal crowd at half volume, a sound button on the pitch, an early finish explained", () => {
  assert.match(html, /sfx\(spell\|\|top\?"roarbig":"roar",spell\?0\.25:0\.2\)/, "soft: a quarter of the first mix");
  assert.match(html, /<button id="snd" type="button"><\/button>/);
  assert.match(html, /function setMuted\(m\)\{.*drawSnd\(\);\}/);
  assert.match(grabFn("practice"), /so it ends early/);
});

test("a closed sheet is inert, so Space can never restart a match behind your back", () => {
  assert.match(html, /function closeSheet\(\)\{.*document\.activeElement\.blur\(\);s\.inert=true;/);
  assert.match(html, /s\.inert=false;s\.classList\.add\("on"\)/);
});

test("owner, 9 Oct 2026: OYA and WAHALA are yours alone and mixed with other words; no voice clips", () => {
  const f = grabFn("playKick");
  assert.match(f, /\(you\?pick\(\["GOAL!","OYA!"\]\):"GOAL!"\)/);
  assert.equal((f.match(/fx\.pop\(you\?pick\(\["WAHALA!","MISSED!"\]\):"MISSED!"/g) || []).length, 2);
  assert.doesNotMatch(f, /fx\.pop\("WAHALA!"|"OYA!"\)/, "never on the other side's kick");
  assert.doesNotMatch(html, /"oya"|"wahala"/, "the voice clips are gone");
});

test("owner, 9 Oct 2026: share is one row of round marks, not red pills; the result sheet fits a phone", () => {
  const f = grabFn("shareSheet");
  assert.match(f, /sh\("wa","WhatsApp"/);
  assert.match(f, /sh\("xx","X"/);
  assert.doesNotMatch(f, /btn\("WhatsApp","red"|btn\("X","red"/);
  assert.match(html, /\.sh\.wa i\{background:#25D366/);
  assert.match(grabFn("practice"), /var acts=el\("div","row"\)/, "Play again and Challenge share one row");
});

test("owner, 9 Oct 2026: out wide is always a dive; total odds in gold", () => {
  assert.match(grabFn("playKick"), /if\(Math\.abs\(kp\.x\)>0\.9&&!kp\.flip\)\{var dv=keeperPose\(/);
  assert.match(grabFn("tipsCard"), /el\("b","odds",/);
  assert.match(html, /\.tips \.odds\{color:var\(--gold\)/);
});

test("release step 2 (owner, 9 Oct 2026): Play Penalty in the phone bar with a joystick, in the desktop header, and under Your slips", () => {
  const index = require("fs").readFileSync(require("path").join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(index, /<a class="btab" id="bt-play" href="\/penalty" aria-label="Play Penalty"><span class="bt-ic"><svg[^>]*>.*<\/svg><\/span>Play<\/a>/);
  assert.match(index, /<a class="navplay" id="tab-play" href="\/penalty"/);
  assert.match(index, /<a class='ys-play' href='\/penalty'>/);
  assert.match(index, /a\.btab\{text-decoration:none\}/);
});

test("owner, 9 Oct 2026: a way back to the site on every screen; the challenge result counts what the board counts", () => {
  assert.match(html, /<a id="exit" href="\/" aria-label="Soccerwizard home"><img src="\/penalty\/wiz-64\.webp\?v=/, "the way out shows where it goes");
  assert.match(html, /"Soccerwizard home"\);site\.type="button"/);
  /* owner, 9 Oct 2026: link first, then blind kicks - no pretend match against the computer */
  assert.match(grabFn("challenger"), /api\("POST","create",\{name:name,device:PW\.DEV\}\)/);
  assert.match(grabFn("kicks"), /outcome:"locked"/);
  assert.match(grabFn("kicks"), /api\("POST","picks",\{id:id,device:PW\.DEV,shots:shots,dives:dives\}\)/);
  assert.match(grabFn("friend"), /if\(m\.pending\)return sheet/);
});

test("owner, 9 Oct 2026: every end-of-game sheet has a way back to the game menu", () => {
  assert.match(grabFn("sheet"), /if\(!isMenu&&window\.PWHome\)\{var m=el\("button","smenu","Menu"\)/);
  assert.match(html, /F\.sheet\(nodes,true\);/, "the menu itself does not offer itself");
});

test("the home menu fits a short phone; the logo button steps aside while a sheet is open", () => {
  assert.match(html, /@media\(max-height:700px\)\{\.pick button img\{height:60px\}\.btn\{height:44px\}/);
  assert.match(html, /#app:has\(#sheet\.on\) #exit\{display:none\}/);
});

test("batch 1 (owner, 9 Oct 2026): Again first, who to pass next, a new best, near misses play slow, challenge back", () => {
  const sv = grabFn("survival");
  assert.match(sv, /btn\("Again","red"/);
  assert.match(sv, /more to pass "\+above\.name/);
  assert.match(sv, /localStorage\.setItem\("pw\.rbest"/);
  const pk = grabFn("playKick");
  assert.match(pk, /var near=k\.dive!=null&&\(k\.outcome==="goal"&&col\(k\.dive\)===col\(k\.shot\.spot\)&&high\(k\.dive\)!==high\(k\.shot\.spot\)\|\|k\.outcome==="save"&&k\.dive!==k\.shot\.spot\);/);
  assert.match(pk, /"BY INCHES"/);
  assert.match(pk, /near\?"FINGERTIPS":null/);
  assert.match(grabFn("result"), /btn\("Challenge "\+chName\+" back","red"/);
});

test("match feel (owner, 9 Oct 2026): a VS card before each match, a TV score bug, 1-3 stars a goal", () => {
  assert.match(html, /<div id="vs" aria-hidden="true">/);
  assert.match(grabFn("practice"), /PW\.vs\(PW\.NAME\|\|"You",PW\.char,"Computer",null,"FRIENDLY"\)\.then\(next\)/);
  assert.match(grabFn("survival"), /PW\.vs\(name,PW\.char,"Wizard Keeper","wizard","RANKED"\)\.then\(next\)/);
  assert.match(grabFn("friend"), /PW\.vs\(n,PW\.char,m\.challenger,null,"CHALLENGE"\)/);
  assert.match(html, /\.sboard:before\{content:"PENALTIES"/);
  assert.match(grabFn("playKick"), /var st=you\?1\+\(top\?1:0\)\+\(perfect\|\|Math\.abs\(curl\)>0\.5\?1:0\):0;STARS\+=st;/);
  assert.match(html, /#sheet h2\.best\{color:var\(--gold\)\}/);
});

test("game lettering stays cheap to draw (owner, 9 Oct 2026: 'it lags and its glitchy')", () => {
  assert.match(html, /t\.className="w";t\.textContent=word/);
  assert.match(html, /#pop \.w\{[^}]*color:var\(--c\);[^}]*text-shadow:/, "solid fill with a shadow outline, drawn once");
  assert.doesNotMatch(html, /#pop \.w\{[^}]*(filter|background-clip)/, "no filter chain or clipped gradient on the word");
  assert.doesNotMatch(html, /@keyframes pw-pop\{[^\n]*blur/, "no blur inside the slam");
  assert.doesNotMatch(html, /repeating-conic-gradient|pw-shine|pw-rays/, "no ray burst or shine sweep");
  assert.doesNotMatch(html, /\.sboard\{[^}]*backdrop-filter/, "the scoreboard does not blur the moving crowd under it");
  assert.match(html, /#tag\.shot,#tag\.save\{padding:0;border:0;background:none;/, "the turn is lettering, not a plate");
});

test("batch 2 (owner, 9 Oct 2026): a League tab with your division's crest, promotion when your division goes up", () => {
  const lb = grabFn("leaderboard");
  assert.match(lb, /\[\["league","League"\],\["clubs","Clubs"\],\["today","Today"\],\["week","Week"\],\["all","All time"\]\]/);
  assert.match(lb, /per==="league"&&r\.j\.division/);
  assert.match(grabFn("crest"), /<svg viewBox="0 0 48 56"/);
  assert.match(grabFn("promote"), /PW\.fx\.pop\("PROMOTED!",DIV\[t\]\[1\],DIV\[t\]\[2\]\.toUpperCase\(\)\)/);
  assert.match(grabFn("survival"), /lg\.division\.tier>was\)setTimeout\(function\(\)\{promote\(lg\.division\.tier\);\}/);
  assert.match(html, /F\.leaderboard\("league"\)/, "the menu opens your league");
  assert.match(html, /#pop\{[^}]*z-index:13/, "the word sits above the promotion overlay");
});

test("match report card (owner, 9 Oct 2026): stars, top bins and your saves after a match", () => {
  assert.match(grabFn("report"), /"Stars"\][\s\S]*"Top bins"\][\s\S]*"Your saves"\]/);
  assert.match(grabFn("practice"), /\[report\(\),acts,tipsCard\(\)\]/);
  assert.match(grabFn("result"), /role==="friend"\?\[report\(\)\]:\[\]/);
  assert.match(grabFn("playKick"), /if\(you&&top\)TOPS\+\+;/);
});

test("club wars (owner, 9 Oct 2026): pick a club once, its badge by your name, a Clubs table", () => {
  const ids = [...html.matchAll(/\["([a-z-]+)","[^"]+","[A-Z0-9]{3}","#/g)].map((m) => m[1]);
  assert.deepStrictEqual(ids, require("../lib/penalty.js").CLUBS, "the page's clubs are the ones the server stores");
  assert.match(html, /askName\(\)\.then\(function\(name\)\{return pickClub\(\)/, "Ranked asks for a club after the name");
  assert.match(html, /li\.appendChild\(nameCell\(x\)\)/, "names on the tables carry the badge");
});
