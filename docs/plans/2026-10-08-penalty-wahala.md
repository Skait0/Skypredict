# Penalty Wahala (release 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a light, flashy penalty-shootout game at `/penalty` on Soccerwizard: a 1v1 challenge played through a short link, a daily Wizard Keeper with a streak, and a tips card that leads into the site.

**Architecture:** One static page (`public/penalty.html`, inline SVG + one script, no dependencies) talks to one API file (`api/penalty.js`) that judges every kick on the server from rules in `lib/penalty.js`, storing state in two Supabase tables through the project's existing PostgREST client. A second function (`api/p.js`) server-renders `/p/:id` so WhatsApp and X show a preview.

**Tech Stack:** Node 20 serverless functions on Vercel, Supabase PostgREST via `lib/supabase.js` (no SDK), `node:test`, puppeteer-core for the headless check (already on this machine, not a project dependency). Zero new npm dependencies.

**Spec:** `docs/specs/2026-10-08-penalty-wahala-design.md` (approved 8 Oct 2026). Read it before starting.

## Global Constraints

- Zero npm dependencies; Node 20 built-ins only (`crypto`, `fetch`).
- Free game, no stakes: no bet, booking code or price anywhere in the game.
- `public/penalty.html` under 100KB before character art; art sprites about 60-80KB, loaded after the page opens.
- Colours from the site's tokens only: red `#E63946` (brand/action), gold `#F2B84B` (wins and small accents only), green `#2FD48A` (goals/hits), greys for structure, near-black `#0D0D0F` background. Not an all-gold palette.
- Wizardry x soccer: magic from football shapes; no wizard hats or robes.
- Brand is one word: "Soccerwizard".
- Animations move only `transform` and `opacity`; `prefers-reduced-motion` removes shake, zoom and slow motion.
- Nicknames: trimmed, max 16 characters, letters, numbers and spaces; always rendered as text.
- Lagos day = `new Date(ms + 3600000).toISOString().slice(0, 10)`.
- POST routes require the existing guard (`H.guardPost`: `X-SW-Request: 1` and Origin `https://www.soccerwizard.live`).
- Shares go to WhatsApp and X equally; X text ends "via @SoccerWizardhq".
- Files with CRLF line endings stay CRLF (use the Edit tool, not `sed -i`, on `public/index.html`, `vercel.json` and tests).
- Never push to `main` or deploy without the owner's yes. Work on branch `penalty` in worktree `Desktop/Skypredict-penalty`.

## Review Focus

1. **The friend replays or races a kick** (double tap, two tabs, a retried request): the second kick must be refused, never counted twice. Pinned in Task 3 (optimistic `kicks_n` lock) and Task 4.
2. **Someone reads the network tab** to see the challenger's picks or the daily keeper's dives before kicking: no unplayed pick or dive ever leaves the server. Pinned in Task 4.
3. **A third person opens a challenge already being played** by the friend on another phone: they see the score but cannot kick. Pinned in Task 4 (`friend_device` claim).
4. **Lagos midnight during a daily go**: shots started before midnight finish against the same day's keeper (the day is fixed by the first shot). Pinned in Task 4.
5. **Hostile nicknames** (`<img onerror>`, emoji, 200 characters): cleaned on the server and rendered as text on the challenge page and in the game. Pinned in Tasks 2, 5 and 6.

## Deviation from the spec (owner to confirm at review)

- **Preview image:** release 1 uses one fixed preview image (`public/penalty/og.png`, the site card until the art arrives) and puts the result in the preview *text*, e.g. "Tobi challenges you to a penalty shootout". Drawing the score into the image needs a new PNG compositor; it is left for when the art lands.
- **Daily counts:** one table, `penalty_daily_plays` (day, anonymous device id, shots, score), replaces the spec's `penalty_daily` counter. "Better than N%" is two counts on it, and the same row stops a device re-shooting a kick to discover the keeper's dive (Review Focus 2).
- **Challenger's own match vs the computer** is judged on the phone (no stakes; only the friend's half is contested). The server stores the challenger's picks and judges the friend's half.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/penalty.js` | Pure rules: spots, power zones, judging a kick, shootout state, daily dives, nickname cleaning, Lagos day, ids. No I/O. |
| `lib/penaltydb.js` | Data access for the two tables over `lib/supabase.js`. |
| `sql/penalty.sql` | Table definitions (owner runs it in Supabase). |
| `api/penalty.js` | All game calls: `create`, `match`, `kick`, `daily`, `mine`, `tips`. Factory `make(deps)` like `api/auth.js`. |
| `api/p.js` | Server-rendered `/p/:id` challenge page with preview tags. |
| `public/penalty.html` | The game: scene, input, effects, local match, challenge flow, daily flow, share, tips card. |
| `public/penalty/og.png` | Preview image (copy of `public/og-card.png` for now). |
| `vercel.json` | Rewrites `/p/:id` -> `/api/p`, `/penalty` served by clean URLs; `includeFiles` for `api/penalty.js`. |
| `test/penalty-rules.test.js`, `test/penalty-db.test.js`, `test/penalty-api.test.js`, `test/penalty-page.test.js`, `test/penalty-html.test.js` | Tests per unit. |

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree and branch**

```bash
cd C:/Users/DELL/Desktop/Skypredict
git fetch -q && git worktree add -b penalty ../Skypredict-penalty origin/main
cp public/predictions.json public/robots.txt ../Skypredict-penalty/public/
cd ../Skypredict-penalty && node --test 2>&1 | grep -E "^ℹ (pass|fail)"
```

Expected: everything passes except the known local-only failure `no unrated competition survives into the built payload`.

---

### Task 1: The rules (`lib/penalty.js`)

**Files:**
- Create: `lib/penalty.js`
- Test: `test/penalty-rules.test.js`

**Interfaces:**
- Produces:
  - `SPOTS = 6`; a spot is an integer 0-5: `col = s % 3` (0 left, 1 middle, 2 right), `high = s >= 3`.
  - `ZONES = { weakBelow: 0.55, overAbove: 0.88 }` (tuning values).
  - `strike(spot, power) -> { spot, kind: "green" | "weak" | "over" }`
  - `neighbour(a, b) -> boolean`
  - `judge(shot: {spot, power}, dive: int) -> "goal" | "save" | "over" | "bar"`
  - `shootout(outcomes: string[]) -> { a, b, done, winner: "a" | "b" | "draw" | null, next: "a" | "b" | null, round }` - outcomes alternate kicker A (index 0, 2, ...) then kicker B; `a`/`b` are goals.
  - `REG = 5`, `BONUS = 3`
  - `dailyDives(key: string, day: string) -> int[5]`
  - `cleanName(s) -> string | null`
  - `lagosDay(ms) -> "YYYY-MM-DD"`
  - `newId() -> string` (6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`)
  - `validPick(x) -> boolean` for a shot `{spot, power}`; `validDive(x) -> boolean`

- [ ] **Step 1: Write the failing tests**

```js
// test/penalty-rules.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const P = require("../lib/penalty.js");

test("power zones: weak, green, over", () => {
  assert.strictEqual(P.strike(0, 0.30).kind, "weak");
  assert.strictEqual(P.strike(0, 0.70).kind, "green");
  assert.strictEqual(P.strike(0, 0.95).kind, "over");
  assert.strictEqual(P.strike(0, P.ZONES.weakBelow).kind, "green", "the edge belongs to green");
});

test("neighbours: same column other height, or same height next column", () => {
  assert.ok(P.neighbour(0, 3));            // left low / left high
  assert.ok(P.neighbour(0, 1));            // left low / middle low
  assert.ok(!P.neighbour(0, 2));           // left low / right low
  assert.ok(!P.neighbour(0, 4));           // diagonal
  assert.ok(!P.neighbour(1, 1));           // the same spot is not a neighbour
});

test("judge: over the top sails over when high, hits the bar when low", () => {
  assert.strictEqual(P.judge({ spot: 4, power: 0.95 }, 0), "over");
  assert.strictEqual(P.judge({ spot: 1, power: 0.95 }, 0), "bar");
});

test("judge: same spot saves, a neighbour saves only a weak shot, elsewhere is a goal", () => {
  assert.strictEqual(P.judge({ spot: 2, power: 0.7 }, 2), "save");
  assert.strictEqual(P.judge({ spot: 2, power: 0.7 }, 5), "goal", "green beats a neighbour");
  assert.strictEqual(P.judge({ spot: 2, power: 0.3 }, 5), "save", "weak loses to a neighbour");
  assert.strictEqual(P.judge({ spot: 2, power: 0.3 }, 0), "goal", "weak still scores past a far dive");
});

test("shootout: ends early once one side cannot catch up", () => {
  // A scores 3, B misses 3: after A's 3rd and B's 3rd, B has 2 left, cannot reach 3.
  const s = P.shootout(["goal", "save", "goal", "save", "goal", "save"]);
  assert.deepStrictEqual([s.a, s.b, s.done, s.winner], [3, 0, true, "a"]);
});

test("shootout: level after five goes to sudden death, decided in a round", () => {
  const five = ["goal", "goal", "save", "save", "goal", "goal", "goal", "goal", "save", "save"];
  let s = P.shootout(five);
  assert.deepStrictEqual([s.a, s.b, s.done, s.next], [3, 3, false, "a"]);
  s = P.shootout(five.concat(["goal", "save"]));
  assert.deepStrictEqual([s.done, s.winner, s.round], [true, "a", 6]);
  s = P.shootout(five.concat(["goal"]));
  assert.strictEqual(s.done, false, "B still has their sudden-death kick");
});

test("shootout: still level after three bonus rounds is a draw", () => {
  const k = [];
  for (let i = 0; i < P.REG + P.BONUS; i++) k.push("goal", "goal");
  const s = P.shootout(k);
  assert.deepStrictEqual([s.done, s.winner, s.a, s.b], [true, "draw", 8, 8]);
});

test("daily dives: same for one Lagos day, different the next, always 0-5", () => {
  const a = P.dailyDives("k".repeat(32), "2026-10-08"), b = P.dailyDives("k".repeat(32), "2026-10-08");
  const c = P.dailyDives("k".repeat(32), "2026-10-09");
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  assert.strictEqual(a.length, 5);
  assert.ok(a.every((d) => Number.isInteger(d) && d >= 0 && d < 6));
});

test("lagosDay rolls at 23:00 UTC", () => {
  assert.strictEqual(P.lagosDay(Date.parse("2026-10-08T22:59:59Z")), "2026-10-08");
  assert.strictEqual(P.lagosDay(Date.parse("2026-10-08T23:00:00Z")), "2026-10-09");
});

test("cleanName keeps letters, numbers and spaces, max 16, else null", () => {
  assert.strictEqual(P.cleanName("  Tobi  "), "Tobi");
  assert.strictEqual(P.cleanName("<img src=x onerror=alert(1)>"), "img srcx onerror");
  assert.strictEqual(P.cleanName("Adé Okafor 9"), "Adé Okafor 9");
  assert.strictEqual(P.cleanName("😤😤"), null);
  assert.strictEqual(P.cleanName("x".repeat(40)).length, 16);
  assert.strictEqual(P.cleanName(42), null);
});

test("ids: six unambiguous characters", () => {
  for (let i = 0; i < 50; i++) assert.match(P.newId(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});

test("validPick and validDive refuse anything outside the board", () => {
  assert.ok(P.validPick({ spot: 5, power: 0.5 }));
  assert.ok(!P.validPick({ spot: 6, power: 0.5 }));
  assert.ok(!P.validPick({ spot: 1, power: 1.5 }));
  assert.ok(!P.validPick({ spot: "1", power: 0.5 }));
  assert.ok(P.validDive(0) && !P.validDive(-1) && !P.validDive(2.5));
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/penalty-rules.test.js`
Expected: FAIL, `Cannot find module '../lib/penalty.js'`.

