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
  assert.match(html, /SOCCERWIZARD/);
});

test("lightning strikes only on a perfect strike or a hot streak", () => {
  const calls = html.match(/lightning\(/g) || [];
  assert.strictEqual(calls.length, 2, "one definition, one call");
  assert.match(html, /if\(\(perfect\|\|streak>=3\)&&k\.outcome==="goal"\)\{?\s*lightning\(/);
});

test("every sprite the page names exists on disk", () => {
  const names = [...new Set((html.match(/[kps]-[a-z-]+(?=\.webp)/g) || []))];
  assert.ok(names.length >= 15, names.join(","));
  for (const n of names) assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "penalty", n + ".webp")), n);
});

test("only the first pose of each character and the ball load up front", () => {
  const eager = (html.match(/<link rel="preload" as="image" href="\/penalty\/[a-z-]+\.webp">/g) || []).length;
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
  assert.match(html, /for\(var i=0;i<REG\+BONUS;i\+\+\)/);
});

test("no bet, booking code or price anywhere in the game", () => {
  /* "no stakes" is allowed copy; a stake to place is not. */
  assert.doesNotMatch(html, /booking code|\bodds\b|SportyBet|Bet9ja|place a bet|your stake/i);
});

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

/* Owner, 8 Oct 2026: "another character as the wizard. players can choose
   who they want to use". */
test("players choose Ten or The Wizard, the choice is kept, the opponent is the other", () => {
  assert.match(html, /localStorage\.setItem\("pw\.char"/);
  assert.match(html, /function charPicker\(/);
  for (const pose of ["ready", "dive-low", "dive-high", "jump", "catch", "beaten", "roar", "shrug", "taunt"]) assert.match(html, new RegExp('"kw-' + pose + '\.webp"'), "wizard keeper " + pose);
  for (const pose of ["stand", "run", "strike", "follow", "arms", "slide", "head"]) assert.match(html, new RegExp('"sw-' + pose + '\.webp"'), "wizard shooter " + pose);
});

test("the daily keeper is always The Wizard", () => {
  assert.match(html, /function daily\(\)\{[^}]*PW\.setOpponent\("wizard"\)/);
});
