"use strict";
/* The paygate hook. access(user, feature): a feature with no row, or tier
   'free', is open to all; tier 'paid' needs an active subscription whose
   period has not ended. Nothing is gated yet (FEATURES is empty); the paygate
   spec will add rows to feature_access and names here. Spec section 7. */
const FEATURES = [];
const TTL_MS = 60e3;
let cache = { at: 0, tiers: null };

async function tiers(db, nowMs) {
  if (!cache.tiers || nowMs - cache.at > TTL_MS) cache = { at: nowMs, tiers: await db.featureTiers() };
  // ponytail: a failed read gives {} and so "free" for up to a minute; make featureTiers
  // distinguish failure from empty before the first feature is gated.
  return cache.tiers;
}

async function access(db, userId, feature, nowMs) {
  const t = nowMs || Date.now();
  if ((await tiers(db, t))[feature] !== "paid") return true;
  if (!userId) return false;
  const s = await db.subscription(userId);
  return !!s && s.status === "active" && Date.parse(s.current_period_end) > t;
}

async function entitlements(db, userId, features, nowMs) {
  const out = {};
  for (const f of features || []) out[f] = await access(db, userId, f, nowMs);
  return out;
}

const _reset = () => { cache = { at: 0, tiers: null }; };
module.exports = { FEATURES, access, entitlements, _reset };
