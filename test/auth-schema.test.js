"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "accounts.sql"), "utf8");
const TABLES = ["users", "sessions", "login_codes", "auth_attempts", "user_data",
  "rate_counters", "feature_access", "subscriptions"];

test("every account table exists with RLS on and no policy", () => {
  for (const t of TABLES) {
    assert.match(sql, new RegExp("create table if not exists public\\." + t + "\\b"), t);
    assert.match(sql, new RegExp("alter table public\\." + t + " enable row level security;"), t + " RLS");
  }
  assert.doesNotMatch(sql, /create policy/i, "no policy: service role only");
});

test("ids are random uuids and secrets are stored hashed", () => {
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(sql, /token_hash text not null unique/);
  assert.match(sql, /code_hash text not null/);
  assert.doesNotMatch(sql, /\btoken text\b|\bcode text\b|password/i);
});

test("deleting a user removes everything that belongs to them", () => {
  for (const t of ["sessions", "user_data", "subscriptions"])
    assert.match(sql, new RegExp("create table if not exists public\\." + t +
      "[\\s\\S]*?references public\\.users\\(id\\) on delete cascade"), t);
});

test("the rate limiter is atomic and not callable by the public roles", () => {
  assert.match(sql, /on conflict \(key, window_start\) do update set count = public\.rate_counters\.count \+ 1/);
  assert.match(sql, /revoke all on function public\.rl_hit\(text, int, int\) from public, anon, authenticated;/);
});
