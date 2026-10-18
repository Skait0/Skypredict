"use strict";
/* /api/pay/:action - Plus passes through Paystack (owner, 16 Oct 2026).
   Prepaid, never auto-renewed. The prices and codes are lib/pricing.js: today's
   until 1 Nov 2026, then the new ones.
   Founding Wizards: the first 500 buyers pay N1,500 for their first 3 month passes.

     GET  offer    prices, and whether this reader still gets the founder price
     POST start    {pass} -> a pending payments row + Paystack checkout url
     GET  verify   ?ref= - the return page asks; settles if Paystack says paid
     POST webhook  Paystack's charge.success; settles the same way

   NOTHING FROM THE BROWSER OR THE WEBHOOK BODY IS TRUSTED. Both paths only
   name a reference; settle() asks Paystack itself (verify, with our secret
   key) and the database credits it once, and only for the amount we asked
   (apply_payment in sql/payments.sql). That is also why the webhook does not
   need the raw body for its signature: a forged call can at most make us ask
   Paystack about a reference of ours. */
const crypto = require("crypto");
const H = require("../lib/auth/http.js");
const S = require("../lib/auth/session.js");
const { report } = require("../lib/report.js");

const P = require("../lib/pricing.js");
const FOUNDER = { kobo: 150000, seats: 500, months: 3 };

/* The founder price, for a month pass only: still seats left, or this reader
   already holds one, and fewer than 3 founder months paid. */
const founderOpen = (o) => !!o && o.mine < FOUNDER.months && (o.mine > 0 || o.taken < FOUNDER.seats);
const priceOf = (pass, offer, t) => pass === "month" && founderOpen(offer) ? FOUNDER.kobo : P.passesAt(t)[pass].kobo;

