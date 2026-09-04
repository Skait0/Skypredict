"use strict";

const { applyCache, NO_STORE } = require("../lib/cachepolicy.js");

/* POST /api/share - remember a slip against its booking code.
 *
 * Called once, by the browser, right after a code is minted. It exists so the
 * share link can be `/s/MS0LJY` instead of four hundred characters of base64:
 * the code is already a short unique name for the slip, so it makes a better
 * key than anything we could invent.
 *
 * What gets stored is OUR self-contained payload, not SportyBet's list of
 * event ids. Their lookup does exist - `GET /api/ng/orders/share/<code>` - and
 * returns references with no team names, and the only feed that maps those ids
 * to teams drops a match at kick-off. Resolving them would leave a shared slip
 * with missing games hours after it was sent, which is the exact rot the
 * payload format was designed to prevent.
 *
 * The body is whatever a browser sent, so it is validated by decoding it. If
 * it does not decode into a slip we will not store it - this endpoint takes no
 * one's word for anything.
 */

const SL = require("../lib/sliplink.js");
const DB = require("../lib/supabase.js");

const MAX_BODY = 12000;

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") { try { return Promise.resolve(JSON.parse(req.body)); } catch (e) { return Promise.resolve(null); } }
  return new Promise((resolve) => {
    let s = "", over = false;
    req.on("data", (d) => {
      s += d;
      if (s.length > MAX_BODY) { over = true; req.destroy(); }
    });
    req.on("end", () => {
      if (over) return resolve(null);
      try { resolve(JSON.parse(s)); } catch (e) { resolve(null); }
    });
    req.on("error", () => resolve(null));
  });
}

function reply(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  applyCache(res, NO_STORE);
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return reply(res, 405, { ok: false, why: "POST only" });

  const body = await readBody(req);
  if (!body) return reply(res, 400, { ok: false, why: "no body" });

  const code = SL.cleanCode(body.code);
  const book = SL.bookOf(body.book) || "sporty";
  const payload = typeof body.p === "string" ? body.p : "";

  if (!code) return reply(res, 400, { ok: false, why: "not a booking code" });

  /* Validated by decoding. Storing a payload we cannot read back would put a
     dead link into circulation, and the reader would find out, not us. */
  const got = SL.decode(payload);
  if (!got.ok) return reply(res, 400, { ok: false, why: got.why });

  /* Not configured is not an error the caller can act on, and the share link
     falls back to the long form on its own. Say so and move on. */
  if (!DB.configured()) return reply(res, 200, { ok: false, why: "storage not configured" });

  const out = await DB.putSharedSlip({ code, book, payload });
  if (!out.ok) return reply(res, 200, { ok: false, why: out.why });
  return reply(res, 200, { ok: true, code });
};
