"use strict";
/* THE DEPLOYED BUNDLE IS MINIFIED (owner, 11 Oct 2026: "is it possible to lock
 * our code from the console?"). Only the copy prebuild writes on Vercel -
 * public/index.html in git stays readable, and every other test reads it.
 *
 * The one rule that keeps the site working: top-level names survive. Buttons
 * built as strings call them by name (onclick="..."), and window.sw* hooks are
 * looked up from other scripts. So the minified bundle must declare exactly the
 * same top-level names as the source.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { minify } = require("terser");
const { minifyScript, minifyWithMap, sentryMap, stripMapUrl } = require("../scripts/prebuild.js");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const big = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .sort((a, b) => b[1].length - a[1].length)[0][1];

async function topNames(js) {
  const { ast } = await minify(js, { compress: false, mangle: false, format: { ast: true, code: false } });
  const out = new Set();
  for (const st of ast.body) {
    const t = st.TYPE;
    if (t === "Defun" || t === "DefClass") out.add(st.name.name);
    else if (t === "Var" || t === "Let" || t === "Const")
      for (const d of st.definitions) if (d.name && d.name.name) out.add(d.name.name);
  }
  return out;
}

let MIN;
test.before(async () => { MIN = await minifyScript(big); });

test("the minified bundle declares exactly the source's top-level names", async () => {
  const a = await topNames(big), b = await topNames(MIN);
  assert.ok(a.size > 500, "sanity: the source has its top-level functions");
  assert.deepStrictEqual([...b].sort(), [...a].sort());
});

test("comments are gone and the bundle is much smaller", () => {
  assert.ok(big.includes("NEAREST FIRST (owner, 11 Oct 2026"), "sanity: the source carries the comment");
  assert.ok(!MIN.includes("NEAREST FIRST"), "no comment survives");
  assert.ok(!/\n\s*\/\*/.test(MIN), "no block comment on its own line");
  assert.ok(MIN.length < big.length * 0.6, "smaller: " + MIN.length + " of " + big.length);
});

test("it still parses as a classic script, and serves no source map", async () => {
  assert.doesNotThrow(() => new (require("vm").Script)(MIN));
  assert.ok(!/sourceMappingURL/.test(MIN), "no map is pointed at - it would hand the source back");
});

test("names called from HTML strings survive by name", () => {
  for (const m of new Set([...big.matchAll(/onclick=\\?["']([A-Za-z_$][\w$]*)\(/g)].map((x) => x[1]))) {
    assert.ok(new RegExp("function " + m.replace(/\$/g, "\\$") + "\\(").test(MIN) ||
      new RegExp("\\b" + m.replace(/\$/g, "\\$") + "=").test(MIN), m);
  }
});

test("prebuild writes the minified bundle, and a failed minify fails the build", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  assert.match(src, /\(\{ code, map \} = await minifyWithMap\(script\[1\]\)\);/);
  assert.match(src, /code = sentryMap\(code, map\);\s*const name = "app\." \+ hash\(code\)/, "the map step runs before the name is taken");
  assert.match(src, /const name = "app\." \+ hash\(code\) \+ "\.js";/, "the name follows the shipped bytes");
  assert.match(src, /await splitAssets\(\);/);
  assert.match(src, /fs\.writeFileSync\(path\.join\(PUB, name\), code\);/);
  assert.match(src, /e && e\.failBuild\) \{[^}]*process\.exitCode = 1;/);
});

/* SENTRY'S MAP (owner, 11 Oct 2026). The map goes to Sentry only; the bundle
   keeps a debug id and nothing that points at a map. No network here: the
   upload itself is only exercised on a Vercel build. */
test("the map build ships the same code, and without a token no map is pointed at", async () => {
  const { code, map } = await minifyWithMap(big);
  assert.ok(map && JSON.parse(map).mappings, "a real map is produced");
  assert.match(code, /\/\/# sourceMappingURL=app\.js\.map\s*$/, "terser points at the placeholder");
  const saved = process.env.SENTRY_AUTH_TOKEN;
  delete process.env.SENTRY_AUTH_TOKEN;
  try {
    const out = sentryMap(code, map);
    assert.ok(!/sourceMappingURL/.test(out), "stripped before shipping");
    assert.strictEqual(out.trim(), MIN.trim(), "identical to the plain minify");
  } finally { if (saved !== undefined) process.env.SENTRY_AUTH_TOKEN = saved; }
});

test("sentry-cli's debug-id stamp keeps the bundle a valid script with every top-level name", async () => {
  const os = require("os"), { execFileSync } = require("child_process");
  const { code, map } = await minifyWithMap(big);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swmap-test-"));
  try {
    fs.writeFileSync(path.join(dir, "app.js"), code);
    fs.writeFileSync(path.join(dir, "app.js.map"), map);
    execFileSync(process.execPath, [require.resolve("@sentry/cli/bin/sentry-cli"), "sourcemaps", "inject", dir], { stdio: "pipe" });
    const raw = fs.readFileSync(path.join(dir, "app.js"), "utf8");
    assert.match(raw, /sourceMappingURL/, "sanity: inject leaves the map comment in");
    const stamped = stripMapUrl(raw);
    assert.ok(!/sourceMappingURL/.test(stamped), "the real strip removes it wherever inject put it");
    assert.match(stamped, /\/\/# debugId=[0-9a-f-]{36}/, "stamped");
    assert.match(fs.readFileSync(path.join(dir, "app.js.map"), "utf8"), /"debug_?[iI]d"/, "and the map carries the same id");
    assert.doesNotThrow(() => new (require("vm").Script)(stamped));
    assert.deepStrictEqual([...(await topNames(stamped))].sort(), [...(await topNames(big))].sort());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the map is never written under public/", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "prebuild.js"), "utf8");
  const body = src.slice(src.indexOf("function sentryMap("), src.indexOf("/* --------------------------------------------------------------- 2. split"));
  assert.match(body, /fs\.mkdtempSync\(path\.join\(require\("os"\)\.tmpdir\(\), "swmap-"\)\)/);
  assert.doesNotMatch(body, /\bPUB\b/);
});

/* 13 Oct 2026: the account sheet and the game page are minified on deploy too. */
test("the game page's scripts minify, keep their top-level names, and its JSON is untouched", async () => {
  const { minifyPage } = require("../scripts/prebuild.js");
  const game = fs.readFileSync(path.join(__dirname, "..", "public", "penalty.html"), "utf8");
  const out = await minifyPage(game, "penalty.html");
  assert.ok(out.length < game.length * 0.85, "barely smaller: " + game.length + " -> " + out.length);
  const scripts = (h) => [...h.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)].filter((m) => !/json/i.test(m[1]) && m[2].trim());
  const a = scripts(game), b = scripts(out);
  assert.strictEqual(b.length, a.length);
  for (let i = 0; i < a.length; i++) assert.deepStrictEqual([...(await topNames(b[i][2]))].sort(), [...(await topNames(a[i][2]))].sort());
  const json = (h) => (h.match(/<script[^>]*json[^>]*>[\s\S]*?<\/script>/gi) || []).join("");
  assert.strictEqual(json(out), json(game));
});

test("account-ui.js minifies to a working script that still sets window.swAccountUI", async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "account-ui.js"), "utf8");
  const code = await minifyScript(src);
  /* Mostly CSS and HTML text, which minifying cannot shorten: about a fifth comes off. */
  assert.ok(code.length < src.length * 0.85, "barely smaller: " + src.length + " -> " + code.length);
  assert.match(code, /swAccountUI/, "the page looks the sheet up by this name");
  new (require("vm").Script)(code);
});
