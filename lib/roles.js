"use strict";
/* Who is an admin, a Family & friends member, or on the free plan. Admin comes
   only from the SW_ADMIN_EMAILS env var, never from client data. */
const { AVATARS, FREE_AVATARS } = require("./sync.js"); // single source of truth for the portraits
const { report } = require("./report.js");
/* Skins: every role but free unlocks them, so a future paid role gets them with no change here. */
const SKIN_AVATARS = ["gold", "holo", "graffiti", "lowpoly", "clay",
  "runes", "noir", "goldbeard", "nebula", "cyber", "blaze", "synth", "abyss", "alchemist", "ink",
  "magma", "ent", "nomad", "wired"];
const FF_AVATARS = FREE_AVATARS.concat(SKIN_AVATARS);
/* One-person portraits, granted only by SW_PERSONAL_AVATARS ("key:email,key:email"). No role unlocks them. */
const PERSONAL_AVATARS = ["dread"];
const OWNER_AVATARS = AVATARS.filter((a) => !FF_AVATARS.includes(a) && !PERSONAL_AVATARS.includes(a));

const normEmail = (s) => String(s == null ? "" : s).trim().toLowerCase();

async function roleOf(db, user, env) {
  const email = normEmail(user && user.email);
  if (!email) return "free";
  const admins = String((env && env.SW_ADMIN_EMAILS) || "").split(",").map(normEmail);
  if (admins.includes(email)) return "admin";
  /* A failed grant read still answers "free" so the request goes on, but it is
     reported: a paying member quietly losing their plan must reach Sentry. */
  try { if (await db.grantFor(email)) return "ff"; }
  catch (e) { await report(e, { route: "roleOf" }); return "free"; }
  /* Plus: a prepaid pass (api/pay.js) whose period has not ended. */
  if (typeof db.subscription !== "function") return "free";
  try { return isPlus(await db.subscription(user.id)) ? "plus" : "free"; }
  catch (e) { await report(e, { route: "roleOf/plus" }); return "free"; }
}
const isPlus = (s, nowMs) => !!s && s.status === "active" && Date.parse(s.current_period_end) > (nowMs || Date.now());
const hasSkins = (role) => !!role && role !== "free";
const avatarsFor = (role) => role === "admin" ? FF_AVATARS.concat(OWNER_AVATARS) : hasSkins(role) ? FF_AVATARS.slice() : FREE_AVATARS.slice();
/* The personal portraits SW_PERSONAL_AVATARS grants this email, whatever its role. */
function personalAvatars(email, env) {
  const e = normEmail(email);
  if (!e) return [];
  return String((env && env.SW_PERSONAL_AVATARS) || "").split(",").map((p) => {
    const i = p.indexOf(":");
    return i > 0 && normEmail(p.slice(i + 1)) === e ? p.slice(0, i).trim().toLowerCase() : null;
  }).filter((k, i, a) => k && PERSONAL_AVATARS.includes(k) && a.indexOf(k) === i);
}
/* Owner, 16 Oct 2026: free accounts get 2 codes a day, every Plus pass 20. */
const FREE_CODES = 2, PLUS_CODES = 20;
const codeLimitFor = (role) => role === "admin" ? Infinity : role === "ff" ? 100 : role === "plus" ? PLUS_CODES : FREE_CODES;
const planLabel = (role) => role === "admin" ? "Admin" : role === "ff" ? "Family & friends" : role === "plus" ? "Wizard Pass" : "Free plan";

module.exports = { roleOf, isPlus, avatarsFor, hasSkins, personalAvatars, codeLimitFor, planLabel, normEmail, FREE_CODES, PLUS_CODES,
  FF_AVATARS, OWNER_AVATARS, PERSONAL_AVATARS };