- [ ] **Step 3: Implement**

```js
// lib/penalty.js
"use strict";
/* PENALTY WAHALA - the rules, and nothing else. Pure functions: the API judges
   every contested kick with these, the page uses the same copy for the
   challenger's practice match, and the tests pin them. See
   docs/specs/2026-10-08-penalty-wahala-design.md section 3. */
const crypto = require("crypto");

const SPOTS = 6;                 // col = s % 3 (0 left, 1 middle, 2 right); high = s >= 3
const REG = 5, BONUS = 3;
/* Tuning, set by play-testing on a phone. Below weakBelow the shot is weak;
   above overAbove it sails over (high) or hits the bar (low). */
const ZONES = { weakBelow: 0.55, overAbove: 0.88 };

const col = (s) => s % 3;
const high = (s) => s >= 3;

function strike(spot, power) {
  const kind = power > ZONES.overAbove ? "over" : power < ZONES.weakBelow ? "weak" : "green";
  return { spot, kind };
}
function neighbour(a, b) {
  if (a === b) return false;
  if (col(a) === col(b)) return true;                       // other height, same column
  return high(a) === high(b) && Math.abs(col(a) - col(b)) === 1;
}
function judge(shot, dive) {
  const s = strike(shot.spot, shot.power);
  if (s.kind === "over") return high(s.spot) ? "over" : "bar";
  if (dive === s.spot) return "save";
  if (s.kind === "weak" && neighbour(dive, s.spot)) return "save";
  return "goal";
}
/* Outcomes alternate A, B, A, B... Regulation is five each and ends early once
   the trailing side cannot catch up; then up to BONUS rounds of sudden death;
   still level after that is a draw. */
function shootout(outcomes) {
  let a = 0, b = 0;
  const n = outcomes.length;
  for (let i = 0; i < n; i++) if (outcomes[i] === "goal") { if (i % 2 === 0) a++; else b++; }
  const takenA = Math.ceil(n / 2), takenB = Math.floor(n / 2);
  const round = Math.max(takenA, 1);
  const res = (done, winner) => ({ a, b, done, winner, next: done ? null : (n % 2 === 0 ? "a" : "b"), round });
  if (takenA <= REG && takenB <= REG) {
    const leftA = REG - takenA, leftB = REG - takenB;
    if (a > b + leftB) return res(true, "a");
    if (b > a + leftA) return res(true, "b");
    if (takenA < REG || takenB < REG) return res(false, null);
    if (a !== b) return res(true, a > b ? "a" : "b");
    return res(false, null);
  }
  if (takenA !== takenB) return res(false, null);          // B still to kick this round
  if (a !== b) return res(true, a > b ? "a" : "b");
  if (takenA >= REG + BONUS) return res(true, "draw");
  return res(false, null);
}
function dailyDives(key, day) {
  const h = crypto.createHmac("sha256", key).update("daily:" + day).digest();
  return [0, 1, 2, 3, 4].map((i) => h[i] % SPOTS);
}
function cleanName(s) {
  if (typeof s !== "string") return null;
  const t = s.normalize("NFC").replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16).trim();
  return t ? t : null;
}
function lagosDay(ms) { return new Date(ms + 3600000).toISOString().slice(0, 10); }
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newId() {
  const b = crypto.randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHA[b[i] % ALPHA.length];
  return s;
}
const validDive = (d) => Number.isInteger(d) && d >= 0 && d < SPOTS;
const validPick = (x) => !!x && validDive(x.spot) && typeof x.power === "number" && x.power >= 0 && x.power <= 1;

module.exports = { SPOTS, REG, BONUS, ZONES, strike, neighbour, judge, shootout, dailyDives,
  cleanName, lagosDay, newId, validPick, validDive, ALPHA };
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/penalty-rules.test.js`
Expected: all pass. If `"img srcx onerror"` differs, check `cleanName` drops `<`, `=`, `(`, `)`, `>` and collapses spaces; fix the code, not the test.

- [ ] **Step 5: Mutation check**

Temporarily change `neighbour(dive, s.spot)` to `false` in `judge`; run the tests; the "weak loses to a neighbour" test must fail. Revert.

- [ ] **Step 6: Commit**

```bash
git add lib/penalty.js test/penalty-rules.test.js
git commit -m "Penalty Wahala: the rules (strike, judge, shootout, daily dives)"
```

---

### Task 2: Tables and data access

**Files:**
- Create: `sql/penalty.sql`, `lib/penaltydb.js`
- Test: `test/penalty-db.test.js`

**Interfaces:**
- Consumes: `call`, `headers` from `lib/supabase.js` (`call(path, init) -> {ok, body} | {ok:false, why}`).
- Produces (all async):
  - `createMatch(row) -> boolean` - row fields: `id, challenger_name, challenger_device, ch_shots (8 × {spot,power}), ch_dives (8 ints), expires_at`.
  - `getMatch(id) -> row | null` (all columns).
  - `appendKick(id, n, kicks, patch) -> boolean` - writes `friend_kicks = kicks, kicks_n = n + 1` plus `patch` only where `kicks_n = n`; false when another write got there first.
  - `getPlay(day, device) -> row | null`; `putPlay(row, prevLen) -> boolean` (insert when `prevLen === 0`, else update where `shots_n = prevLen`).
  - `rankFor(day, score) -> { below: int, total: int } | null` (counts of finished plays that day).
  - `mine(device, sinceIso) -> row[]` (finished matches the device created, newest first, max 5; only `id, friend_name, result, finished_at`).

- [ ] **Step 1: Write `sql/penalty.sql`**

```sql
-- Penalty Wahala (docs/specs/2026-10-08-penalty-wahala-design.md). Server key
-- only: RLS on, no policies, like every other table here.
create table if not exists penalty_matches (
  id text primary key check (id ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  challenger_name text not null,
  challenger_device text not null,
  ch_shots jsonb not null,
  ch_dives jsonb not null,
  friend_name text,
  friend_device text,
  friend_kicks jsonb not null default '[]'::jsonb,
  kicks_n int not null default 0,
  result jsonb,
  finished_at timestamptz
);
create index if not exists penalty_matches_mine on penalty_matches (challenger_device, finished_at desc);
alter table penalty_matches enable row level security;

create table if not exists penalty_daily_plays (
  day date not null,
  device text not null,
  shots jsonb not null default '[]'::jsonb,
  shots_n int not null default 0,
  score int,
  primary key (day, device)
);
create index if not exists penalty_daily_rank on penalty_daily_plays (day, score);
alter table penalty_daily_plays enable row level security;
```

- [ ] **Step 2: Write the failing tests** (a fake `call` records requests)

```js
// test/penalty-db.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Module = require("module");

/* Swap lib/supabase.js for a recorder before loading the module under test. */
const calls = [];
let reply = { ok: true, body: [] };
const fake = { call: async (p, init) => { calls.push({ p, init }); return typeof reply === "function" ? reply(p, init) : reply; },
  headers: (x) => Object.assign({ apikey: "k" }, x || {}) };
const real = Module._load;
Module._load = function (req, parent, isMain) {
  if (/supabase\.js$/.test(req)) return fake;
  return real.apply(this, arguments);
};
const D = require("../lib/penaltydb.js");
Module._load = real;

test("appendKick only writes where kicks_n still equals n", async () => {
  calls.length = 0; reply = { ok: true, body: [{ id: "ABCDEF" }] };
  assert.strictEqual(await D.appendKick("ABCDEF", 3, ["goal"], { friend_name: "Ada" }), true);
  assert.match(calls[0].p, /^penalty_matches\?id=eq\.ABCDEF&kicks_n=eq\.3$/);
  assert.strictEqual(calls[0].init.method, "PATCH");
  const body = JSON.parse(calls[0].init.body);
  assert.deepStrictEqual([body.kicks_n, body.friend_name], [4, "Ada"]);
  reply = { ok: true, body: [] };
  assert.strictEqual(await D.appendKick("ABCDEF", 3, [], {}), false, "nothing updated = lost the race");
});

test("getMatch refuses an id that is not six board characters, without a request", async () => {
  calls.length = 0;
  assert.strictEqual(await D.getMatch("abc'); drop"), null);
  assert.strictEqual(calls.length, 0);
});

test("rankFor counts below and total", async () => {
  const seen = [];
  D._count = async (q) => { seen.push(q); return /score=lt\.4/.test(q) ? 7 : 10; };
  assert.deepStrictEqual(await D.rankFor("2026-10-08", 4), { below: 7, total: 10 });
  assert.ok(seen.every((q) => /day=eq\.2026-10-08&score=not\.is\.null/.test(q)));
});

test("putPlay inserts the first shot and updates later ones only from the expected length", async () => {
  calls.length = 0; reply = { ok: true, body: [{ day: "2026-10-08" }] };
  await D.putPlay({ day: "2026-10-08", device: "d1", shots: [{}], shots_n: 1 }, 0);
  assert.strictEqual(calls[0].init.method, "POST");
  await D.putPlay({ day: "2026-10-08", device: "d1", shots: [{}, {}], shots_n: 2 }, 1);
  assert.strictEqual(calls[1].init.method, "PATCH");
  assert.match(calls[1].p, /shots_n=eq\.1/);
});
```

`rankFor` needs row counts. PostgREST returns them in `Content-Range` when asked with `Prefer: count=exact`, and `lib/supabase.js`'s `call` does not expose headers, so `lib/penaltydb.js` has its own small `count()` (below), exported as `_count` so the test can replace it.

- [ ] **Step 3: Implement `lib/penaltydb.js`**

