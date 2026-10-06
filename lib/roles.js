"use strict";
/* Who is an admin, a Family & friends member, or on the free plan. Admin comes
   only from the SW_ADMIN_EMAILS env var, never from client data. */
const FREE_AVATARS = ["fire", "8bit", "2bit", "lino", "glass", "halo"];
const FF_AVATARS = FREE_AVATARS.concat(["gold", "holo", "graffiti", "lowpoly", "clay"]);
const OWNER_AVATARS = ["afro", "storm", "lich"];

const normEmail = (s) => String(s == null ? "" : s).trim().toLowerCase();

async function roleOf(db, user, env) {
  const email = normEmail(user && user.email);
  if (!email) return "free";
  const admins = String((env && env.SW_ADMIN_EMAILS) || "").split(",").map(normEmail);
  if (admins.includes(email)) return "admin";
  try { return (await db.grantFor(email)) ? "ff" : "free"; } catch (e) { return "free"; }
}
const avatarsFor = (role) => role === "admin" ? FF_AVATARS.concat(OWNER_AVATARS) : role === "ff" ? FF_AVATARS.slice() : FREE_AVATARS.slice();
const codeLimitFor = (role) => role === "admin" ? Infinity : role === "ff" ? 100 : null;
const planLabel = (role) => role === "admin" ? "Admin" : role === "ff" ? "Family & friends" : "Free plan";

module.exports = { roleOf, avatarsFor, codeLimitFor, planLabel, normEmail, FF_AVATARS, OWNER_AVATARS };
