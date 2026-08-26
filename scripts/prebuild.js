"use strict";

/**
 * Runs at deploy time (Vercel runs `npm run build`). Two jobs, both about the
 * first paint a visitor gets:
 *
 * 1. Bake the payload into public/predictions.json. Building means fetching
 *    ~60 CSVs and fitting the model, which takes tens of seconds. Doing that
 *    inside a request means the unlucky visitor who arrives on a cold cache
 *    waits for it. Baked at deploy, the page loads from a static file on the
 *    CDN - no serverless invocation at all, which is also what lets the site
 *    take a crowd. /api/predictions stays as the freshness path.
 *
 * 2. Split the one big <style> and the one big <script> out of index.html into
 *    content-hashed files. index.html is ~356KB and every byte of it is
 *    render-blocking; split, a repeat visitor downloads a few KB of HTML and
 *    takes the rest from cache. Hashed names mean they can be cached forever
 *    and still change the moment they actually change.
 *
 * index.html stays a single readable file in git - the split happens on a
 * fresh checkout during the build and is never committed.
 *
 * Neither job may fail the deploy. A missing predictions.json just means the
 * page falls back to the API; an unsplit index.html is simply the old,
 * working, slower page.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PUB = path.join(__dirname, "..", "public");
const IDX = path.join(PUB, "index.html");

const log = (m) => console.log("[prebuild] " + m);
const warn = (m) => console.warn("[prebuild] " + m);

function hash(s) {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 10);
}

/* ---------------------------------------------------------------- 1. bake */
async function bakePayload() {
  let buildPayload, MIN;
  try {
    ({ buildPayload } = require("../lib/build.js"));
    MIN = require("../api/predictions.js").MIN_HEALTHY_FIXTURES || 20;
  } catch (e) {
    warn("cannot load the builder, skipping bake: " + e.message);
    return;
  }
  const t0 = Date.now();
  let payload;
  try {
    payload = await buildPayload({});
  } catch (e) {
    warn("build failed, skipping bake (the page will use /api/predictions): " + e.message);
    return;
  }
  const n = (payload && Array.isArray(payload.fixtures)) ? payload.fixtures.length : 0;
  if (n < MIN) {
    /* Same rule the API uses: a thin build is a broken feed, not a quiet day,
       and baking one would pin it in place until the next deploy. */
    warn("only " + n + " fixtures - refusing to bake a thin payload");
    return;
  }
  const { log: _drop, ...rest } = payload;
  const out = path.join(PUB, "predictions.json");
  fs.writeFileSync(out, JSON.stringify(rest));
  log("baked " + n + " fixtures -> predictions.json (" +
      (fs.statSync(out).size / 1024).toFixed(0) + " KB, " +
      ((Date.now() - t0) / 1000).toFixed(1) + "s)");
}

/* --------------------------------------------------------------- 2. split */
function biggest(html, re) {
  const found = [...html.matchAll(re)];
  if (!found.length) return null;
  return found.sort((a, b) => b[1].length - a[1].length)[0];
}

function splitAssets() {
  let html;
  try {
    html = fs.readFileSync(IDX, "utf8");
  } catch (e) {
    warn("no index.html to split: " + e.message);
    return;
  }
  if (/<link[^>]+href="\/app\.[0-9a-f]+\.css"/.test(html)) {
    log("index.html is already split, nothing to do");
    return;
  }

  const before = Buffer.byteLength(html);

  const style = biggest(html, /<style[^>]*>([\s\S]*?)<\/style>/g);
  if (style) {
    const name = "app." + hash(style[1]) + ".css";
    fs.writeFileSync(path.join(PUB, name), style[1]);
    html = html.replace(style[0], '<link rel="stylesheet" href="/' + name + '">');
    log("extracted " + name + " (" + (style[1].length / 1024).toFixed(0) + " KB)");
  } else {
    warn("no <style> found");
  }

  /* Only inline scripts, and only the big one. The three small blocks stay
     where they are: the theme bootstrap has to run before first paint or the
     page flashes the wrong colours, and the other two are self-contained and
     too small to be worth a request. None of them call into the big block, so
     deferring it cannot break them. */
  const script = biggest(html, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g);
  if (script) {
    const name = "app." + hash(script[1]) + ".js";
    fs.writeFileSync(path.join(PUB, name), script[1]);
    html = html.replace(script[0], '<script defer src="/' + name + '"></script>');
    log("extracted " + name + " (" + (script[1].length / 1024).toFixed(0) + " KB)");
  } else {
    warn("no inline <script> found");
  }

  fs.writeFileSync(IDX, html);
  log("index.html " + (before / 1024).toFixed(0) + " KB -> " +
      (Buffer.byteLength(html) / 1024).toFixed(0) + " KB");

  if (!process.env.VERCEL) {
    warn("NOT a Vercel build - public/index.html has been rewritten in place.");
    warn("Restore it before committing:  git checkout public/index.html");
  }
}

/* ------------------------------------------------------------------- run */
(async () => {
  await bakePayload();
  splitAssets();
})().catch((e) => {
  /* Never fail the deploy over an optimisation. */
  warn("unexpected error, continuing: " + (e && e.message));
});