```js
// lib/penaltydb.js
"use strict";
/* Data access for Penalty Wahala. Every value that reaches a URL is checked
   (ids against the board alphabet, devices against UUID shape, days against
   YYYY-MM-DD) and encodeURIComponent'd. */
const { call, headers } = require("./supabase.js");
const enc = encodeURIComponent;
const ID_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
const DEV_RE = /^[0-9a-f-]{36}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const J = (extra) => headers(Object.assign({ "Content-Type": "application/json" }, extra || {}));

async function createMatch(row) {
  const r = await call("penalty_matches", { method: "POST", headers: J({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  return r.ok;
}
async function getMatch(id) {
  if (!ID_RE.test(String(id))) return null;
  const r = await call("penalty_matches?id=eq." + enc(id) + "&select=*", { headers: J() });
  return r.ok && Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
}
async function appendKick(id, n, kicks, patch) {
  if (!ID_RE.test(String(id))) return false;
  const body = Object.assign({}, patch, { friend_kicks: kicks, kicks_n: n + 1 });
  const r = await call("penalty_matches?id=eq." + enc(id) + "&kicks_n=eq." + (n | 0),
    { method: "PATCH", headers: J({ Prefer: "return=representation" }), body: JSON.stringify(body) });
  return r.ok && Array.isArray(r.body) && r.body.length === 1;
}
async function getPlay(day, device) {
  if (!DAY_RE.test(day) || !DEV_RE.test(device)) return null;
  const r = await call("penalty_daily_plays?day=eq." + enc(day) + "&device=eq." + enc(device) + "&select=*", { headers: J() });
  return r.ok && Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
}
async function putPlay(row, prevLen) {
  if (!DAY_RE.test(row.day) || !DEV_RE.test(row.device)) return false;
  if (prevLen === 0) {
    const r = await call("penalty_daily_plays", { method: "POST", headers: J({ Prefer: "return=representation" }), body: JSON.stringify(row) });
    return r.ok;
  }
  const r = await call("penalty_daily_plays?day=eq." + enc(row.day) + "&device=eq." + enc(row.device) + "&shots_n=eq." + (prevLen | 0),
    { method: "PATCH", headers: J({ Prefer: "return=representation" }), body: JSON.stringify({ shots: row.shots, shots_n: row.shots_n, score: row.score == null ? null : row.score }) });
  return r.ok && Array.isArray(r.body) && r.body.length === 1;
}
/* A count, not rows: PostgREST answers HEAD with Prefer count=exact in
   Content-Range ("*\/10"). Kept here because lib/supabase.js's call() returns
   bodies, not headers. Tests replace it through module.exports._count. */
async function count(path) {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  try {
    const r = await fetch(base + "/rest/v1/" + path, { method: "HEAD", headers: J({ Prefer: "count=exact" }) });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
    return r.ok && m ? +m[1] : null;
  } catch (e) { return null; }
}
async function rankFor(day, score) {
  if (!DAY_RE.test(day)) return null;
  const q = "penalty_daily_plays?day=eq." + enc(day) + "&score=not.is.null";
  const [below, total] = await Promise.all([module.exports._count(q + "&score=lt." + (score | 0)), module.exports._count(q)]);
  return below == null || total == null ? null : { below, total };
}
async function mine(device, sinceIso) {
  if (!DEV_RE.test(device)) return [];
  const r = await call("penalty_matches?challenger_device=eq." + enc(device) + "&finished_at=gt." + enc(sinceIso) +
    "&select=id,friend_name,result,finished_at&order=finished_at.desc&limit=5", { headers: J() });
  return r.ok && Array.isArray(r.body) ? r.body : [];
}

module.exports = { createMatch, getMatch, appendKick, getPlay, putPlay, rankFor, mine, _count: count, ID_RE, DEV_RE };
```

- [ ] **Step 4: Run the tests**

Run: `node --test test/penalty-db.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add sql/penalty.sql lib/penaltydb.js test/penalty-db.test.js
git commit -m "Penalty Wahala: tables and data access"
```

---

### Task 3: The API (`api/penalty.js`)

**Files:**
- Create: `api/penalty.js`
- Modify: `vercel.json` (add `"api/penalty.js": { "maxDuration": 10, "includeFiles": "public/predictions.json" }` under `functions`)
- Test: `test/penalty-api.test.js`

**Interfaces:**
- Consumes: `lib/penalty.js` (Task 1), `lib/penaltydb.js` (Task 2), `lib/auth/http.js` (`guardPost`, `readJson`, `ipKey`, `sendJson`), `lib/report.js` (`report(err, ctx)`), `db.rlHit` from `lib/auth/db.js`.
- Produces HTTP routes on `/api/penalty?a=<action>`:
  - `POST a=create` body `{name, device, shots: 8×{spot,power}, dives: 8 ints}` -> `200 {id}`; `400 {error:"bad"}`; `429 {error:"slow_down"}`.
  - `GET a=match&id=X` -> `200 {id, challenger, friend, outcomes: string[], score:{a,b}, done, winner, next, expired}` - never `ch_shots`/`ch_dives`.
  - `POST a=kick` body `{id, device, name?, kind:"shot"|"dive", spot, power?}` -> `200 {outcome, against?: {spot, kind}, state}`; `409 {error:"turn"|"taken"|"busy"}`; `410 {error:"expired"}`; `404 {error:"not_found"}`.
  - `POST a=daily` body `{device, i, spot, power}` -> `200 {outcome, i, done, score?, better?, day}`; `409 {error:"turn"}`.
  - `GET a=mine&device=D` -> `200 {results: [{id, friend, won, score}]}`.
  - `GET a=tips` -> `200 {home, away, tip, pct, league} | {}`.
- Kick order (friend is side A, challenger side B, matching `shootout`): outcome index `k`; even `k` = friend's shot `k/2` against `ch_dives[k/2]`; odd `k` = challenger's shot `(k-1)/2` from `ch_shots` against the friend's dive.

- [ ] **Step 1: Write the failing tests**

```js
// test/penalty-api.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { fakeRes } = require("./helpers/fakes.js");
const { ORIGIN } = require("../lib/auth/http.js");
const P = require("../lib/penalty.js");
process.env.PENALTY_KEY = "k".repeat(32);
const { make } = require("../api/penalty.js");

const DEV1 = "11111111-1111-4111-8111-111111111111", DEV2 = "22222222-2222-4222-8222-222222222222", DEV3 = "33333333-3333-4333-8333-333333333333";
function fakeDb() {
  const t = { m: {}, plays: {}, rl: {} };
  return { t,
    async rlHit(k, w, l) { t.rl[k] = (t.rl[k] || 0) + 1; return t.rl[k] <= l; },
    async createMatch(r) { if (t.m[r.id]) return false; t.m[r.id] = Object.assign({ friend_kicks: [], kicks_n: 0, friend_device: null, friend_name: null, result: null, finished_at: null }, JSON.parse(JSON.stringify(r))); return true; },
    async getMatch(id) { return t.m[id] ? JSON.parse(JSON.stringify(t.m[id])) : null; },
    async appendKick(id, n, kicks, patch) { const m = t.m[id]; if (!m || m.kicks_n !== n) return false; Object.assign(m, patch, { friend_kicks: kicks, kicks_n: n + 1 }); return true; },
    async getPlay(d, dev) { const p = t.plays[d + dev]; return p ? JSON.parse(JSON.stringify(p)) : null; },
    async putPlay(r, prev) { const cur = t.plays[r.day + r.device]; if ((cur ? cur.shots_n : 0) !== prev) return false; t.plays[r.day + r.device] = JSON.parse(JSON.stringify(r)); return true; },
    async rankFor(day, s) { const all = Object.values(t.plays).filter((p) => p.day === day && p.score != null); return { below: all.filter((p) => p.score < s).length, total: all.length }; },
    async mine(dev) { return Object.values(t.m).filter((m) => m.challenger_device === dev && m.finished_at).map((m) => ({ id: m.id, friend_name: m.friend_name, result: m.result, finished_at: m.finished_at })); },
  };
}
function world() {
  let T = Date.parse("2026-10-08T10:00:00Z");
  const db = fakeDb();
  const handler = make({ db, now: () => T, tips: () => ({ home: "PSV", away: "Heerenveen", tip: "Over 1.5", pct: 82, league: "Eredivisie" }) });
  const H = { "x-sw-request": "1", origin: ORIGIN, "x-forwarded-for": "1.2.3.4" };
  const call = async (method, a, body, q) => { const res = fakeRes();
    await handler({ method, headers: H, query: Object.assign({ a }, q || {}), body: body || {} }, res); return res; };
  return { db, call, advance: (ms) => { T += ms; } };
}
const shots = (spots, power) => spots.map((s) => ({ spot: s, power }));
async function create(w) {
  const r = await w.call("POST", "create", { name: "Tobi", device: DEV1,
    shots: shots([0, 1, 2, 3, 4, 5, 0, 1], 0.7), dives: [5, 5, 5, 5, 5, 5, 5, 5] });
  assert.strictEqual(r.code, 200, r.body); return r.json().id;
}

test("create stores the picks and never returns them", async () => {
  const w = world(); const id = await create(w);
  const m = await w.call("GET", "match", null, { id });
  const j = m.json();
  assert.strictEqual(j.challenger, "Tobi");
  assert.ok(!("ch_shots" in j) && !("ch_dives" in j) && !/"spot"/.test(m.body), "no pick leaks");
});

test("create refuses bad picks and bad names", async () => {
  const w = world();
  const bad = await w.call("POST", "create", { name: "Tobi", device: DEV1, shots: shots([0, 1, 2], 0.7), dives: [1, 2, 3] });
  assert.strictEqual(bad.code, 400);
  const noName = await w.call("POST", "create", { name: "😤", device: DEV1, shots: shots([0, 1, 2, 3, 4, 5, 0, 1], 0.7), dives: [0, 0, 0, 0, 0, 0, 0, 0] });
  assert.strictEqual(noName.code, 400);
});

test("kicks alternate shot then dive, and a dive reveals only the shot just taken", async () => {
  const w = world(); const id = await create(w);
  const s1 = await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  assert.strictEqual(s1.json().outcome, "goal");                     // challenger dived 5
  const wrong = await w.call("POST", "kick", { id, device: DEV2, kind: "shot", spot: 0, power: 0.7 });
  assert.strictEqual(wrong.code, 409); assert.strictEqual(wrong.json().error, "turn");
  const d1 = await w.call("POST", "kick", { id, device: DEV2, kind: "dive", spot: 0 });
  assert.deepStrictEqual([d1.json().outcome, d1.json().against.spot], ["save", 0]);
  assert.ok(!/"spot":1/.test(d1.body), "the next shot is not revealed");
});

test("a second phone cannot kick in a challenge someone else started", async () => {
  const w = world(); const id = await create(w);
  await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  const other = await w.call("POST", "kick", { id, device: DEV3, name: "Bola", kind: "dive", spot: 0 });
  assert.strictEqual(other.code, 409); assert.strictEqual(other.json().error, "taken");
});

test("a raced kick is refused, not counted twice", async () => {
  const w = world(); const id = await create(w);
  const [a, b] = await Promise.all([
    w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 }),
    w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 })]);
  assert.deepStrictEqual([a.code, b.code].sort(), [200, 409]);
  assert.strictEqual(w.db.t.m[id].friend_kicks.length, 1);
});

test("an unstarted challenge expires after 24h; a started one can be finished", async () => {
  const w = world(); const id = await create(w);
  const id2 = await create(w);
  await w.call("POST", "kick", { id: id2, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
  w.advance(25 * 3600e3);
  assert.strictEqual((await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 })).code, 410);
  assert.strictEqual((await w.call("POST", "kick", { id: id2, device: DEV2, kind: "dive", spot: 3 })).code, 200);
});

test("a finished challenge records the result for the challenger", async () => {
  const w = world(); const id = await create(w);
  // Friend scores everything (challenger always dives 5, friend shoots 0); friend saves nothing.
  let r;
  for (let i = 0; i < 5; i++) {
    r = await w.call("POST", "kick", { id, device: DEV2, name: "Ada", kind: "shot", spot: 0, power: 0.7 });
    if (r.json().state.done) break;
    r = await w.call("POST", "kick", { id, device: DEV2, kind: "dive", spot: 4 });
    if (r.json().state.done) break;
  }
  assert.strictEqual(r.json().state.done, true);
  const mine = await w.call("GET", "mine", null, { device: DEV1 });
  assert.strictEqual(mine.json().results[0].friend, "Ada");
});

test("daily: shots in order, scored once per device per day, dives never sent", async () => {
  const w = world();
  const dives = P.dailyDives(process.env.PENALTY_KEY, "2026-10-08");
  let r;
  for (let i = 0; i < 5; i++) {
    r = await w.call("POST", "daily", { device: DEV1, i, spot: (dives[i] + 2) % 6, power: 0.7 });
    assert.strictEqual(r.code, 200, r.body);
    assert.ok(!("dive" in r.json()) || i === 4);
  }
  assert.strictEqual(r.json().done, true);
  assert.strictEqual(typeof r.json().score, "number");
  const again = await w.call("POST", "daily", { device: DEV1, i: 0, spot: 0, power: 0.7 });
  assert.strictEqual(again.code, 409, "a finished day cannot be replayed");
  const skip = await w.call("POST", "daily", { device: DEV2, i: 1, spot: 0, power: 0.7 });
  assert.strictEqual(skip.code, 409, "shot 1 before shot 0 is refused");
});

test("daily: a go started before Lagos midnight finishes against that day's keeper", async () => {
  const w = world();
  w.advance(Date.parse("2026-10-08T22:59:00Z") - Date.parse("2026-10-08T10:00:00Z"));
  const r0 = await w.call("POST", "daily", { device: DEV1, i: 0, spot: 0, power: 0.7 });
  w.advance(120e3);                                                  // now 23:01Z = 9 Oct in Lagos
  const r1 = await w.call("POST", "daily", { device: DEV1, i: 1, spot: 0, power: 0.7, day: r0.json().day });
  assert.strictEqual(r1.code, 200);
  assert.strictEqual(r1.json().day, "2026-10-08");
});

test("POST without the site's header or origin is refused", async () => {
  const w = world(); const res = fakeRes();
  await make({ db: w.db, now: Date.now })({ method: "POST", headers: {}, query: { a: "create" }, body: {} }, res);
  assert.strictEqual(res.code, 403);
});

test("tips returns the pick of the day summary", async () => {
  const w = world();
  assert.deepStrictEqual((await w.call("GET", "tips")).json(), { home: "PSV", away: "Heerenveen", tip: "Over 1.5", pct: 82, league: "Eredivisie" });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/penalty-api.test.js`
