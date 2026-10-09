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

const picksOk = (b) => Array.isArray(b.shots) && Array.isArray(b.dives) && b.shots.length === REG_LEN &&
  b.dives.length === REG_LEN && b.shots.every(P.validPick) && b.dives.every(P.validDive);

function make(deps) {
  const db = deps.db, now = deps.now || Date.now;
  const key = () => process.env.PENALTY_KEY || "";
  const report = deps.report || (async () => {});
  const tips = deps.tips || defaultTips;
  const sendPush = deps.sendPush !== undefined ? deps.sendPush : defaultSendPush();
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
      expired: !m.friend_kicks.length && Date.parse(m.expires_at) <= t, pending: !(m.ch_shots || []).length };
  }

  const routes = {
    async create(req, res, t) {
      const b = await H.readJson(req, 4096);
      const name = b && P.cleanName(b.name);
      /* Picks may come later (the link goes out first) or now; when sent they must be whole. */
      const later = b && b.shots == null && b.dives == null;
      if (!b || !name || !DEV_RE.test(String(b.device)) || (!later && !picksOk(b))) return bad(res);
      if (!(await db.rlHit("pw:c:" + H.ipKey(req), 3600, 30))) return H.sendJson(res, 429, { error: "slow_down" });
      for (let tries = 0; tries < 3; tries++) {
        const id = P.newId();
        const ok = await db.createMatch({ id, challenger_name: name, challenger_device: b.device,
          ch_shots: later ? [] : b.shots.map((s) => ({ spot: s.spot, power: s.power })), ch_dives: later ? [] : b.dives,
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
      if (!(m.ch_shots || []).length) return H.sendJson(res, 409, { error: "pending" });
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
    /* The challenger's eight kicks and eight dives, once, after the link went out. */
    async picks(req, res) {
      const b = await H.readJson(req, 4096);
      if (!b || !DEV_RE.test(String(b.device)) || !picksOk(b)) return bad(res);
      const m = await db.getMatch(String(b.id || "").toUpperCase());
      if (!m) return H.sendJson(res, 404, { error: "not_found" });
      if (m.challenger_device !== b.device || (m.ch_shots || []).length) return H.sendJson(res, 409, { error: "taken" });
      const ok = await db.setPicks(m.id, b.device, b.shots.map((s) => ({ spot: s.spot, power: s.power })), b.dives);
      return ok ? H.sendJson(res, 200, { ok: true }) : H.sendJson(res, 409, { error: "busy" });
    },
    /* RANKED: one kick of a sudden-death run, judged against rankedDive. i=0
       opens a run; a miss ends it. The page learns the outcome, never a dive
       before it shoots. */
    async ranked(req, res, t) {
      const b = await H.readJson(req, 512);
      if (!b || !DEV_RE.test(String(b.device)) || !Number.isInteger(b.i) || b.i < 0 || b.i > 500) return bad(res);
      const shot = { spot: b.spot, power: b.power };
      if (!P.validPick(shot)) return bad(res);
      if (key().length < 32) return H.sendJson(res, 503, { error: "not_configured" });
      if (!(await db.rlHit("pw:r:" + H.ipKey(req), 3600, 900))) return H.sendJson(res, 429, { error: "slow_down" });
      let run;
      if (b.i === 0) {
        const name = P.cleanName(b.name);
        if (!name) return bad(res);
        for (let tries = 0; tries < 3 && !run; tries++) {
          const row = { id: P.newId(), device: b.device, name, club: P.cleanClub(b.club), kicks: [], kicks_n: 0, streak: 0, alive: true, created_at: new Date(t).toISOString() };
          if (await db.createRun(row)) run = row;
        }
        if (!run) return H.sendJson(res, 500, { error: "server" });
      } else {
        run = await db.getRun(String(b.run || "").toUpperCase());
        if (!run || run.device !== b.device) return H.sendJson(res, 404, { error: "not_found" });
        if (!run.alive || run.kicks_n !== b.i) return H.sendJson(res, 409, { error: "turn", i: run.kicks_n, streak: run.streak, alive: run.alive });
      }
      const outcome = P.judge(shot, P.rankedDive(key(), run.id, b.i, shot.spot, run.streak));
      const goal = outcome === "goal", streak = run.streak + (goal ? 1 : 0);
      const patch = { kicks: run.kicks.concat([{ spot: shot.spot, power: shot.power, outcome }]), kicks_n: b.i + 1, streak, alive: goal };
      if (!(await db.appendRun(run.id, b.i, patch))) return H.sendJson(res, 409, { error: "busy" });
      return H.sendJson(res, 200, { outcome, run: run.id, i: b.i, streak, alive: goal });
    },
    /* The tables: today and this week (Lagos), and all time. Best run per device. */
    async board(req, res, t) {
      const per = String((req.query || {}).period || "today");
      if (per === "league") return league(req, res, t);
      if (per === "clubs") return clubs(req, res, t);
      const since = per === "today" ? P.lagosDay(t) + "T00:00:00+01:00" : per === "week" ? P.lagosWeek(t) + "T00:00:00+01:00" : per === "all" ? null : undefined;
      if (since === undefined) return bad(res);
      const dev = String((req.query || {}).device || ""), seen = new Set(), rows = [];
      let me = null;
      for (const r of await db.board(since)) {
        if (seen.has(r.device)) continue;
        seen.add(r.device);
        rows.push({ name: r.name, club: r.club || null, streak: r.streak, you: r.device === dev });
        if (r.device === dev) me = { rank: rows.length, streak: r.streak };
      }
      return H.sendJson(res, 200, { period: per, top: rows.slice(0, 20), me });
    },
  };
  /* MY LEAGUE: everyone in your division this week, by their best run this
     week. Division = max(last week's earned tier, this week's), so the table
     moves the moment someone is promoted. */
  async function league(req, res, t) {
    const dev = String((req.query || {}).device || "");
    const thisWk = P.lagosWeek(t), lastWk = P.lagosWeek(t - 7 * DAY_MS);
    const rows = await db.board(lastWk + "T00:00:00+01:00", 5000);
    const start = Date.parse(thisWk + "T00:00:00+01:00"), who = new Map();
    for (const r of rows) {
      const w = who.get(r.device) || { name: r.name, club: r.club || null, last: 0, now: 0 };
      if (Date.parse(r.created_at) >= start) { w.now = Math.max(w.now, r.streak); w.name = r.name; w.club = r.club || null; } else w.last = Math.max(w.last, r.streak);
      who.set(r.device, w);
    }
    const me = who.get(dev) || { last: 0, now: 0 };
    const tier = P.divisionOf(me.last, me.now), D = P.DIVISIONS, next = D[tier + 1] || null;
    const table = [...who.entries()].filter(([, w]) => w.now > 0 && P.divisionOf(w.last, w.now) === tier)
      .sort((a, b) => b[1].now - a[1].now).map(([d, w]) => ({ name: w.name, club: w.club, streak: w.now, you: d === dev }));
    const rank = table.findIndex((x) => x.you) + 1;
    return H.sendJson(res, 200, { period: "league", division: { tier, id: D[tier].id, name: D[tier].name,
      next: next ? { name: next.name, at: next.at, need: Math.max(0, next.at - me.now) } : null },
      top: table.slice(0, 20), me: rank ? { rank, streak: me.now } : null, players: table.length });
  }
  /* CLUB WARS: every Ranked goal this week counts for the scorer's club, so
     a club's total is the sum of its runs, not its best one. `mine` is the
     club of your latest run this week. */
  async function clubs(req, res, t) {
    const dev = String((req.query || {}).device || "");
    // ponytail: reads up to 5000 scoring runs a week; aggregate in SQL if a week outgrows that
    const rows = await db.board(P.lagosWeek(t) + "T00:00:00+01:00", 5000), by = new Map();
    let mine = null, mineAt = 0;
    for (const r of rows) {
      if (!P.cleanClub(r.club)) continue;          // no club, or one since removed
      const c = by.get(r.club) || { club: r.club, goals: 0, players: new Set() };
      c.goals += r.streak; c.players.add(r.device); by.set(r.club, c);
      const at = Date.parse(r.created_at);
      if (r.device === dev && at > mineAt) { mine = r.club; mineAt = at; }
    }
    const top = [...by.values()].sort((a, b) => b.goals - a.goals)
      .map((c) => ({ club: c.club, goals: c.goals, players: c.players.size }));
    return H.sendJson(res, 200, { period: "clubs", top, mine });
  }
  /* DUELS (owner, 9 Oct 2026): turn by turn - see duelState in lib/penalty.js.
     A sealed shot's spot and power never leave the server until the other
     side has dived against it. */
  const sideOf = (d, dev) => (dev === d.a_device ? "a" : d.b_device && dev === d.b_device ? "b" : null);
  const player = (d, s) => (s === "a" ? { name: d.a_name, char: d.a_char, club: d.a_club, taunt: d.a_taunt, lvl: d.a_lvl }
    : d.b_device ? { name: d.b_name, char: d.b_char, club: d.b_club, lvl: d.b_lvl } : null);
  const cleanChar = (c) => (c === "wizard" ? "wizard" : "ten");
  const cleanLvl = (n) => (Number.isInteger(n) && n > 0 && n < 1000 ? n : null);
  async function duelView(d, dev, lite) {
    const st = P.duelState(d.kicks), me = sideOf(d, dev);
    const view = { id: d.id, me, v: d.v, a: player(d, "a"), b: player(d, "b"), score: st.score, done: st.done,
      winner: st.winner, turn: st.turn, need: st.need, open: !d.b_device && !st.done,
      kicks: d.kicks.map((k, i) => (k.outcome ? { by: i % 2 ? "b" : "a", spot: k.spot, power: k.power, dive: k.dive, outcome: k.outcome }
        : { by: i % 2 ? "b" : "a", sealed: true })) };
    view.mine = me ? st.turn === me : view.open && DEV_RE.test(String(dev || "")) && st.turn === "b";
    if (me && d.b_device && !lite) {   // lite: the 5s waiting check skips the record
      const h = { you: 0, them: 0, draws: 0 };
      for (const r of await db.h2h(d.a_device, d.b_device)) {
        const w = r.result && r.result.winner;
        if (w === "draw") h.draws++;
        else if (w) { if ((w === "a") === (r.a_device === dev)) h.you++; else h.them++; }
      }
      view.h2h = h;
    }
    return view;
  }
  /* The other side's phone, when the turn passes to them or the duel ends.
     Best effort and never in the way: no subscription, no key, quiet hours
     or a slow push service all leave the turn exactly as it landed. */
  async function notify(d, side, st, t) {
    if (!sendPush) return;
    const dev = side === "a" ? d.a_device : d.b_device;
    const p = dev && await db.getPush(dev);
    if (!p) return;
    const other = side === "a" ? d.b_name : d.a_name, mine = st.score[side], theirs = st.score[side === "a" ? "b" : "a"];
    const note = st.done
      ? { title: st.winner === "draw" ? "You drew with " + other + " " + mine + "-" + theirs
        : st.winner === side ? "You beat " + other + " " + mine + "-" + theirs : other + " beat you " + theirs + "-" + mine,
        body: "Fancy a rematch?", url: "/penalty?d=" + d.id }
      : { title: "Your turn vs " + other, body: "It is " + mine + "-" + theirs + ". Make your save, then take your shot.", url: "/penalty?d=" + d.id };
    await db.setNote(dev, note, new Date(t).toISOString());
    if (require("../lib/vapid.js").quietHours(t)) return;
    const code = await sendPush(p.endpoint);
    if (code === 404 || code === 410) await db.dropPush(dev);
  }
  Object.assign(routes, {
    async duel_new(req, res, t) {
      const b = await H.readJson(req, 1024);
      const name = b && P.cleanName(b.name), shot = b && b.shot && { spot: b.shot.spot, power: b.shot.power };
      if (!b || !name || !DEV_RE.test(String(b.device)) || !P.validPick(shot)) return bad(res);
      if (!(await db.rlHit("pw:c:" + H.ipKey(req), 3600, 30))) return H.sendJson(res, 429, { error: "slow_down" });
      for (let tries = 0; tries < 3; tries++) {
        const id = P.newId();
        const ok = await db.createDuel({ id, a_device: b.device, a_name: name, a_char: cleanChar(b.char), a_club: P.cleanClub(b.club),
          a_taunt: P.TAUNTS.indexOf(b.taunt) >= 0 ? b.taunt : null, a_lvl: cleanLvl(b.lvl), kicks: [shot], v: 1,
          updated_at: new Date(t).toISOString() });
        if (ok) return H.sendJson(res, 200, { id });
      }
      return H.sendJson(res, 500, { error: "server" });
    },
    async duel(req, res) {
      const q = req.query || {}, d = await db.getDuel(String(q.id || "").toUpperCase());
      if (!d) return H.sendJson(res, 404, { error: "not_found" });
      return H.sendJson(res, 200, await duelView(d, String(q.device || ""), !!q.lite));
    },
    async duel_turn(req, res, t) {
      const b = await H.readJson(req, 1024);
      if (!b || !DEV_RE.test(String(b.device)) || !Number.isInteger(b.v)) return bad(res);
      if (!(await db.rlHit("pw:k:" + H.ipKey(req), 3600, 600))) return H.sendJson(res, 429, { error: "slow_down" });
      const d = await db.getDuel(String(b.id || "").toUpperCase());
      if (!d) return H.sendJson(res, 404, { error: "not_found" });
      const st = P.duelState(d.kicks);
      if (st.done) return H.sendJson(res, 409, { error: "done" });
      let me = sideOf(d, b.device), join = null;
      if (!me) {
        if (d.b_device || b.device === d.a_device) return H.sendJson(res, 409, { error: "taken" });
        const nm = P.cleanName(b.name);
        if (!nm) return bad(res);
        me = "b";
        join = { b_device: b.device, b_name: nm, b_char: cleanChar(b.char), b_club: P.cleanClub(b.club), b_lvl: cleanLvl(b.lvl) };
      }
      if (st.turn !== me || b.v !== d.v) return H.sendJson(res, 409, Object.assign({ error: "turn" }, await duelView(d, b.device)));
      const kicks = d.kicks.map((k) => Object.assign({}, k));
      let outcome = null, against = null;
      if (st.need === "dive") {
        if (!P.validDive(b.dive)) return bad(res);
        const k = kicks[kicks.length - 1];
        outcome = P.judge(k, b.dive);
        k.dive = b.dive; k.outcome = outcome;
        against = P.strike(k.spot, k.power); against.power = k.power;
      } else {
        const shot = b.shot && { spot: b.shot.spot, power: b.shot.power };
        if (!P.validPick(shot) || kicks.length >= P.DUEL_MAX) return bad(res);
        kicks.push(shot);
      }
      const after = P.duelState(kicks);
      const patch = Object.assign({ kicks, v: d.v + 1, updated_at: new Date(t).toISOString() }, join || {});
      if (after.done) { patch.result = { a: after.score.a, b: after.score.b, winner: after.winner }; patch.finished_at = patch.updated_at; }
      if (!(await db.updateDuel(d.id, d.v, patch))) return H.sendJson(res, 409, { error: "busy" });
      const nd = Object.assign({}, d, patch);
      if (after.done || after.turn !== me) {
        try { await notify(nd, me === "a" ? "b" : "a", after, t); } catch (e) { await report(e, { route: "penalty/notify" }); }
      }
      return H.sendJson(res, 200, Object.assign(await duelView(nd, b.device), { outcome, against }));
    },
    /* Every duel this device is in from the last fortnight, theirs-to-play first. */
    async duels(req, res, t) {
      const dev = String((req.query || {}).device || "");
      if (!DEV_RE.test(dev)) return bad(res);
      const rows = await db.myDuels(dev, new Date(t - 14 * DAY_MS).toISOString());
      const list = rows.map((d) => {
        const me = sideOf(d, dev), st = P.duelState(d.kicks || []);
        return { id: d.id, opp: me === "a" ? d.b_name : d.a_name, mine: st.turn === me, done: st.done,
          won: st.done && st.winner === me, draw: st.winner === "draw", you: st.score[me], them: st.score[me === "a" ? "b" : "a"] };
      });
      list.sort((x, y) => (y.mine && !y.done) - (x.mine && !x.done));
      return H.sendJson(res, 200, { duels: list });
    },
    /* Opt in (or out) of "your turn" pings for this device. */
    async duel_push(req, res) {
      const b = await H.readJson(req, 2048);
      if (!b || !DEV_RE.test(String(b.device))) return bad(res);
      if (b.off) return H.sendJson(res, 200, { ok: await db.dropPush(b.device) });
      const V = require("../lib/vapid.js"), s = b.sub || {}, k = s.keys || {};
      if (!V.allowedEndpoint(s.endpoint) || String(s.endpoint).length > 1024 || !k.p256dh || !k.auth ||
          String(k.p256dh).length > 256 || String(k.auth).length > 256) return bad(res);
      const ok = await db.putPush({ device: b.device, endpoint: s.endpoint, p256dh: k.p256dh, auth: k.auth, updated_at: new Date().toISOString() });
      return H.sendJson(res, ok ? 200 : 503, { ok });
    },
    /* What the service worker shows for an empty push: this subscription's
       latest duel line, if it is fresh; otherwise nothing (and the worker
       falls back to the daily code it always showed). */
    async note(req, res, t) {
      const ep = String((req.query || {}).endpoint || "");
      if (!require("../lib/vapid.js").allowedEndpoint(ep)) return H.sendJson(res, 200, {});
      const r = await db.pushByEndpoint(ep);
      const fresh = r && r.note && r.note_at && t - Date.parse(r.note_at) < 15 * 60e3;
      return H.sendJson(res, 200, fresh ? r.note : {});
    },
    async pushkey(req, res) { return H.sendJson(res, 200, sendPush ? { key: process.env.VAPID_PUBLIC_KEY } : {}); },
  });
  const POSTS = new Set(["create", "kick", "daily", "picks", "ranked", "duel_new", "duel_turn", "duel_push"]);

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
/* The wizard's daily slip (data/daily-codes.json, written by the mint): the
   one for this Lagos day, or the latest before it; never a future one. */
function pickCode(map, today) {
  const days = Object.keys(map || {}).filter((d) => d <= today).sort();
  const d = days[days.length - 1];
  if (!d) return null;
  const e = map[d] || {};
  return { date: d, games: (e.legs || []).length, odds: e.odds, codes: e.codes || {} };
}
/* An empty push (no payload - the service worker asks /api/penalty?a=note
   what to say), signed with the same VAPID key as the daily-code pings. Null
   when the private key is not set here, and then nothing is sent. */
function defaultSendPush() {
  const priv = process.env.VAPID_PRIVATE_KEY, pub = process.env.VAPID_PUBLIC_KEY;
  if (!priv || !pub) return null;
  const V = require("../lib/vapid.js");
  return async (endpoint) => {
    if (!V.allowedEndpoint(endpoint)) return 0;
    try {
      const r = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(4000),
        headers: { Authorization: "vapid t=" + V.jwtFor(endpoint, { privateKeyB64: priv }) + ", k=" + pub, TTL: "3600", Urgency: "high" } });
      return r.status;
    } catch (e) { return 0; }
  };
}
let TIPS = null;
function defaultTips() {
  if (TIPS) return TIPS;
  try {
    const d = require("../public/predictions.json");
    const p = d.potd || {};
    const f = (d.fixtures || []).find((x) => x.home === p.home && x.away === p.away && x.date === p.date);
    TIPS = f ? { home: f.home, away: f.away, tip: f.tip, pct: Math.round(f.tip_p * 100), league: f.league } : {};
  } catch (e) { TIPS = {}; }
  try { TIPS = Object.assign({}, TIPS, { code: pickCode(require("../data/daily-codes.json"), P.lagosDay(Date.now())) }); } catch (e) {}
  return TIPS;
}

module.exports = make({ db: Object.assign({}, require("../lib/penaltydb.js"), { rlHit: require("../lib/auth/db.js").rlHit }),
  report: (e, c) => require("../lib/report.js").report(e, c) });
module.exports.make = make;
module.exports.pickCode = pickCode;