function paystack(secret, fetchImpl) {
  const f = fetchImpl || fetch;
  const ask = async (path, init) => {
    const r = await f("https://api.paystack.co" + path, Object.assign({ signal: AbortSignal.timeout(10000) }, init,
      { headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" } }));
    const j = await r.json().catch(() => null);
    return r.ok && j && j.status === true ? j.data : null;
  };
  return {
    init: (body) => ask("/transaction/initialize", { method: "POST", body: JSON.stringify(body) }),
    verify: (ref) => ask("/transaction/verify/" + encodeURIComponent(ref), { method: "GET" }),
  };
}

function make(deps) {
  const { db } = deps;
  const env = deps.env || process.env;
  const now = deps.now || Date.now;

  /* WELCOME, FOUNDING WIZARD (owner, 16 Oct 2026): the crest and a thank-you in
     their inbox, once - on the payment that made them one (their first founder
     month; applyPayment credits a reference only once, so a retried webhook or
     the return page cannot send it twice). Never fails the payment. */
  const msgs = deps.msgs || require("../lib/messages.js");
  async function welcomeFounder(userId) {
    try {
      const o = await db.founderOffer(userId);
      if (!o || o.mine !== 1) return;
      const MSG = require("../public/messages.js");
      await msgs.add([{ created_at: new Date(now()).toISOString(), user_id: userId, from_admin: true,
        body: MSG.clean(MSG.founderHtml(Number.isInteger(o.no) ? o.no : null)) }]);
    } catch (e) { /* the pass is credited; a lost thank-you is not worth a failed payment */ }
  }

  /* Paid at Paystack, in naira, for the amount on our row -> credited once.
     Returns the pass end (ISO) when this reference is paid, else null. */
  async function settle(ps, ref) {
    const row = await db.paymentByRef(ref);
    if (!row) return null;
    if (row.status !== "paid") {
      const t = await ps.verify(ref);
      if (!t || t.status !== "success" || t.currency !== "NGN" || Number(t.amount) !== row.amount_kobo) return null;
      const end = await db.applyPayment(ref, row.amount_kobo);
      if (end) {
        /* The flag, not the amount: from 1 Nov a Week pass also costs N1,500. */
        if (row.founder) await welcomeFounder(row.user_id);
        return new Date(end).toISOString();
      }
    }
    const s = await db.subscription(row.user_id);
    return s && s.current_period_end ? new Date(s.current_period_end).toISOString() : null;
  }

  return async function handler(req, res) {
    const secret = env.PAYSTACK_SECRET_KEY || "";
    if (!H.enabled() || !secret) return H.notFound(res);
    const ps = deps.paystack || paystack(secret);
    const action = String((req.query || {}).action || "");
    try {
      if (action === "webhook") {
        if (req.method !== "POST") return H.sendJson(res, 405, { error: "method" });
        const body = await H.readJson(req, 64 * 1024);
        const ref = body && body.event === "charge.success" && body.data && body.data.reference;
        if (typeof ref === "string" && db.REF_RE.test(ref)) await settle(ps, ref);
        return H.sendJson(res, 200, { ok: true });   /* any other event is not ours to act on */
      }

      if (action === "start") { const g = H.guardPost(req); if (g) return H.sendJson(res, g.status, { error: g.error }); }
      else if (action !== "offer" && action !== "verify") return H.notFound(res);
      else if (req.method !== "GET") return H.sendJson(res, 405, { error: "method" });

      const t = now();
      const s = await S.readSession(db, req, t);
      const signedIn = s.state === "ok";
      const cookies = s.setCookie ? [s.setCookie] : null;

      if (action === "offer") {
        const o = await db.founderOffer(signedIn ? s.userId : null).catch(() => null);
        const cur = P.passesAt(t), soon = t < P.SWITCH_AT;
        /* Before the switch each pass also carries its new price (next), which the card
           strikes through beside today's. */
        return H.sendJson(res, 200, {
          passes: Object.keys(cur).map((k) => ({ pass: k, days: cur[k].days, label: cur[k].label,
            codes: cur[k].codes, unlimited: !!cur[k].unlimited, naira: priceOf(k, o, t) / 100, full: cur[k].kobo / 100,
            next: soon && P.NEXT[k] ? P.NEXT[k].kobo / 100 : null })),
          switchAt: soon ? new Date(P.SWITCH_AT).toISOString() : null,
          founder: o ? { open: founderOpen(o), seatsLeft: Math.max(0, FOUNDER.seats - o.taken), monthsLeft: Math.max(0, FOUNDER.months - o.mine) } : null,
        }, cookies);
      }

      if (!signedIn) return H.sendJson(res, 401, { error: "signed_out" });

      if (action === "verify") {
        const ref = String((req.query || {}).ref || "");
        const row = db.REF_RE.test(ref) ? await db.paymentByRef(ref) : null;
        if (!row || row.user_id !== s.userId) return H.sendJson(res, 404, { error: "not_found" }, cookies);
        const until = await settle(ps, ref);
        return H.sendJson(res, 200, { paid: !!until, until, pass: row.pass }, cookies);
      }

      /* start */
      if (!(await db.rlHit("pay:" + s.userId, 600, 10))) return H.sendJson(res, 429, { error: "slow_down", minutes: 10 }, cookies);
      const body = await H.readJson(req, 1024);
      const pass = body && body.pass;
      const cur = P.passesAt(t);
      if (!Object.prototype.hasOwnProperty.call(cur, pass)) return H.sendJson(res, 400, { error: "bad_pass" }, cookies);
      const user = await db.userById(s.userId);
      if (!user || !user.email) return H.sendJson(res, 401, { error: "signed_out" });
      /* A founder-offer outage charges the full price rather than guessing. */
      const o = pass === "month" ? await db.founderOffer(s.userId).catch(() => null) : null;
      const kobo = priceOf(pass, o, t);
      const reference = "sw_" + crypto.randomBytes(10).toString("hex");
      const row = await db.insertPayment({ reference, user_id: s.userId, pass, days: cur[pass].days,
        /* The month's founder price only: from 1 Nov a Week pass also costs N1,500. */
        amount_kobo: kobo, founder: pass === "month" && founderOpen(o) });
      if (!row) throw new Error("payment row insert failed");
      const init = await ps.init({ email: user.email, amount: kobo, currency: "NGN", reference,
        callback_url: H.ORIGIN + "/?paid=" + reference, metadata: { pass } });
      if (!init || !init.authorization_url) return H.sendJson(res, 502, { error: "paystack_down" }, cookies);
      return H.sendJson(res, 200, { url: init.authorization_url, reference }, cookies);
    } catch (e) {
      await report(e, { route: "pay/" + action });
      /* Paystack retries a webhook that fails; a 500 here is what asks it to. */
      return H.sendJson(res, 500, { error: "server" });
    }
  };
}

module.exports = make({ db: require("../lib/auth/db.js") });
module.exports.make = make;
module.exports.FOUNDER = FOUNDER;
module.exports.priceOf = priceOf;
