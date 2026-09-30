"use strict";
/* Server-side errors to the same Sentry project the website uses (owner's
   choice, 29 Sep 2026), tagged runtime:server. No SDK: one POST of an
   envelope. Personal data is scrubbed before anything leaves: emails, 6-digit
   codes, 43-char tokens and 64-char hashes. Reporting must never break the
   request it reports on, so report() swallows its own failures. */
function scrub(text) {
  return String(text == null ? "" : text)
    .replace(/[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi, "[email]")
    .replace(/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, "[token]")
    .replace(/\b[0-9a-f]{64}\b/g, "[hash]")
    .replace(/\b\d{6}\b/g, "[code]");
}

function envelope(dsn, err, extra, now) {
  const m = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(String(dsn || ""));
  if (!m) return null;
  const [, key, host, project] = m;
  const id = require("crypto").randomBytes(16).toString("hex");
  const tags = Object.assign({}, extra || {}, { runtime: "server" });
  Object.keys(tags).forEach((k) => { tags[k] = scrub(tags[k]).slice(0, 200); });
  const event = {
    event_id: id, timestamp: (now || Date.now()) / 1000, platform: "node", level: "error",
    tags,
    exception: { values: [{ type: scrub((err && err.name) || "Error"),
      value: scrub((err && err.message) || String(err)).slice(0, 500),
      stacktrace: { frames: String((err && err.stack) || "").split("\n").slice(1, 15).reverse()
        .map((l) => ({ filename: scrub(l.trim()).slice(0, 200) })) } }] },
  };
  const body = JSON.stringify({ event_id: id, sent_at: new Date(now || Date.now()).toISOString() }) + "\n" +
    JSON.stringify({ type: "event" }) + "\n" + JSON.stringify(event);
  return {
    url: "https://" + host + "/api/" + project + "/envelope/",
    headers: { "Content-Type": "application/x-sentry-envelope",
      "X-Sentry-Auth": "Sentry sentry_version=7, sentry_key=" + key + ", sentry_client=sw-server/1.0" },
    body,
  };
}

async function report(err, extra) {
  try {
    const e = envelope(process.env.SENTRY_DSN, err, extra, Date.now());
    if (!e) { console.error("[server]", scrub(err && err.message)); return; }
    await fetch(e.url, { method: "POST", headers: e.headers, body: e.body, signal: AbortSignal.timeout(2500) });
  } catch (e2) { /* reporting never breaks the request */ }
}

module.exports = { scrub, envelope, report };
