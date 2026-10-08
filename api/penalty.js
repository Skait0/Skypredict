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

/* Where a daily go stands: outcomes only, never the shots or the dives. */
function dailyState(day, play) {
  const shots = play ? play.shots : [];
  return { day, at: shots.length, outcomes: shots.map((x) => x.outcome), score: play && play.score != null ? play.score : null };
}

function make(deps) {
  const db = deps.db, now = deps.now || Date.now;
  const key = () => process.env.PENALTY_KEY || "";
  const report = deps.report || (async () => {});
  const tips = deps.tips || defaultTips;
  const bad = (res) => H.sendJson(res, 400, { error: "bad" });

  /* Which side the opener is on, so a finished or running challenge is told
     from their side. Computed from the device; the device never goes back. */
  function roleOf(m, dev) {
    if (!DEV_RE.test(String(dev || ""))) return null;
    return dev === m.challenger_device ? "challenger" : dev === m.friend_device ? "friend" : null;
  }
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
      return H.sendJson(res, 200, Object.assign(publicState(m, t), { role: roleOf(m, (req.query || {}).device) }));
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
      /* Out of step (a reload, or an answer that never arrived): say where the
         go really stands so the page resumes there. */
      if (shots.length !== b.i || (play && play.score != null))
        return H.sendJson(res, 409, Object.assign({ error: "turn" }, dailyState(day, play)));
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
    async dailystate(req, res, t) {
      const dev = String((req.query || {}).device || "");
      if (!DEV_RE.test(dev)) return bad(res);
      const today = P.lagosDay(t), yesterday = P.lagosDay(t - DAY_MS);
      /* An unfinished go from before Lagos midnight is still finished against
         its own keeper. */
      const prev = await db.getPlay(yesterday, dev);
      if (prev && prev.score == null && prev.shots.length) return H.sendJson(res, 200, dailyState(yesterday, prev));
      return H.sendJson(res, 200, dailyState(today, await db.getPlay(today, dev)));
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
