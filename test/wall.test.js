"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
const block = /<script id="swAccount">([\s\S]*?)<\/script>/.exec(html)[1];
const fnBody = (name) => { const m = new RegExp("(?:async )?function " + name + "\\([^)]*\\)\\{([\\s\\S]{0,600})").exec(html); assert.ok(m, name); return m[1]; };

test("each locked entry point asks swGate first", () => {
  assert.match(fnBody("bookSlip"), /^\s*if\(window\.swGate&&!swGate\("book",gateDetail\(BUILD\.picks,curBook\(\)\),bookSlip,"bookSlip"\)\) return;/);
  assert.match(fnBody("bookMy"), /^\s*if\(window\.swGate&&!swGate\("book",/);
  assert.match(fnBody("splitAndBook"), /^\s*if\(window\.swGate&&!swGate\("book",/);
  assert.match(fnBody("openSlipsSheet"), /^\s*if\(window\.swGate&&!swGate\("slips",null,function\(\)\{openSlipsSheet\(filter\);\},"slips"\)\) return;/);
  assert.match(html, /\$\("tab-build"\)\.addEventListener\("click",function\(\)\{if\(window\.swGate&&!swGate\("build",null,function\(\)\{setView\("build"\);\},"build"\)\) return; setView\("build"\);\}\);/);
  assert.match(html, /if\(window\.swGate&&!swGate\("book",null,function\(\)\{go\.click\(\);\},""\)\) return;\s*BYO\._booking=true;/);
});

test("Review Focus 1 and 2: never walls before the account state is known, when accounts are off, or when signin.js failed to load", () => {
  const g = /root\.swGate=function\(action,detail,go,resume\)\{([\s\S]*?)\n  \};/.exec(block);
  assert.ok(g, "swGate");
  assert.match(g[1], /if\(!d\.querySelector\('meta\[name="sw-auth"\]'\)\|\|!st\.known\|\|st\.on\|\|!root\.swSignIn\) return true;/);
});

test("the sign-in and spell scripts load only with accounts on, deferred", () => {
  const { applyAuthMeta } = require("../scripts/prebuild.js");
  assert.doesNotMatch(html, /src="\/(spell|signin)\.js"/, "not hard-coded: prebuild injects them only with AUTH_ENABLED=1");
  assert.doesNotMatch(applyAuthMeta(html, "0"), /src="\/(spell|signin)\.js"/);
  assert.match(applyAuthMeta(html, "1"), /<script src="\/spell\.js" defer><\/script><script src="\/signin\.js" defer><\/script><script id="swAccount">/);
});

test("every user-tapped code generation is walled: doBookList (Book all, Slip of the day) and the first round of bookRounds (converter, trim/change, make safer)", () => {
  assert.match(fnBody("doBookList"), /^\s*if\(window\.swGate&&!swGate\("book",gateDetail\(picks,B\|\|curBook\(\)\),function\(\)\{doBookList\(picks,resultId,btnId,label,B\);\},""\)\) return;/);
  /* Only round 0: a refusal round (round>0) is already past the wall, and the idle() puts the caller's button back if the reader walks away. */
  assert.match(fnBody("bookRounds"), /^\s*round=round\|\|0;\s*if\(!round&&window\.swGate&&!swGate\("book",gateDetail\(picks,B\),function\(\)\{bookRounds\(picks,B,src,target,h,0\);\},""\)\)\{ h\.idle\(\); return; \}/);
});

test("afterAuth retries /api/me once, then closes without running the action and says so", () => {
  const a = /function afterAuth\(j,done\)\{([\s\S]*?)\r?\n  \}\r?\n  root\.swGate/.exec(block);
  assert.ok(a, "afterAuth");
  assert.match(a[1], /setTimeout\(ask,1000\)/);
  assert.match(a[1], /notice\("Signed in\. Reload to sync\."\); done\(false\);/);
});

test("back from Google but signed out (401): the stale gate and ?signedin=1 are cleared", () => {
  assert.match(block, /if\(code===401\)\{ readGate\(\);/);
});

test("the ball has a token pair in both themes", () => {
  assert.match(html, /:root, \[data-theme="dark"\]\{[\s\S]*?--ball:#F2F1F0;[\s\S]*?--ball-ink:#161619;/);
  assert.match(html, /\[data-theme="light"\]\{[\s\S]*?--ball:#FFFFFF;[\s\S]*?--ball-ink:#1C1A18;/);
});

test("a Google redirect comes back into the spell and resumes only a whitelisted action", () => {
  assert.match(block, /signedin=1/);
  assert.match(block, /sessionStorage/);
  assert.match(block, /root\.swResume&&root\.swResume\[g\.resume\]/);
  assert.match(html, /window\.swResume=\{bookSlip:function\(\)\{bookSlip\(\);\},bookMy:function\(\)\{bookMy\(\);\},build:function\(\)\{setView\("build"\);\},slips:function\(\)\{openSlipsSheet\(\);\}\};/);
});

test("every way into Build passes the wall: setView gates the build view itself", () => {
  assert.match(fnBody("setView"), /^\s*var args=\[\]\.slice\.call\(arguments\);\s*if\(v==="build"&&!noGate&&window\.swGate&&!swGate\("build",null,function\(\)\{setView\.apply\(null,args\);\},"build"\)\) return;/);
  /* The saved-view restore on load runs unprompted, possibly after /api/me answered: it must never pop the sheet. */
  assert.match(html, /setView\(V\.view \|\| "pred",true\);/);
});
