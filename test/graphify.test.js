"use strict";
/* THE SHADOW COPY OF index.html's SCRIPT, AND THE TWO WAYS IT GOES WRONG.
 *
 * graphify reads `.js` and treats `.html` as prose, so the 18,900-line file
 * holding the entire front end contributed NOTHING to a 2,003-node graph -
 * `BOOK_ONLY` could not be found in graphify-out at all. scripts/graphify-inline.js
 * copies the inline scripts to graphify-src/index.inline.js, newline-padded so
 * the line numbers still point at index.html.
 *
 * A copy has exactly two failure modes and both are silent:
 *
 *   IT GOES STALE. The graph then answers with symbols that have moved or gone,
 *   which is worse than the blindness it replaced - a wrong line number is
 *   trusted where a missing one is not.
 *
 *   IT GETS COMMITTED. Then there are two copies of the front end in git, and
 *   the day someone edits the wrong one is the day the site and the graph stop
 *   describing the same program.
 *
 * Both are checked here rather than left to a habit. The file is optional - a
 * fresh clone has not run the script and CI has no reason to - so its ABSENCE
 * is not a failure. Only a present-and-wrong one is.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REL = "graphify-src/index.inline.js";
const OUT = path.join(ROOT, REL);
const there = fs.existsSync(OUT);

test("the graphify shadow is never committed", () => {
  /* Untracked is the whole design: graphify indexes the working tree, so the
     file does not need to be in git to be seen - and must not be, or it is a
     second source of truth. It cannot be gitignored either, because graphify
     skips everything git ignores (.gitignore, .graphifyignore and
     .git/info/exclude alike), which is the trap the first version fell into. */
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files", "--", REL], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (e) { return; }                     /* no git here - nothing to check */
  assert.equal(tracked, "",
    REL + " is tracked by git. It is a generated copy of index.html's script: " +
    "run `git rm --cached " + REL + "` and leave it untracked.");

  let ignored = 0;
  try {
    execFileSync("git", ["check-ignore", "-q", "--", REL], { cwd: ROOT });
  } catch (e) { ignored = e.status; }
  assert.notEqual(ignored, 0,
    REL + " is gitignored, so graphify will skip it and the graph goes blind " +
    "again. Remove the ignore rule rather than the file.");
});

test("the graphify shadow matches index.html, or is not there at all", { skip: !there }, () => {
  /* Same check the script's own --check flag runs, called the same way a
     person would, so the two cannot disagree about what "current" means. */
  execFileSync(process.execPath, ["scripts/graphify-inline.js", "--check"], { cwd: ROOT });
});

test("the shadow keeps index.html's line numbers", { skip: !there }, () => {
  /* The padding is the only reason a graph node can cite a line worth opening.
     Checked on real symbols rather than on the line count alone: equal length
     would survive a copy that dropped one line and gained another. */
  const html = fs.readFileSync(path.join(ROOT, "public", "index.html"), "utf8").split("\n");
  const shadow = fs.readFileSync(OUT, "utf8").split("\n");
  assert.equal(shadow.length, html.length, "the shadow is a different length from index.html");
  ["function bookAllows(", "var BOOK_ONLY=", "async function bookSlip()", "function mixReline("]
    .forEach((needle) => {
      const a = html.findIndex((l) => l.includes(needle));
      const b = shadow.findIndex((l) => l.includes(needle));
      assert.ok(a >= 0, "index.html no longer contains " + needle + " - update this test");
      assert.equal(b, a, needle + " sits on a different line in the shadow (" +
        (b + 1) + " vs " + (a + 1) + "), so every graph node's line number is a lie");
    });
});
