"use strict";
/* Sync: validate() cuts what a browser sends down to the keys and fields we
   know; merge() joins two copies so nothing either device saved is lost and
   nothing deleted comes back. Pure - no I/O, no clock but nowMs - so every
   rule is pinned by test/sync.test.js. Spec section 6. */
const MAX_BYTES = 262144, MAX_SLIPS = 1000, MAX_LEGS = 60, MAX_STR = 500, MAX_KEYS = 1000;
const MAX_STORED = 1048576;                  // one reader's row, whatever they post over time
const TOMB_MS = 60 * 864e5;
const PREF_KEYS = ["book", "mk", "risk", "mode", "wspodds", "bldpick", "volin", "toponly", "scope", "legodd",
  "avatar", "name", "theme"];
/* The portraits in public/av/. The first six are free; the rest are plan skins
   and are refused until plans exist, so a hand-edited request cannot unlock one. */
const AVATARS = ["fire", "8bit", "2bit", "lino", "glass", "halo",
  "storm", "lich", "gold", "holo", "graffiti", "afro", "lowpoly", "clay"];
const FREE_AVATARS = AVATARS.slice(0, 6);
/* Per-key value rules on top of the string check: null means drop it. */
const PREF_VALUE = {
  avatar: (v) => (FREE_AVATARS.indexOf(v) >= 0 ? v : null),
  name: (v) => { const t = String(v).trim(); return t && t.length <= 24 && !/[<>]/.test(t) ? t : null; },
  theme: (v) => (v === "dark" || v === "light" ? v : null),
};
const SID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/* Field -> allowed types: s string (<= 500 chars), n finite number, b boolean, z null. */
const SLIP = { sid: "s", at: "s", updatedAt: "s", code: "sz", book: "sz", odds: "n", settled: "b",
  won: "bz", hits: "n", graded: "n", told: "bn" };
const LEG = { id: "sn", code: "s", label: "s", home: "s", away: "s", date: "s", kickoff: "sz",
  p: "n", odd: "n", res: "sz", hg: "nz", ag: "nz" };
const MY = { id: "sn", code: "s", label: "s", p: "n", auto: "b", via: "s", k: "sn" };

