/* Every SQL file that changes or removes existing rows carries its way back (owner, 22 Oct 2026,
   after sql/ladder-x30.sql moved x100/x1000 readers to x30 with no record of who was on which).
   Such a file copies the rows it touches into a dated _bak table first and ends with a commented
   "-- UNDO:" block that puts them back. Files that only add tables or columns need neither. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "sql");
/* Already run before the rule; their rows cannot be copied after the fact. */
const BEFORE_RULE = ["ladder-x30.sql", "payments.sql", "pricing_v2.sql"];
const CHANGES_ROWS = /^\s*(update\s+\S+\s+set|delete\s+from|drop\s+table|truncate|alter\s+table\s+\S+\s+drop\s+column)/im;

test("SQL that changes or removes rows backs them up and says how to undo", () => {
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith(".sql") && !BEFORE_RULE.includes(f))) {
    const sql = fs.readFileSync(path.join(DIR, f), "utf8");
    if (!CHANGES_ROWS.test(sql)) continue;
    assert.match(sql, /create\s+table\s+(if\s+not\s+exists\s+)?\S+_bak_\d{8}\s+as\s+select/i, f + ": copy the rows into <table>_bak_<yyyymmdd> first");
    assert.match(sql, /^--\s*UNDO:/m, f + ": add a commented -- UNDO: block");
  }
});

test("the rule sees an update and a delete", () => {
  assert.ok(CHANGES_ROWS.test("update public.autopilot set rung = 30 where rung in (100, 1000);"));
  assert.ok(CHANGES_ROWS.test("delete from public.big_odds where day < '2026-10-22';"));
  assert.ok(!CHANGES_ROWS.test("alter table public.x drop constraint if exists x_check;"));
  assert.ok(!CHANGES_ROWS.test("create table if not exists public.x (id int);"));
});