Expected: FAIL, `Cannot find module '../api/penalty.js'`.

- [ ] **Step 3: Implement**

```js
// api/penalty.js
"use strict";
/* PENALTY WAHALA - every contested kick is judged here, so nothing a player
   could read in the page or the network tab tells them a pick early. See
   docs/specs/2026-10-08-penalty-wahala-design.md sections 3-4 and
   docs/plans/2026-10-08-penalty-wahala.md Task 3. */
const P = require("../lib/penalty.js");
const H = require("../lib/auth/http.js");

const DAY_MS = 864e5;
const REG_LEN = P.REG + P.BONUS;           // 8 stored shots and 8 stored dives
const DEV_RE = /^[0-9a-f-]{36}$/;

function make(deps) {
  const db = deps.db, now = deps.now || Date.now;
  const key = () => process.env.PENALTY_KEY || "";
  const report = deps.report || (async () => {});
  const tips = deps.tips || defaultTips;
  const bad = (res) => H.sendJson(res, 400, { error: "bad" });

  function publicState(m, t) {
    const s = P.shootout(m.friend_kicks.map((k) => k.outcome));
    return { id: m.id, challenger: m.challenger_name, friend: m.friend_name, outcomes: m.friend_kicks.map((k) => k.outcome),
      score: { a: s.a, b: s.b }, done: s.done, winner: s.winner, next: s.next,
      expired: !m.friend_kicks.length && Date.parse(m.expires_at) <= t };
  }

  const routes = {
    async create(req, res, t) {
      const b = await H.readJson(req, 4096);
      const name = b && P.cleanName(b.name);
      if (!b || !name || !DEV_RE.test(String(b.device)) || !Array.isArray(b.shots) || !Array.isArray(b.dives) ||
          b.shots.length !== REG_LEN || b.dives.length !== REG_LEN || !b.shots.every(P.validPick) || !b.dives.every(P.validDive)) return bad(res);
      if (!(await db.rlHit("pw:c:" + H.ipKey(req), 3600, 30))) return H.sendJson(res, 429, { error: "slow_down" });
      for (let tries = 0; tries < 3; tries++) {
        const id = P.newId();
        const ok = await db.createMatch({ id, challenger_name: name, challenger_device: b.device,
          ch_shots: b.shots.map((s) => ({ spot: s.spot, power: s.power })), ch_dives: b.dives,
          expires_at: new Date(t + DAY_MS).toISOString() });
        if (ok) return H.sendJson(res, 200, { id });
      }
      return H.sendJson(res, 500, { error: "server" });
    },
    async match(req, res, t) {
      const m = await db.getMatch(String((req.query || {}).id || "").toUpperCase());
      if (!m) return H.sendJson(res, 404, { error: "not_found" });
      return H.sendJson(res, 200, publicState(m, t));
    },
    async kick(req, res, t) {
      const b = await H.readJson(req, 1024);
      if (!b || !DEV_RE.test(String(b.device)) || (b.kind !== "shot" && b.kind !== "dive")) return bad(res);
      if (!(await db.rlHit("pw:k:" + H.ipKey(req), 3600, 600))) return H.sendJson(res, 429, { error: "slow_down" });
      const m = await db.getMatch(String(b.id || "").toUpperCase());
      if (!m) return H.sendJson(res, 404, { error: "not_found" });
      const n = m.friend_kicks.length;
      if (!n && Date.parse(m.expires_at) <= t) return H.sendJson(res, 410, { error: "expired" });
      if (m.friend_device && m.friend_device !== b.device) return H.sendJson(res, 409, { error: "taken" });
      if (m.challenger_device === b.device) return H.sendJson(res, 409, { error: "taken" });
      const before = P.shootout(m.friend_kicks.map((k) => k.outcome));
      if (before.done) return H.sendJson(res, 409, { error: "turn" });
      const wantShot = n % 2 === 0, round = Math.floor(n / 2);
      if ((b.kind === "shot") !== wantShot || round >= REG_LEN) return H.sendJson(res, 409, { error: "turn" });
      let outcome, against;
      if (wantShot) {
        const shot = { spot: b.spot, power: b.power };
        if (!P.validPick(shot)) return bad(res);
        outcome = P.judge(shot, m.ch_dives[round]);
      } else {
        if (!P.validDive(b.spot)) return bad(res);
        const cs = m.ch_shots[round];
        outcome = P.judge(cs, b.spot);
        against = P.strike(cs.spot, cs.power);
      }
      const kicks = m.friend_kicks.concat([{ kind: b.kind, spot: b.spot, outcome }]);
      const after = P.shootout(kicks.map((k) => k.outcome));
      const patch = {};
      if (!n) { const nm = P.cleanName(b.name); if (!nm) return bad(res); patch.friend_name = nm; patch.friend_device = b.device; }
      if (after.done) { patch.result = { a: after.a, b: after.b, winner: after.winner }; patch.finished_at = new Date(t).toISOString(); }
      if (!(await db.appendKick(m.id, n, kicks, patch))) return H.sendJson(res, 409, { error: "busy" });
      const out = { outcome, state: { score: { a: after.a, b: after.b }, done: after.done, winner: after.winner, next: after.next } };
      if (against) out.against = against;
      return H.sendJson(res, 200, out);
    },
    async daily(req, res, t) {
      const b = await H.readJson(req, 512);
      if (!b || !DEV_RE.test(String(b.device)) || !Number.isInteger(b.i) || b.i < 0 || b.i >= P.REG) return bad(res);
      const shot = { spot: b.spot, power: b.power };
      if (!P.validPick(shot)) return bad(res);
      if (key().length < 32) return H.sendJson(res, 503, { error: "not_configured" });
      if (!(await db.rlHit("pw:d:" + H.ipKey(req), 3600, 300))) return H.sendJson(res, 429, { error: "slow_down" });
      /* The day is fixed by the first shot: a go started before Lagos midnight
         finishes against that day's keeper. */
      const today = P.lagosDay(t), yesterday = P.lagosDay(t - DAY_MS);
      const day = b.i > 0 && (b.day === today || b.day === yesterday) ? b.day : today;
      const play = await db.getPlay(day, b.device);
      const shots = play ? play.shots : [];
      if (shots.length !== b.i || (play && play.score != null)) return H.sendJson(res, 409, { error: "turn" });
      const dives = P.dailyDives(key(), day);
      const outcome = P.judge(shot, dives[b.i]);
      const next = shots.concat([{ spot: b.spot, power: b.power, outcome }]);
      const done = next.length === P.REG;
      const score = done ? next.filter((s) => s.outcome === "goal").length : null;
      if (!(await db.putPlay({ day, device: b.device, shots: next, shots_n: next.length, score }, shots.length)))
        return H.sendJson(res, 409, { error: "busy" });
      const out = { outcome, i: b.i, done, day };
      if (done) {
        out.score = score;
        const r = await db.rankFor(day, score);
        out.better = r && r.total > 1 ? Math.round(100 * r.below / (r.total - 1)) : null;
      }
      return H.sendJson(res, 200, out);
    },
    async mine(req, res, t) {
      const dev = String((req.query || {}).device || "");
      if (!DEV_RE.test(dev)) return bad(res);
      const rows = await db.mine(dev, new Date(t - 7 * DAY_MS).toISOString());
      return H.sendJson(res, 200, { results: rows.map((r) => ({ id: r.id, friend: r.friend_name,
        won: r.result && r.result.winner === "b", draw: r.result && r.result.winner === "draw",
        score: r.result ? { you: r.result.b, them: r.result.a } : null })) });
    },
    async tips(req, res) { return H.sendJson(res, 200, tips() || {}); },
  };
  const POSTS = new Set(["create", "kick", "daily"]);

  return async function handler(req, res) {
    const a = String((req.query || {}).a || "");
    if (!Object.prototype.hasOwnProperty.call(routes, a)) return H.sendJson(res, 404, { error: "not_found" });
    if (POSTS.has(a)) { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); }
    else if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" });
    try { return await routes[a](req, res, now()); }
    catch (e) { await report(e, { route: "penalty/" + a }); return H.sendJson(res, 500, { error: "server" }); }
  };
}

/* Today's pick of the day, read from the payload this deploy shipped with
   (includeFiles in vercel.json). The payload records potd as {id, home, away,
   date}; the tip and its probability live on the fixture. */
let TIPS = null;
function defaultTips() {
  if (TIPS) return TIPS;
  try {
    const d = require("../public/predictions.json");
    const p = d.potd || {};
    const f = (d.fixtures || []).find((x) => x.home === p.home && x.away === p.away && x.date === p.date);
    TIPS = f ? { home: f.home, away: f.away, tip: f.tip, pct: Math.round(f.tip_p * 100), league: f.league } : {};
  } catch (e) { TIPS = {}; }
  return TIPS;
}

module.exports = make({ db: Object.assign({}, require("../lib/penaltydb.js"), { rlHit: require("../lib/auth/db.js").rlHit }),
  report: (e, c) => require("../lib/report.js").report(e, c) });
module.exports.make = make;
```