const isObj = (o) => !!o && typeof o === "object" && !Array.isArray(o);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function typeOk(v, t) {
  if (v === null) return t.includes("z");
  if (typeof v === "string") return t.includes("s") && v.length <= MAX_STR;
  if (typeof v === "number") return t.includes("n") && Number.isFinite(v);
  if (typeof v === "boolean") return t.includes("b");
  return false;
}
function pick(o, spec) {
  const out = {};
  for (const k of Object.keys(spec)) if (has(o, k) && typeOk(o[k], spec[k])) out[k] = o[k];
  return out;
}
const count = (v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
function stampMap(m, keyOk) {
  const out = {};
  if (!isObj(m)) return out;
  Object.keys(m).slice(0, MAX_KEYS).forEach((k) => {
    const v = count(m[k]);
    if (v != null && k.length <= 200 && (!keyOk || keyOk(k))) out[k] = v;
  });
  return out;
}

function empty() {
  return { v: 1, slips: { items: {}, tomb: {} }, myslip: { items: [], at: 0 },
    livefav: { items: {}, tomb: {} }, leaguefav: { items: {}, tomb: {} }, prefs: {}, record: { n: 0, won: 0 } };
}

function validate(p, opts) {
  if (!isObj(p)) return { ok: false, error: "bad_shape" };
  let size;
  try { size = Buffer.byteLength(JSON.stringify(p)); } catch (e) { return { ok: false, error: "bad_shape" }; }
  if (size > MAX_BYTES) return { ok: false, error: "too_big" };
  const d = empty();
  const s = isObj(p.slips) ? p.slips : {};
  const items = isObj(s.items) ? s.items : {};
  const sids = Object.keys(items);
  if (sids.length > MAX_SLIPS) return { ok: false, error: "too_big" };
  for (const sid of sids) {
    const raw = items[sid];
    if (!SID_RE.test(sid) || !isObj(raw) || !Array.isArray(raw.legs) || raw.legs.length > MAX_LEGS) continue;
    const slip = pick(raw, SLIP);
    slip.sid = sid;
    slip.legs = raw.legs.filter(isObj).map((l) => pick(l, LEG));
    d.slips.items[sid] = slip;
  }
  d.slips.tomb = stampMap(s.tomb, (k) => SID_RE.test(k));
  if (isObj(p.myslip)) {
    d.myslip.items = (Array.isArray(p.myslip.items) ? p.myslip.items : []).slice(0, MAX_LEGS).filter(isObj).map((x) => pick(x, MY));
    d.myslip.at = count(p.myslip.at) || 0;
  }
  for (const k of ["livefav", "leaguefav"]) {
    if (isObj(p[k])) { d[k].items = stampMap(p[k].items); d[k].tomb = stampMap(p[k].tomb); }
  }
  if (isObj(p.prefs)) {
    for (const k of PREF_KEYS) {
      const e = p.prefs[k];
      if (k === "avatar" && opts && opts.avatars && isObj(e) && e.v !== null) {
        if (typeOk(e.v, "sz") && count(e.at) != null && opts.avatars.indexOf(e.v) >= 0) d.prefs[k] = { v: e.v, at: count(e.at) };
        continue;
      }
      if (isObj(e) && typeOk(e.v, "sz") && count(e.at) != null) {
        const v = PREF_VALUE[k] && e.v !== null ? PREF_VALUE[k](e.v) : e.v;
        if (v !== null || !PREF_VALUE[k]) d.prefs[k] = { v, at: count(e.at) };
      }
    }
  }
  if (isObj(p.record)) d.record = { n: count(p.record.n) || 0, won: count(p.record.won) || 0 };
  return { ok: true, data: d };
}

/* Our own stored copy is trusted (it was merged here), but may predate a key. */
function fill(d) {
  const e = empty();
  if (!isObj(d)) return e;
  for (const k of Object.keys(e)) if (has(d, k)) e[k] = d[k];
  return e;
}

const ts = (s) => Date.parse((s && (s.updatedAt || s.at)) || "") || 0;
const graded = (s) => !!s && s.settled === true;
/* a is the server's copy, b the device's; a tie keeps the server's. */
function better(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (graded(a) !== graded(b)) return graded(a) ? a : b;
  return ts(b) > ts(a) ? b : a;
}
function maxMap(a, b) {
  const out = Object.assign({}, a);
  Object.keys(b).forEach((k) => { if (!has(out, k) || b[k] > out[k]) out[k] = b[k]; });
  return out;
}
function fresh(tomb, nowMs) {
  const out = {};
  Object.keys(tomb).sort().forEach((k) => { if (nowMs - tomb[k] <= TOMB_MS) out[k] = tomb[k]; });
  return out;
}
function sortedObj(o) {
  const out = {};
  Object.keys(o).sort().forEach((k) => { out[k] = o[k]; });
  return out;
}

function mergeSlips(S, C, record, nowMs) {
  const tomb = maxMap(S.tomb, C.tomb);
  const items = {};
  /* A deleted slip stays deleted: its tombstone beats every copy, however
     new (Review Focus 2). A re-booked slip gets a new sid anyway. */
  Array.from(new Set(Object.keys(S.items).concat(Object.keys(C.items)))).sort().forEach((sid) => {
    if (!has(tomb, sid)) items[sid] = better(S.items[sid], C.items[sid]);
  });
  /* The same booking code is the same slip. Sorted so the survivor does not
     depend on which device's keys came first. */
  const byCode = {};
  Object.keys(items).forEach((sid) => {
    const s = items[sid];
    if (!s.code) return;
    const prev = byCode[s.code];
    if (!prev) { byCode[s.code] = sid; return; }
    const keep = better(items[prev], s) === s ? sid : prev;
    delete items[keep === sid ? prev : sid];
    byCode[s.code] = keep;
  });
  /* Past the caps, the oldest graded slips fold into the record, then the
     oldest of the rest go. A tombstone stops a device re-sending one and it
     being counted twice. */
  const sids = Object.keys(items).sort((x, y) => ts(items[x]) - ts(items[y]) || (x < y ? -1 : 1));
  const size = {};
  let total = 0;
  sids.forEach((sid) => { size[sid] = JSON.stringify(items[sid]).length; total += size[sid]; });
  let n = sids.length;
  const over = () => n > MAX_SLIPS || total > MAX_STORED;
  for (const pass of [graded, () => true]) {
    for (const sid of sids) {
      if (!over()) break;
      if (!items[sid] || !pass(items[sid])) continue;
      if (graded(items[sid])) { record.n++; if (items[sid].won === true) record.won++; }
      delete items[sid]; tomb[sid] = nowMs; n--; total -= size[sid];
    }
  }
  return { items: sortedObj(items), tomb: fresh(tomb, nowMs) };
}

function mergeSet(S, C, nowMs) {
  const items = maxMap(S.items, C.items), tomb = maxMap(S.tomb, C.tomb);
  Object.keys(items).forEach((k) => {
    if (!has(tomb, k)) return;
    if (tomb[k] >= items[k]) delete items[k]; else delete tomb[k];
  });
  return { items: sortedObj(items), tomb: fresh(tomb, nowMs) };
}

function merge(server, client, nowMs) {
  const S = fill(server), C = fill(client);
  const record = { n: Math.max(S.record.n | 0, C.record.n | 0), won: Math.max(S.record.won | 0, C.record.won | 0) };
  const prefs = {};
  PREF_KEYS.forEach((k) => {
    const a = S.prefs[k], b = C.prefs[k];
    const w = !a ? b : !b ? a : b.at > a.at ? b : a;
    if (w) prefs[k] = w;
  });
  return {
    v: 1,
    slips: mergeSlips(S.slips, C.slips, record, nowMs),
    myslip: C.myslip.at > S.myslip.at ? C.myslip : S.myslip,
    livefav: mergeSet(S.livefav, C.livefav, nowMs),
    leaguefav: mergeSet(S.leaguefav, C.leaguefav, nowMs),
    prefs,
    record,
  };
}

module.exports = { validate, merge, empty, MAX_BYTES, MAX_SLIPS, MAX_LEGS, MAX_STR, TOMB_MS, PREF_KEYS, AVATARS, FREE_AVATARS };
