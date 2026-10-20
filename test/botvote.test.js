"use strict";
/* 👍 / 👎 under every bot answer (owner, 20 Oct 2026: the SportyClaw review - "every AI answer
   ends with 👍 / 👎"). One tap is one vote; the two buttons go and the rest of the keyboard stays. */
const test = require("node:test");
const assert = require("node:assert");
const ASK = require("../lib/ask.js");

test("the vote row carries the job, and only jobs we know", () => {
  assert.deepStrictEqual(ASK.voteRow("trim").map((b) => b.callback_data), ["fb|u|trim", "fb|d|trim"]);
  assert.deepStrictEqual(ASK.parseVote("fb|d|convert"), { job: "convert", vote: -1 });
  assert.deepStrictEqual(ASK.parseVote("fb|u|read"), { job: "read", vote: 1 });
  assert.strictEqual(ASK.parseVote("fb|u|<script>"), null, "a forged job is refused");
  assert.strictEqual(ASK.parseVote("fb|x|read"), null);
  for (const j of ASK.VOTE_JOBS) assert.ok(("fb|u|" + j).length <= 64, "Telegram caps callback_data at 64 bytes");
});

test("a vote drops the two buttons and keeps every other button", () => {
  const kb = { inline_keyboard: [[{ text: "✂️ Trim", callback_data: "tr|sporty|ABC123" }], ASK.voteRow("read")] };
  assert.deepStrictEqual(ASK.dropVoteRow(kb), { inline_keyboard: [[{ text: "✂️ Trim", callback_data: "tr|sporty|ABC123" }]] });
  assert.deepStrictEqual(ASK.dropVoteRow({ inline_keyboard: [ASK.voteRow("convert")] }), { inline_keyboard: [] });
  assert.deepStrictEqual(ASK.dropVoteRow(undefined), { inline_keyboard: [] });
});

test("every answer that books or reads a code ends with the vote row", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "../api/tg.js"), "utf8");
  for (const job of ["read", "edit", "trim", "split", "change", "convert", "today", "pick"]) {
    assert.ok(new RegExp("[\"']" + job + "[\"']").test(src), "tg.js never names the job " + job);
  }
  assert.ok(/tag === "fb"/.test(src), "the webhook handles a vote tap");
  assert.ok(/dropVoteRow\(/.test(src), "a vote removes its buttons");
});

test("the admin line counts votes per job over 7 days", () => {
  const sum = ASK.voteSummary([{ job: "read", vote: 1 }, { job: "read", vote: -1 }, { job: "read", vote: 1 }, { job: "pick", vote: -1 }]);
  assert.deepStrictEqual(sum, [{ job: "read", up: 2, dn: 1 }, { job: "pick", up: 0, dn: 1 }]);
});