Before writing the last two lines, confirm `lib/report.js` exports `report` (`grep -n "module.exports" lib/report.js`) and adjust the require if it is named differently.

- [ ] **Step 4: Add the function config to `vercel.json`** (Edit tool; keep CRLF)

Under `"functions": {`, add:

```json
    "api/penalty.js": {
      "maxDuration": 10,
      "includeFiles": "public/predictions.json"
    },
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/penalty-api.test.js`
Expected: all pass. The "raced kick" test depends on the fake `appendKick` checking `kicks_n`; if both succeed, the handler is not passing `n` from the row it read.

- [ ] **Step 6: Mutation checks**

1. Change `if (m.friend_device && m.friend_device !== b.device)` to `if (false)`; the "second phone" test must fail. Revert.
2. Change `const day = b.i > 0 && ... ? b.day : today;` to `const day = today;`; the "Lagos midnight" test must fail. Revert.

- [ ] **Step 7: Commit**

```bash
git add api/penalty.js vercel.json test/penalty-api.test.js
git commit -m "Penalty Wahala: API - create, kick, daily, mine, tips"
```

---

### Task 4: The challenge link page (`api/p.js`)

**Files:**
- Create: `api/p.js`, `public/penalty/og.png` (copy of `public/og-card.png`)
- Modify: `vercel.json` rewrites (add `{ "source": "/p/:id", "destination": "/api/p?id=:id" }`)
- Test: `test/penalty-page.test.js`

**Interfaces:**
- Consumes: `lib/penaltydb.js` `getMatch`; `lib/penalty.js` `shootout`.
- Produces: `GET /p/:id` -> HTML. The page body is a tiny shell that redirects the browser to `/penalty?c=<ID>` (so the game owns the experience); crawlers read the tags. Exported `render(m, t) -> string` for tests.

- [ ] **Step 1: Write the failing tests**

```js
// test/penalty-page.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { render } = require("../api/p.js");

const base = { id: "K7Q2AB", challenger_name: "Tobi", friend_kicks: [], expires_at: "2026-10-09T10:00:00Z" };
const T = Date.parse("2026-10-08T12:00:00Z");

test("an open challenge previews the challenger on WhatsApp and X", () => {
  const h = render(base, T);
  assert.match(h, /<meta property="og:title" content="Tobi challenges you to a penalty shootout">/);
  assert.match(h, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(h, /og:image" content="https:\/\/www\.soccerwizard\.live\/penalty\/og\.png"/);
  assert.match(h, /location\.replace\("\/penalty\?c=K7Q2AB"\)/);
});

test("a finished challenge previews the score", () => {
  const m = Object.assign({}, base, { friend_name: "Ada", friend_kicks: ["goal", "save", "goal", "save", "goal", "save"].map((o) => ({ outcome: o })) });
  assert.match(render(m, T), /og:title" content="Ada beat Tobi 3-0 on Penalty Wahala"/);
});

test("an expired unstarted challenge says so", () => {
  assert.match(render(base, Date.parse("2026-10-10T00:00:00Z")), /This challenge ran out/);
});

test("names are escaped in every tag", () => {
  const h = render(Object.assign({}, base, { challenger_name: '"><script>x</script>' }), T);
  assert.doesNotMatch(h, /<script>x<\/script>/);
});

test("a missing challenge renders the not-found page", () => {
  assert.match(render(null, T), /This challenge doesn't exist/);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/penalty-page.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// api/p.js
"use strict";
/* GET /p/:id - the link a challenger shares. Server-rendered so WhatsApp and
   X preview who is challenging whom; a person is sent straight into the game
   at /penalty?c=<id>, which owns the experience. Same idea as api/s.js. */
const { applyCache, NO_STORE } = require("../lib/cachepolicy.js");
const D = require("../lib/penaltydb.js");
const P = require("../lib/penalty.js");

const ORIGIN = "https://www.soccerwizard.live";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function render(m, t) {
  let title, line, go;
  if (!m) { title = "Penalty Wahala"; line = "This challenge doesn't exist. Start your own."; go = "/penalty"; }
  else {
    const s = P.shootout(m.friend_kicks.map((k) => k.outcome));
    const ch = m.challenger_name, fr = m.friend_name;
    if (s.done && s.winner === "a") title = fr + " beat " + ch + " " + s.a + "-" + s.b + " on Penalty Wahala";
    else if (s.done && s.winner === "b") title = ch + " beat " + fr + " " + s.b + "-" + s.a + " on Penalty Wahala";
    else if (s.done) title = ch + " and " + fr + " drew " + s.a + "-" + s.b + " on Penalty Wahala";
    else title = ch + " challenges you to a penalty shootout";
    const expired = !m.friend_kicks.length && Date.parse(m.expires_at) <= t;
    line = expired ? "This challenge ran out. Start your own." : s.done ? "See how it went, then start your own." : "Take your 5 shots and make your 5 saves. Free, no stakes.";
    go = expired ? "/penalty" : "/penalty?c=" + m.id;
  }
  const url = ORIGIN + (m ? "/p/" + m.id : "/penalty"), img = ORIGIN + "/penalty/og.png";
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + esc(title) + "</title>" +
    "<meta name=\"description\" content=\"" + esc(line) + "\">" +
    "<meta property=\"og:title\" content=\"" + esc(title) + "\">" +
    "<meta property=\"og:description\" content=\"" + esc(line) + "\">" +
    "<meta property=\"og:image\" content=\"" + img + "\">" +
    "<meta property=\"og:url\" content=\"" + esc(url) + "\">" +
    "<meta property=\"og:site_name\" content=\"Soccerwizard\">" +
    "<meta name=\"twitter:card\" content=\"summary_large_image\">" +
    "<meta name=\"twitter:site\" content=\"@SoccerWizardhq\">" +
    "<meta name=\"twitter:title\" content=\"" + esc(title) + "\">" +
    "<meta name=\"twitter:image\" content=\"" + img + "\">" +
    "<meta name=\"robots\" content=\"noindex\">" +
    "<style>body{margin:0;background:#0D0D0F;color:#f3f3f5;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px}a{color:#E63946;font-weight:800}</style>" +
    "</head><body><div><h1>" + esc(title) + "</h1><p>" + esc(line) + "</p><p><a href=\"" + esc(go) + "\">Play</a></p></div>" +
    "<script>location.replace(" + JSON.stringify(go) + ")</script></body></html>";
}

module.exports = async function handler(req, res) {
  const id = String((req.query || {}).id || "").toUpperCase();
  const m = D.ID_RE.test(id) ? await D.getMatch(id) : null;
  applyCache(res, NO_STORE);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(m ? 200 : 404).end(render(m, Date.now()));
};
module.exports.render = render;
```

Confirm `NO_STORE` and `applyCache(res, policy)` match `lib/cachepolicy.js` (`grep -n "module.exports" lib/cachepolicy.js`); `api/s.js` imports the same names.

- [ ] **Step 4: Add the rewrite and the image**

`vercel.json` (Edit tool), inside `"rewrites": [`, after the `/s/:code` entry:

```json
    {
      "source": "/p/:id",
      "destination": "/api/p?id=:id"
    },
```

```bash
mkdir -p public/penalty && cp public/og-card.png public/penalty/og.png
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/penalty-page.test.js test/security-headers.test.js`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add api/p.js public/penalty/og.png vercel.json test/penalty-page.test.js
git commit -m "Penalty Wahala: /p/:id challenge page with WhatsApp and X previews"
```

---

### Task 5: The game page - scene, input and effects

**Files:**
- Create: `public/penalty.html`
- Test: `test/penalty-html.test.js`

**Interfaces:**
- Consumes: nothing from the server yet.
- Produces (globals inside the page script, used by Tasks 6-7):
  - `RULES` - a browser copy of `strike`, `neighbour`, `judge`, `shootout`, `ZONES`, `REG`, `BONUS` (inlined at build time is out of scope; copy the functions verbatim from `lib/penalty.js` and pin them with the test in Step 1).
  - `aimAndShoot() -> Promise<{spot, power}>` - waits for a spot tap, runs the power bar, resolves on the flick.
  - `pickDive() -> Promise<spot>` - waits for a spot tap.
  - `playKick({ who: "you"|"them", shot:{spot,kind}, dive, outcome }) -> Promise` - animates one kick with every effect.
  - `fx.pop(word)`, `fx.shake(level)`, `fx.slowmo(on)`, `fx.combo(n)`, `fx.buzz(ms)`.
  - `DEV` (device UUID in `localStorage["pw.dev"]`), `NAME` (`localStorage["pw.name"]`).

- [ ] **Step 1: Write the failing tests** (source-level, like the site's other HTML tests)

```js
// test/penalty-html.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const P = require("../lib/penalty.js");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "penalty.html"), "utf8");

