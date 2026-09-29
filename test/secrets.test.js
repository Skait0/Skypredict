// test/secrets.test.js
"use strict";
/* No secret may ship to a browser (spec section 5, "API keys hidden").
   Scans every text file under public/ and the rendered /login page for
   secret-shaped strings and for the literal value of every secret env var
   present when the suite runs (so on Vercel, where they are set, a leak of the
   real value fails the build's tests too). */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const PATTERNS = [
  [/sk_(live|test)_[A-Za-z0-9]{10,}/, "Stripe-style secret key"],
  [/\bre_[A-Za-z0-9_]{20,}/, "Resend API key"],
  [/GOCSPX-[A-Za-z0-9_-]{10,}/, "Google OAuth client secret"],
  [/service_role/, "Supabase service role"],
  [/eyJhbGciOi[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "a JWT (Supabase keys are JWTs)"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
];
const SECRET_ENVS = ["GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "AUTH_PEPPER", "TURNSTILE_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET", "SWEEP_KEY", "TELEGRAM_BOT_TOKEN", "BUFFER_KEY"];
const TEXT = /\.(html|js|json|css|txt|xml|webmanifest|md|svg)$/i;

function files(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(files(p));
    else if (TEXT.test(e.name) && fs.statSync(p).size < 20e6) out.push(p);
  }
  return out;
}

test("nothing under public/ or in the login page looks like a secret", () => {
  const sources = files(path.join(__dirname, "..", "public")).map((f) => [path.relative(process.cwd(), f), fs.readFileSync(f, "utf8")]);
  assert.ok(sources.some(([name]) => /public[\\/]index\.html$/.test(name)), "public/index.html must be scanned");
  sources.push(["renderLogin", require("../lib/pages.js").renderLogin({ siteKey: "0x4AAAAAAAsitekey" })]);
  const values = SECRET_ENVS.map((k) => process.env[k]).filter((v) => v && v.length >= 8);
  for (const [name, text] of sources) {
    for (const [re, what] of PATTERNS) assert.doesNotMatch(text, re, name + " contains " + what);
    for (const v of values) assert.ok(!text.includes(v), name + " contains the value of a secret env var");
  }
});
