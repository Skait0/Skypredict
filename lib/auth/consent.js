"use strict";
/* Marketing email consent. A row exists only because a reader ticked the
   box; the wording saved is the server's own copy of the checkbox text,
   never the client's. Unsubscribe links carry an HMAC of the user id, so
   they work without signing in and cannot be forged. Spec section 7. */
const crypto = require("crypto");
const { ORIGIN } = require("./http.js");
const { report } = require("../report.js");

const WORDING = "Email me the wizard's best picks. Unsubscribe any time.";

async function record(db, userId, optin, source, nowMs) {
  if (optin !== true) return;
  /* Never throws and never fails the sign-in it rides on; a lost write is reported. */
  try {
    const cur = await db.consentFor(userId);
    if (cur && !cur.revoked_at) return;                   // already opted in: keep the original record
    const ok = await db.upsertConsent(userId, { granted_at: new Date(nowMs).toISOString(), wording: WORDING, source });
    if (ok === false) await report(new Error("consent write failed"), { route: "consent" });
  } catch (e) { await report(e, { route: "consent" }); }
}

const unsubToken = (pepper, userId) =>
  crypto.createHmac("sha256", String(pepper)).update("unsub:" + userId).digest("base64url").slice(0, 22);
const unsubUrl = (pepper, userId) => ORIGIN + "/api/auth/unsub?u=" + userId + "&t=" + unsubToken(pepper, userId);

module.exports = { WORDING, record, unsubToken, unsubUrl };