test("the page stays light", () => {
  assert.ok(Buffer.byteLength(html) < 100 * 1024, "under 100KB before art");
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

test("the flick only times the shot", () => {
  assert.match(html, /function aimAndShoot\(/);
  assert.doesNotMatch(html, /dx[^;]*spot\s*=/, "swipe direction must never choose the spot");
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/penalty-html.test.js`
Expected: FAIL, `ENOENT ... penalty.html`.

- [ ] **Step 3: Write `public/penalty.html`**

Structure (write it in this order; CSS and markup are given in full, the script is given in full for the parts this task owns):

```html
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Penalty Wahala | Soccerwizard</title>
<meta name="description" content="A free penalty shootout. Beat your friends, face the Wizard Keeper every day.">
<meta property="og:title" content="Penalty Wahala">
<meta property="og:image" content="https://www.soccerwizard.live/penalty/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0D0D0F">
<style>
:root{--bg:#0D0D0F;--card:#16161A;--line:#2A2A30;--text:#F3F3F5;--soft:#A3A3AD;--red:#E63946;--gold:#F2B84B;--green:#2FD48A}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font:600 15px/1.35 "Plus Jakarta Sans",system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
#app{position:relative;max-width:480px;height:100dvh;margin:0 auto;overflow:hidden;touch-action:none;user-select:none}
#hud{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;z-index:5}
.dots{display:flex;gap:5px}.dots i{width:10px;height:10px;border-radius:50%;background:var(--line)}.dots i.g{background:var(--green)}.dots i.m{background:var(--red)}
#scene{position:absolute;inset:0;transform-origin:50% 35%;transition:transform .5s cubic-bezier(.2,.9,.25,1)}
#scene.zoom{transform:scale(1.18)}
#goal{position:absolute;left:8%;right:8%;top:16%;height:30%}
#goal .post{position:absolute;background:#fff;border-radius:3px}
#goal .net{position:absolute;inset:6px 6px 0;background:repeating-linear-gradient(0deg,#ffffff14 0 2px,transparent 2px 12px),repeating-linear-gradient(90deg,#ffffff14 0 2px,transparent 2px 12px);transform-origin:50% 0}
.spot{position:absolute;width:33.33%;height:50%;border-radius:12px;border:2px dashed transparent}
.aiming .spot{border-color:#ffffff22}.spot.on{border-color:var(--red);background:#E6394622}
#keeper{position:absolute;left:50%;top:26%;width:70px;height:110px;margin-left:-35px;transition:transform .28s cubic-bezier(.2,.9,.25,1)}
#ball{position:absolute;left:50%;bottom:16%;width:38px;height:38px;margin-left:-19px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff 0 40%,#ccc 70%);box-shadow:0 0 14px #E6394666}
#ball.fly{transition:transform var(--t,.45s) cubic-bezier(.15,.7,.3,1)}
#trail{position:absolute;pointer-events:none;width:8px;border-radius:8px;background:linear-gradient(var(--red),transparent);opacity:0;transform-origin:50% 100%}
#bar{position:absolute;left:12%;right:12%;bottom:7%;height:14px;border-radius:99px;background:linear-gradient(90deg,#3a3a42 0 55%,var(--green) 55% 88%,var(--red) 88%);opacity:0}
#bar.on{opacity:1}#bar i{position:absolute;top:-4px;bottom:-4px;width:4px;border-radius:4px;background:#fff;left:0;transform:translateX(var(--x,0))}
#pop{position:absolute;left:0;right:0;top:44%;text-align:center;font:900 46px/1 system-ui;letter-spacing:-.02em;opacity:0;pointer-events:none;z-index:6}
#pop.go{animation:pw-pop .9s cubic-bezier(.2,.9,.25,1)}
#combo{position:absolute;right:14px;top:52px;font-weight:900;color:var(--gold);opacity:0}
#combo.on{opacity:1;animation:pw-flame 1s ease-in-out infinite alternate}
#sheet{position:absolute;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);border-radius:20px 20px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .4s cubic-bezier(.2,.9,.25,1);z-index:8}
#sheet.on{transform:none}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:48px;border:0;border-radius:999px;font:800 15px system-ui;cursor:pointer}
.btn.red{background:var(--red);color:#fff}.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
.row{display:flex;gap:8px;margin-top:8px}.row .btn{flex:1}
input.name{width:100%;height:48px;border-radius:999px;border:1px solid var(--line);background:var(--bg);color:var(--text);padding:0 16px;font:inherit;font-size:16px}
.shake{animation:pw-shake .35s linear}.shake2{animation:pw-shake2 .45s linear}
.bulge{animation:pw-bulge .5s cubic-bezier(.2,.9,.25,1)}
.spark{position:absolute;width:6px;height:6px;border-radius:50%;background:var(--red);pointer-events:none;animation:pw-spark .6s ease-out forwards}
.spark.gold{background:var(--gold)}
@keyframes pw-pop{0%{opacity:0;transform:scale(.4) rotate(-6deg)}25%{opacity:1;transform:scale(1.15) rotate(2deg)}60%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.05)}}
@keyframes pw-shake{20%{transform:translate(-4px,2px)}40%{transform:translate(4px,-3px)}60%{transform:translate(-3px,-2px)}80%{transform:translate(3px,2px)}}
@keyframes pw-shake2{15%{transform:translate(-9px,4px)}30%{transform:translate(8px,-6px)}45%{transform:translate(-7px,-3px)}60%{transform:translate(6px,5px)}80%{transform:translate(-3px,2px)}}
@keyframes pw-bulge{40%{transform:scaleY(1.25) scaleX(1.06)}100%{transform:none}}
@keyframes pw-spark{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.3)}}
@keyframes pw-flame{from{opacity:.75;transform:scale(1)}to{opacity:1;transform:scale(1.12)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}#scene.zoom{transform:none}}
</style></head>
<body><div id="app">
  <div id="hud"><b id="title">Penalty Wahala</b><div class="dots" id="dotsYou"></div></div>
  <div id="scene">
    <div id="goal">
      <div class="post" style="left:0;top:0;bottom:0;width:6px"></div>
      <div class="post" style="right:0;top:0;bottom:0;width:6px"></div>
      <div class="post" style="left:0;right:0;top:0;height:6px"></div>
      <div class="net"></div>
      <!-- spots: 0-2 low left->right, 3-5 high left->right -->
      <div class="spot" data-s="3" style="left:0;top:0"></div><div class="spot" data-s="4" style="left:33.33%;top:0"></div><div class="spot" data-s="5" style="left:66.66%;top:0"></div>
      <div class="spot" data-s="0" style="left:0;top:50%"></div><div class="spot" data-s="1" style="left:33.33%;top:50%"></div><div class="spot" data-s="2" style="left:66.66%;top:50%"></div>
    </div>
    <svg id="keeper" viewBox="0 0 70 110" aria-hidden="true"><!-- stand-in until the Nano Banana art: body, gloves with red runes -->
      <rect x="20" y="30" width="30" height="45" rx="10" fill="#E63946"/><circle cx="35" cy="18" r="13" fill="#7a4a2a"/>
      <rect x="4" y="34" width="16" height="12" rx="6" fill="#F3F3F5"/><rect x="50" y="34" width="16" height="12" rx="6" fill="#F3F3F5"/>
      <rect x="22" y="75" width="10" height="30" rx="4" fill="#16161A"/><rect x="38" y="75" width="10" height="30" rx="4" fill="#16161A"/>
    </svg>
    <div id="trail"></div><div id="ball"></div>
  </div>
  <div id="bar"><i></i></div>
  <div id="pop"></div><div id="combo"></div>
  <div id="sheet"></div>
</div>
<script>
/* PENALTY WAHALA. Spec: docs/specs/2026-10-08-penalty-wahala-design.md.
   The rules below are copied verbatim from lib/penalty.js; a test fails if
   they drift. */
(function(){
"use strict";
var ZONES={weakBelow:0.55,overAbove:0.88};
var REG=5,BONUS=3;
var col=function(s){return s%3;},high=function(s){return s>=3;};
/* -- paste strike, neighbour, judge, shootout from lib/penalty.js here, unchanged -- */

var $=function(id){return document.getElementById(id);};
var REDUCED=matchMedia("(prefers-reduced-motion: reduce)").matches;
function uuid(){return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,function(c){return (c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16);});}
var DEV=null,NAME=null;
try{DEV=localStorage.getItem("pw.dev");if(!DEV){DEV=uuid();localStorage.setItem("pw.dev",DEV);}NAME=localStorage.getItem("pw.name");}catch(e){DEV=DEV||uuid();}
var MUTED=false;try{MUTED=localStorage.getItem("pw.mute")==="1";}catch(e){}

/* Where each spot sits on screen, as a fraction of the goal box. */
function spotXY(s){var g=$("goal").getBoundingClientRect(),a=$("app").getBoundingClientRect();
  return {x:g.left-a.left+g.width*(col(s)*2+1)/6, y:g.top-a.top+g.height*(high(s)?0.25:0.75)};}

var fx={
  pop:function(word,color){var p=$("pop");p.textContent=word;p.style.color=color||"#fff";p.classList.remove("go");void p.offsetWidth;p.classList.add("go");},
  shake:function(level){if(REDUCED)return;var s=$("app"),c=level>1?"shake2":"shake";s.classList.remove("shake","shake2");void s.offsetWidth;s.classList.add(c);},
  bulge:function(){var n=document.querySelector("#goal .net");n.classList.remove("bulge");void n.offsetWidth;n.classList.add("bulge");},
  post:function(){var g=$("goal");g.classList.remove("shake2");void g.offsetWidth;g.classList.add("shake2");},
  slowmo:function(on){$("scene").classList.toggle("zoom",!!on&&!REDUCED);document.documentElement.style.setProperty("--t",on&&!REDUCED?"1.1s":".45s");},
  sparks:function(x,y,gold,n){if(REDUCED)return;for(var i=0;i<(n||14);i++){var d=document.createElement("i");d.className="spark"+(gold?" gold":"");
    var a=Math.random()*Math.PI*2,r=30+Math.random()*50;d.style.left=x+"px";d.style.top=y+"px";
    d.style.setProperty("--dx",Math.cos(a)*r+"px");d.style.setProperty("--dy",Math.sin(a)*r+"px");$("app").appendChild(d);setTimeout(function(e){e.remove();},650,d);}},
  combo:function(n){var c=$("combo");if(n>=3){c.textContent="ON FIRE x"+n;c.classList.add("on");}else c.classList.remove("on");},
  buzz:function(ms){if(!MUTED&&navigator.vibrate)try{navigator.vibrate(ms);}catch(e){}}
};

function tapSpot(){return new Promise(function(done){
  $("goal").classList.add("aiming");
  var spots=document.querySelectorAll(".spot");
  function on(e){var s=+e.currentTarget.getAttribute("data-s");spots.forEach(function(x){x.classList.toggle("on",x===e.currentTarget);x.removeEventListener("pointerdown",on);});
    $("goal").classList.remove("aiming");done(s);}
  spots.forEach(function(x){x.addEventListener("pointerdown",on);});
});}

/* AIM, THEN FLICK. The tap chooses the spot. The bar sweeps 0 -> 1 -> 0; an
   upward flick on the lower half of the screen stops it. A short or slow flick
   costs power. The flick never chooses direction. */
function aimAndShoot(){return tapSpot().then(function(spot){return new Promise(function(done){
  var bar=$("bar"),knob=bar.querySelector("i"),w=bar.getBoundingClientRect().width,t0=performance.now(),raf=0,pos=0;
  bar.classList.add("on");
  function tick(t){var ph=((t-t0)/900)%2;pos=ph<1?ph:2-ph;knob.style.setProperty("--x",(pos*(w-4))+"px");raf=requestAnimationFrame(tick);}
  raf=requestAnimationFrame(tick);
  var sy=0,st=0;
  function down(e){sy=e.clientY;st=performance.now();}
  function up(e){var dy=sy-e.clientY,dt=Math.max(1,performance.now()-st);if(dy<24)return;
    cancelAnimationFrame(raf);bar.classList.remove("on");app.removeEventListener("pointerdown",down);app.removeEventListener("pointerup",up);
    var lazy=Math.min(1,(dy/dt)/1.2);           /* px per ms; 1.2+ is a full flick */
    var power=Math.max(0,Math.min(1,pos*(0.8+0.2*lazy)));
    fx.buzz(15);done({spot:spot,power:power});}
  var app=$("app");app.addEventListener("pointerdown",down);app.addEventListener("pointerup",up);
});});}

function pickDive(){return tapSpot();}

function placeKeeper(dive){var k=$("keeper");if(dive==null){k.style.transform="";return;}
  var dx=(col(dive)-1)*95,dy=high(dive)?-40:20,rot=(col(dive)-1)*55;k.style.transform="translate("+dx+"px,"+dy+"px) rotate("+rot+"deg)";}

var streak=0;
function playKick(k){return new Promise(function(done){
  var ball=$("ball"),a=$("app").getBoundingClientRect(),b=ball.getBoundingClientRect(),p=spotXY(k.shot.spot);
  var over=k.outcome==="over",bar=k.outcome==="bar";
  var tx=p.x-(b.left-a.left+b.width/2),ty=(over?p.y-90:bar?p.y-($("goal").getBoundingClientRect().height*0.75)+4:p.y)-(b.top-a.top+b.height/2);
  ball.classList.add("fly");ball.style.transform="translate("+tx+"px,"+ty+"px) scale(.55)";
  setTimeout(function(){placeKeeper(k.dive);},80);
  var dur=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--t"))||0.45;
  setTimeout(function(){
    var you=k.who==="you";
    if(k.outcome==="goal"){fx.bulge();fx.post();fx.shake(k.shot.kind==="green"?2:1);fx.buzz(40);
      var top=high(k.shot.spot)&&col(k.shot.spot)!==1&&k.shot.kind==="green";
      fx.sparks(p.x,p.y,top,top?22:12);fx.pop(top?"TOP BINS!":(you?"GOAL!":"OYA!"),top?"#F2B84B":"#2FD48A");
      streak=you?streak+1:streak;}
    else if(k.outcome==="save"){fx.sparks(p.x,p.y,false,18);fx.pop("SAVED!","#E63946");fx.buzz([20,40,20]);if(you)streak=0;}
    else{fx.post();fx.shake(2);fx.pop("WAHALA!","#E63946");if(you)streak=0;}
    fx.combo(streak);
    setTimeout(function(){ball.classList.remove("fly");ball.style.transform="";placeKeeper(null);done();},700);
  },dur*1000);
});}

window.PW={RULES:{strike:strike,neighbour:neighbour,judge:judge,shootout:shootout,ZONES:ZONES,REG:REG,BONUS:BONUS},
  aimAndShoot:aimAndShoot,pickDive:pickDive,playKick:playKick,fx:fx,spotXY:spotXY,
  get DEV(){return DEV;},get NAME(){return NAME;},setName:function(n){NAME=n;try{localStorage.setItem("pw.name",n);}catch(e){}}};
})();
</script>
</body></html>
```

Then replace the comment `/* -- paste strike, neighbour, judge, shootout ... -- */` with the four functions copied character-for-character from `lib/penalty.js` (they use `ZONES`, `REG`, `BONUS`, `col`, `high`, which the page defines above them).

- [ ] **Step 4: Run the tests**

Run: `node --test test/penalty-html.test.js`
Expected: all pass. If "verbatim" fails, re-copy the function from `lib/penalty.js`; do not edit the server copy to match.

- [ ] **Step 5: Look at it**

Serve `public/` (`node C:/Users/DELL/.claude/jobs/0f1e7baf/tmp/serve.js public 8792` or any static server) and open `http://127.0.0.1:8792/penalty.html` at 390px in Chrome devtools. In the console run `PW.aimAndShoot().then(s=>PW.playKick({who:"you",shot:PW.RULES.strike(s.spot,s.power),dive:0,outcome:PW.RULES.judge(s,0)}))`, tap a spot, flick up. Check: the bar sweeps, the flick stops it, the ball flies, the net bulges, the pop word shows, nothing scrolls.

- [ ] **Step 6: Commit**

```bash
git add public/penalty.html test/penalty-html.test.js
git commit -m "Penalty Wahala: game page - scene, aim and flick, effects"
```

---

### Task 6: Challenge flow, sharing and the tips card

**Files:**
- Modify: `public/penalty.html` (add a second `<script>` after the first)
- Test: extend `test/penalty-html.test.js`

**Interfaces:**
- Consumes: `window.PW` (Task 5); API routes (Task 3).
- Produces: the screens - home, name, challenger match (5 + 3 bonus shots, 5 + 3 bonus dives vs the computer), share sheet, friend match from `/penalty?c=ID`, result + tips card; helpers `api(method, a, body, q)`, `track(name, data)`, `shareSheet(text, url)`.

- [ ] **Step 1: Add the failing tests**

```js
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
  assert.match(html, /for\(var i=0;i<REG\+BONUS;i\+\+\)/);
});

test("no bet, booking code or price anywhere in the game", () => {
  /* "no stakes" is allowed copy; a stake to place is not. */
  assert.doesNotMatch(html, /booking code|\bodds\b|SportyBet|Bet9ja|place a bet|your stake/i);
});
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/penalty-html.test.js`
Expected: the five new tests fail.

- [ ] **Step 3: Implement the flow script**

```html
<script>
(function(){
"use strict";
var PW=window.PW,R=PW.RULES,REG=R.REG,BONUS=R.BONUS,$=function(id){return document.getElementById(id);};
var ORIGIN=location.origin;
window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};
function track(name,data){try{window.va("event",{name:name,data:data||{}});}catch(e){}}
function api(method,a,body,q){
  var qs="?a="+a+Object.keys(q||{}).map(function(k){return "&"+k+"="+encodeURIComponent(q[k]);}).join("");
  return fetch("/api/penalty"+qs,{method:method,headers:method==="POST"?{"Content-Type":"application/json","X-SW-Request":"1"}:{},
    body:method==="POST"?JSON.stringify(body):undefined}).then(function(r){return r.json().then(function(j){return {status:r.status,j:j};});})
    .catch(function(){return {status:0,j:{}};});
}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
function sheet(nodes){var s=$("sheet");s.textContent="";nodes.forEach(function(n){s.appendChild(n);});s.classList.add("on");}
function closeSheet(){$("sheet").classList.remove("on");}
function btn(label,cls,fn){var b=el("button","btn "+cls,label);b.type="button";b.addEventListener("click",fn);return b;}
function dots(outs){var d=$("dotsYou");d.textContent="";outs.forEach(function(o){var i=el("i",o==="goal"?"g":"m");d.appendChild(i);});}

/* The one network failure screen: never invents a result. */
function offline(retry){sheet([el("p",null,"Can't reach the pitch, try again."),btn("Try again","red",function(){closeSheet();retry();})]);}

function askName(){return new Promise(function(done){
  if(PW.NAME)return done(PW.NAME);
  var i=el("input","name");i.placeholder="Your name";i.maxLength=16;i.autocomplete="nickname";
  sheet([el("h2",null,"What do we call you?"),i,el("div","row"),btn("Let's go","red",function(){
    var n=i.value.replace(/[^\p{L}\p{N} ]/gu,"").replace(/\s+/g," ").trim().slice(0,16);if(!n){i.focus();return;}
    PW.setName(n);closeSheet();done(n);})]);setTimeout(function(){i.focus();},350);
});}

function shareSheet(text,url,where){
  var full=text+" "+url;
  var wa=btn("WhatsApp","red",function(){track("share",{ch:"whatsapp",where:where});open("https://wa.me/?text="+encodeURIComponent(full),"_blank");});
  var x=btn("X","red",function(){track("share",{ch:"x",where:where});open("https://x.com/intent/post?text="+encodeURIComponent(text+" via @SoccerWizardhq")+"&url="+encodeURIComponent(url),"_blank");});
  var row=el("div","row");row.appendChild(wa);row.appendChild(x);
  var row2=el("div","row");
  row2.appendChild(btn("Copy link","ghost",function(e){track("share",{ch:"copy",where:where});try{navigator.clipboard.writeText(url);e.currentTarget.textContent="Copied";}catch(_){}}));
  if(navigator.share)row2.appendChild(btn("Share","ghost",function(){track("share",{ch:"system",where:where});navigator.share({text:text,url:url}).catch(function(){});}));
  return [row,row2];
}

function tipsCard(){var box=el("div","tips");
  api("GET","tips").then(function(r){if(!r.j||!r.j.home)return;
    box.appendChild(el("p",null,"The wizard's real picks today"));
    box.appendChild(el("b",null,r.j.home+" v "+r.j.away));
    box.appendChild(el("p",null,r.j.tip+" · "+r.j.pct+"%"));
    var a=el("a","btn ghost","See all predictions");a.href="/";a.addEventListener("click",function(){track("tips_clicked");});box.appendChild(a);});
  return box;}

/* THE CHALLENGER: 5 shots + 3 bonus vs a computer keeper, 5 dives + 3 bonus
   vs computer shots. Judged here (no stakes); the picks go to the server. */
function challenger(){askName().then(function(name){
  var shots=[],dives=[],outs=[],i=0;
  function cpuDive(){return Math.floor(Math.random()*6);}
  function cpuShot(){return {spot:Math.floor(Math.random()*6),power:0.45+Math.random()*0.5};}
  var p=Promise.resolve();
  for(var i=0;i<REG+BONUS;i++)(function(n){p=p.then(function(){
    if(n===REG)PW.fx.pop("BONUS KICKS","#F2B84B");
    PW.fx.slowmo(n===REG-1);
    return PW.aimAndShoot().then(function(s){shots.push(s);var d=cpuDive(),o=R.judge(s,d);
      if(n<REG){outs.push(o);dots(outs);}
      return PW.playKick({who:"you",shot:R.strike(s.spot,s.power),dive:d,outcome:o});})
    .then(function(){return PW.pickDive();})
    .then(function(dv){dives.push(dv);var cs=cpuShot();return PW.playKick({who:"them",shot:R.strike(cs.spot,cs.power),dive:dv,outcome:R.judge(cs,dv)});});
  });})(i);
  p.then(function save(){PW.fx.slowmo(false);
    return api("POST","create",{name:name,device:PW.DEV,shots:shots,dives:dives}).then(function(r){
      if(r.status!==200)return offline(save);
      track("challenge_created");
      var url=ORIGIN+"/p/"+r.j.id,score=outs.filter(function(o){return o==="goal";}).length;
      sheet([el("h2",null,"You scored "+score+"/5")].concat(shareSheet("I scored "+score+"/5 on Penalty Wahala. Bet you can't save it:",url,"challenge"),[tipsCard()]));
    });});
});}

/* THE FRIEND: alternate shot then dive; the server judges and reveals only the
   shot just taken. A dropped connection resumes at the next kick. */
function friend(id){api("GET","match",null,{id:id}).then(function(r){
  if(r.status===0)return offline(function(){friend(id);});
  if(r.status!==200)return sheet([el("h2",null,"This challenge doesn't exist"),btn("Start your own","red",function(){closeSheet();challenger();})]);
  var m=r.j;track("challenge_opened");
  if(m.expired)return sheet([el("h2",null,"This challenge ran out"),btn("Start your own","red",function(){closeSheet();challenger();})]);
  if(m.done)return result(m.score.a,m.score.b,m.winner,m.challenger,id);
  sheet([el("h2",null,m.challenger+" challenges you"),el("p",null,"5 shots, 5 saves. Free, no stakes."),btn("Kick off","red",function(){closeSheet();askName().then(go);})]);
  var outs=m.outcomes.slice();
  function go(name){var n=outs.length;var shot=n%2===0;
    PW.fx.slowmo(Math.floor(n/2)>=REG-1);
    var step=shot?PW.aimAndShoot().then(function(s){return api("POST","kick",{id:id,device:PW.DEV,name:name,kind:"shot",spot:s.spot,power:s.power}).then(function(x){return {x:x,s:s};});})
                 :PW.pickDive().then(function(dv){return api("POST","kick",{id:id,device:PW.DEV,name:name,kind:"dive",spot:dv}).then(function(x){return {x:x,dv:dv};});});
    step.then(function(o){var x=o.x;
      if(x.status===0)return offline(function(){go(name);});
      if(x.status===409&&x.j.error==="taken")return sheet([el("h2",null,"Someone else is playing this one"),btn("Start your own","red",function(){closeSheet();challenger();})]);
      if(x.status!==200)return offline(function(){friend(id);});
      outs.push(x.j.outcome);dots(outs.filter(function(_,i){return i%2===0;}));
      var anim=shot?PW.playKick({who:"you",shot:R.strike(o.s.spot,o.s.power),dive:x.j.outcome==="save"?o.s.spot:(o.s.spot+3)%6,outcome:x.j.outcome})
                    :PW.playKick({who:"them",shot:x.j.against,dive:o.dv,outcome:x.j.outcome});
      anim.then(function(){var st=x.j.state;if(st.done){track("challenge_finished");PW.fx.slowmo(false);return result(st.score.a,st.score.b,st.winner,m.challenger,id);}go(name);});
    });}
});}

function result(a,b,winner,chName,id){
  var url=ORIGIN+"/p/"+id;
  var head=winner==="a"?"You beat "+chName+" "+a+"-"+b:winner==="b"?chName+" beat you "+b+"-"+a:"Draw, "+a+"-"+b;
  var text=winner==="a"?"I beat "+chName+" "+a+"-"+b+" on Penalty Wahala 😤 Your turn:":"Penalty Wahala: "+head+". Try me:";
  sheet([el("h2",null,head)].concat(shareSheet(text,url,"result"),[btn("Start your own challenge","ghost",function(){closeSheet();challenger();}),tipsCard()]));
}

window.PWFlow={challenger:challenger,friend:friend,api:api,track:track,sheet:sheet,closeSheet:closeSheet,el:el,btn:btn,shareSheet:shareSheet,tipsCard:tipsCard,offline:offline};
})();
</script>
```

Note: in the friend's shot animation the keeper's dive is not known to the client (it stays on the server); the keeper is drawn on the shot's spot for a save and away from it for a goal. That is presentation only.

- [ ] **Step 4: Run the tests**

Run: `node --test test/penalty-html.test.js`
Expected: all pass. The "no booking code" test reads the whole page; if the tips card's league or tip text trips it, the test is right - those come from the API at runtime, not the page source.

- [ ] **Step 5: Commit**

```bash
git add public/penalty.html test/penalty-html.test.js
git commit -m "Penalty Wahala: challenge flow, WhatsApp and X sharing, tips card"
```

---

### Task 7: Daily Wizard Keeper, home screen, streak, results

**Files:**
- Modify: `public/penalty.html` (third `<script>`)
- Test: extend `test/penalty-html.test.js`

**Interfaces:**
- Consumes: `window.PW`, `window.PWFlow`.
- Produces: `daily()`, `home()`, the entry router (`?c=ID` -> friend, else home), streak in `localStorage["pw.streak"]` as `{last:"YYYY-MM-DD", n}`.

- [ ] **Step 1: Add the failing tests**

```js
test("daily share line names the day and ends with the account", () => {
  assert.match(html, /"Wizard Keeper "\+/);
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
```

- [ ] **Step 2: Run to see them fail**

Run: `node --test test/penalty-html.test.js`
Expected: the three new tests fail.

- [ ] **Step 3: Implement**

```html
<script>
(function(){
"use strict";
var PW=window.PW,F=window.PWFlow,R=PW.RULES;
function lagos(ms){return new Date(ms+3600000).toISOString().slice(0,10);}
function bumpStreak(day){var s={last:null,n:0};try{s=JSON.parse(localStorage.getItem("pw.streak")||"null")||s;}catch(e){}
  if(s.last===day)return s.n;
  var y=new Date(Date.parse(day+"T12:00:00Z")-864e5).toISOString().slice(0,10);
  s.n=s.last===y?s.n+1:1;s.last=day;try{localStorage.setItem("pw.streak",JSON.stringify(s));}catch(e){}return s.n;}

/* DAILY: shoot only, five shots, every shot judged on the server against the
   day's keeper. The day comes back with the first shot and is sent with the
   rest, so a go across Lagos midnight finishes against one keeper. */
function daily(){var outs=[],day=null,i=0;
  function shot(){PW.fx.slowmo(i===R.REG-1);
    PW.aimAndShoot().then(function(s){return F.api("POST","daily",{device:PW.DEV,i:i,spot:s.spot,power:s.power,day:day}).then(function(x){return {x:x,s:s};});})
    .then(function(o){var x=o.x;
      if(x.status===409)return F.sheet([F.el("h2",null,"You've faced today's keeper"),F.el("p",null,"New keeper at midnight. Challenge a friend meanwhile."),F.btn("Challenge a friend","red",function(){F.closeSheet();F.challenger();})]);
      if(x.status!==200)return F.offline(shot);
      day=x.j.day;outs.push(x.j.outcome);
      return PW.playKick({who:"you",shot:R.strike(o.s.spot,o.s.power),dive:x.j.outcome==="save"?o.s.spot:(o.s.spot+3)%6,outcome:x.j.outcome}).then(function(){
        if(!x.j.done){i++;return shot();}
        PW.fx.slowmo(false);F.track("daily_played",{score:x.j.score});
        var n=bumpStreak(day),grid=outs.map(function(o){return o==="goal"?"⚽":"❌";}).join("");
        var d=new Date(day+"T12:00:00Z").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
        var text="Wizard Keeper "+d+": "+grid+" "+x.j.score+"/5";
        var nodes=[F.el("h2",null,x.j.score+"/5 against the Wizard Keeper"),
          F.el("p",null,(x.j.better!=null?"Better than "+x.j.better+"% of players today. ":"")+"Streak: "+n+(n===1?" day":" days"))];
        F.sheet(nodes.concat(F.shareSheet(text,location.origin+"/penalty","daily"),[F.btn("Challenge a friend","ghost",function(){F.closeSheet();F.challenger();}),F.tipsCard()]));
      });});}
  shot();}

function home(){
  var nodes=[F.el("h2",null,"Penalty Wahala"),F.el("p",null,"Free. No stakes. Just bragging rights."),
    F.btn("Face today's Wizard Keeper","red",function(){F.closeSheet();daily();}),
    F.btn("Challenge a friend","ghost",function(){F.closeSheet();F.challenger();})];
  var mute=F.btn("Vibration: on","ghost",function(e){var m=localStorage.getItem("pw.mute")==="1";localStorage.setItem("pw.mute",m?"0":"1");e.currentTarget.textContent="Vibration: "+(m?"on":"off");});
  try{if(localStorage.getItem("pw.mute")==="1")mute.textContent="Vibration: off";}catch(e){}
  nodes.push(mute);
  F.sheet(nodes);
  /* "Ada beat you 4-3": finished challenges this device created in the last week. */
  F.api("GET","mine",null,{device:PW.DEV}).then(function(r){var seen={};try{seen=JSON.parse(localStorage.getItem("pw.seen")||"{}");}catch(e){}
    (r.j.results||[]).filter(function(x){return !seen[x.id]&&x.score;}).slice(0,1).forEach(function(x){
      var line=x.won?"You beat "+x.friend+" "+x.score.you+"-"+x.score.them:x.draw?"You drew with "+x.friend:x.friend+" beat you "+x.score.them+"-"+x.score.you;
      $note(line);seen[x.id]=1;try{localStorage.setItem("pw.seen",JSON.stringify(seen));}catch(e){}});});
  function $note(t){var s=document.getElementById("sheet");s.insertBefore(F.el("p","note",t),s.firstChild);}
}

var c=new URLSearchParams(location.search).get("c");
if(c&&/^[A-Za-z0-9]{6}$/.test(c))F.friend(c.toUpperCase());else home();
})();
</script>
```

- [ ] **Step 4: Run all penalty tests**

Run: `node --test test/penalty-*.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add public/penalty.html test/penalty-html.test.js
git commit -m "Penalty Wahala: daily Wizard Keeper, streak, home screen, results"
```

---

### Task 8: End-to-end check, full suite, preview

**Files:**
- Create: `C:/Users/DELL/.claude/jobs/0f1e7baf/tmp/penalty-e2e.js` (outside the repo; it is a check, not product code)

- [ ] **Step 1: Write a headless run against a local server with a stubbed API**

The script serves the worktree's `public/`, answers `/api/penalty` with an in-process copy of `make()` from `api/penalty.js` wired to the in-memory fake db from `test/penalty-api.test.js` (copy the `fakeDb` function), and drives two pages with puppeteer-core (`C:/Users/DELL/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core`, Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`):

1. Page A (390x800): open `/penalty.html`, choose "Challenge a friend", set the name, play 8 shots and 8 dives by tapping a spot and dispatching a `pointerdown`/`pointerup` pair 120px apart on `#app`; read the `/p/<id>` link from the share sheet.
2. Page B (390x800, new device id): open `/penalty.html?c=<id>`, play until the result sheet; assert the header names a winner or a draw.
3. Page A again: reload; assert the home sheet shows the result note.
4. Page C (1280x800): "Face today's Wizard Keeper", 5 shots; assert the result shows `/5` and a streak of 1.
5. At every step record `pageerror`s and assert none; assert `document.documentElement.scrollWidth <= innerWidth`.

- [ ] **Step 2: Run it**

Run: `node C:/Users/DELL/.claude/jobs/0f1e7baf/tmp/penalty-e2e.js`
Expected: four sections report OK, zero page errors, no horizontal scroll. Save screenshots of each result sheet and look at them.

- [ ] **Step 3: Full suite**

Run: `node scripts/graphify-inline.js && node --test`
Expected: everything passes except the known local-only unrated-competition test.

- [ ] **Step 4: Push the branch for a preview (not main)**

```bash
git push -u origin penalty
```

The preview has no `PENALTY_KEY` and no tables yet, so the daily keeper answers `not_configured` and challenges fail to save there; the owner tries the look and feel. Report the preview URL.

- [ ] **Step 5: Hand back to the owner for the two setup steps** (both need the owner's yes)

1. Run `sql/penalty.sql` in the Supabase SQL editor (project used by `SUPABASE_URL`).
2. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` then `vercel env add PENALTY_KEY production` with that value.

After both, merge to `main` only on the owner's yes, verify `/penalty` and one real `/p/<id>` link live, and keep the page unlinked from the site (rollout step 1).

---

## Self-review notes

- Spec 3 (rules, bonus kicks, daily, after-match card): Tasks 1, 3, 6, 7.
- Spec 4 (files, tables, API, identity, limits): Tasks 2, 3, 4.
- Spec 5 (feel): Task 5 effects; slow motion on the fifth and sudden-death kicks in Tasks 6 and 7.
- Spec 6 (art): stand-in SVG keeper in Task 5; sprites swap in when the owner's sheets arrive (a follow-up task, not in this plan).
- Spec 7 (sharing, funnel): Tasks 4 and 6. The site menu entry and the Your slips line are rollout step 2, after the owner plays it.
- Spec 8 (tracking): Task 6 `track()` events; test pins the names.
- Spec 9 (errors): offline sheet (Task 6), expired/missing pages (Tasks 4, 6), names as text (Tasks 1, 4, 5), reduced motion (Task 5).
- Spec 10 (testing): Tasks 1-4 unit tests, Task 8 headless.
- Spec 11 (rollout): Task 8 steps 4-5.
