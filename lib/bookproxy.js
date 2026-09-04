"use strict";

const { applyCache, NO_STORE } = require("./cachepolicy.js");

/**
 * Booking, routed through this origin instead of straight at Railway.
 *
 * Every other upstream call already comes through Vercel - see
 * lib/upstream.js - which puts it behind the same Cloudflare edge that serves
 * the site. Booking was the one thing the browser called Railway directly for,
 * and it is the one thing users said was slow.
 *
 * Measured from a Lagos connection on 2 Sep 2026, the same upstream payload
 * over both paths, five samples each:
 *
 *   via this origin   0.56  0.49  0.48  0.50  0.45   seconds
 *   direct to Railway 2.27  60.0  60.0  3.80  4.39   seconds
 *
 * Two of five direct calls hit a sixty-second wall. The cause is not the
 * application: Railway's own metrics put server-side p99 at 659ms with the
 * container at 0.04 of 8 vCPU. It is the path. Railway has no presence near
 * Lagos, so each call pays an intercontinental TCP handshake and another for
 * TLS, on a route that intermittently stalls. Cloudflare terminates TLS at a
 * local PoP and keeps warm connections to origin, which is why the same bytes
 * arrive in half a second.
 *
 * WHAT THIS MUST NOT DO.
 *
 * A booking rejection is not a failure - it is the answer. When Bet9ja or
 * SportyBet refuse a slip they return 400 with a named `unbookable` list, and
 * the site drops exactly those legs and retries (dropUnbookable in
 * index.html, keyed on eventId + "|" + prediction). So the upstream status and
 * body are passed through untouched. Flattening a 400 into a 200, or losing
 * that list, would turn a recoverable rejection into a slip that fails
 * forever with nothing to retry.
 *
 * Nothing here is cached. A booking code is minted per request.
 */

const UPSTREAM = "https://web-production-798c0.up.railway.app";

/* Which upstream each bookmaker books against. Named rather than taken from
   the query string directly, so a caller cannot point this at an arbitrary
   path on the upstream host. */
const BOOKS = {
  sporty: "/api/generate-booking-code",
  bet9ja: "/api/bet9ja/booking-code",
};

/* Longer than the feeds' 8s: the upstream calls the bookmaker, which it gives
   10s of its own, and a booking that takes four seconds is still a booking.
   Bounded so a hung bookmaker cannot pin a serverless function open. */
const TIMEOUT_MS = 15000;

/* Read the JSON body whether the platform has parsed it or not. Vercel parses
   application/json into req.body, but a raw stream shows up on other runners
   and in tests, and silently sending `{}` upstream would look to the user like
   a bookmaker that rejects everything. */
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (e) { return null; }
  }
  let raw = "";
  try {
    for await (const chunk of req) raw += chunk;
  } catch (e) { return null; }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

/* Pure, so the rules about what reaches the user can be tested without a
   network: what status, what body, and whether a rejection survives. */
function bookResponse(up) {
  if (up && up.ok) {
    /* Includes upstream 4xx. A refused slip carries the list the retry needs,
       so it is forwarded exactly as it arrived. */
    return { status: up.status, body: up.body };
  }
  return {
    status: 502,
    body: {
      success: false,
      message: "Could not reach the booking service",
      detail: (up && up.why) || "upstream unavailable",
    },
  };
}

async function postUpstream(path, payload) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(UPSTREAM + path, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    let body = null;
    try { body = await r.json(); }
    catch (e) { return { ok: false, why: "upstream sent no JSON (http " + r.status + ")" }; }
    return { ok: true, status: r.status, body };
  } catch (e) {
    return { ok: false, why: String((e && e.message) || e) };
  } finally {
    clearTimeout(t);
  }
}

function makeHandler() {
  return async (req, res) => {
    applyCache(res, NO_STORE);

    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "POST only" });
    }
    const which = String((req.query && req.query.book) || "sporty").toLowerCase();
    const path = BOOKS[which];
    if (!path) {
      return res.status(400).json({ success: false, message: "unknown bookmaker" });
    }
    const payload = await readBody(req);
    if (!payload || !Array.isArray(payload.selections) || !payload.selections.length) {
      return res.status(400).json({ success: false, message: "no selections" });
    }

    const up = await postUpstream(path, payload);
    const out = bookResponse(up);
    if (!up.ok) res.setHeader("X-Formline-Upstream", up.why);
    return res.status(out.status).json(out.body);
  };
}

module.exports = { makeHandler, bookResponse, readBody, BOOKS, UPSTREAM, TIMEOUT_MS };
