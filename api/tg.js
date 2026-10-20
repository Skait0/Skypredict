"use strict";
/* POST /api/tg - the Telegram bot's webhook. The code doctor.
 *
 * Someone sends the bot a booking code (any of the six books, or a share
 * link carrying one); it reads the code the same way /api/slip does, lays the
 * legs against today's board and answers with our model's read - strongest,
 * weakest, the chance they all land - plus links to convert or soften it on
 * the site. See lib/doctor.js.
 *
 * Only Telegram may call this: setWebhook is given a secret derived from the
 * bot token (scripts/tgwebhook.js), Telegram echoes it in a header, and
 * anything without it is refused. Private chats only - the channel and any
 * group the bot lands in are ignored, so it cannot be made to spam either.
 *
 * Always answers 200 once the request is genuine: Telegram retries anything
 * else, and a retry would send the reader the same reply twice.
 */
const crypto = require("crypto");
const { UPSTREAM } = require("../lib/upstream.js");
const D = require("../lib/doctor.js");
const CONVERT = require("../lib/convert.js");
const SB = require("../lib/supabase.js");
const QUOTA = require("../lib/quota.js");
const R = require("../lib/roles.js");
const TGLINK = require("../lib/tglink.js");
const FOLLOW = require("../lib/follow.js");
const ASK = require("../lib/ask.js");
const S = require("../lib/slipedit.js");
const BOOKS = require("../lib/books.js");

const SITE = process.env.SITE_ORIGIN || "https://www.soccerwizard.live";
const ORDER = BOOKS.KEYS;

const TOKEN = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
function secretFor(token) {
  return crypto.createHash("sha256").update("sw-webhook:" + token).digest("hex").slice(0, 48);
}

async function tg(method, body) {
  const r = await fetch("https://api.telegram.org/bot" + TOKEN() + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return r.json().catch(() => null);
}

async function readCode(book, code) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(UPSTREAM + "/api/slip?book=" + book + "&code=" + encodeURIComponent(code),
      { signal: ctrl.signal, headers: { accept: "application/json" } });
    const b = await r.json().catch(() => null);
    return b && b.success && Array.isArray(b.legs) && b.legs.length ? b.legs : null;
  } catch (e) { return null; } finally { clearTimeout(t); }
}

/* THE MENU IS THE HELP (owner, 19 Oct 2026: "make the bot very easy to use"): /start shows the
   buttons under the chat box (lib/ask.js menuKeyboard), and typing stays optional. */
const HELLO_MENU =
  "🧙 <b>Welcome to Soccerwizard</b>\n" +
  "<i>Our model picks the games. You pick the odds.</i>\n\n" +
  "<b>Try it now - just type a number:</b>\n" +
  "<code>50</code>  →  a x50 slip, booked, code in seconds\n\n" +
  "<b>Or send any booking code:</b>\n" +
  "<code>HUW6YC</code>  →  strong games, weak games, what it pays\n" +
  "then one tap to 🛡 make it safer, ✂️ trim, ➗ split or 🔁 convert\n\n" +
  "📅 <b>Daily odds</b>: x5 to x1000 codes every morning at 10:30\n" +
  "🏦 Works on " + BOOKS.list("and") + "\n\n" +
  "<b>First, which bookie do you use?</b> 👇\n<i>18+ · Play responsibly</i>";
const HELLO =
  "🔮 <b>The Wizard's Eye</b> 🧙\n<i>Drop any code. The Wizard's Eye sees it all.</i>\n\n" +
  "Send me any booking code - " + BOOKS.list("or") + " - and you get:\n" +
  "🔥 your bankers\n👀 the legs to tighten\n💰 what it pays\n" +
  "🔁 the same slip on another bookie, one tap\n🔔 live updates as each game lands\n\n" +
  "Paste the code on its own, or a share link. Say which bookie if you know it.\n\n" +
  "✍️ <b>Or tell me what to do with it</b> - in the same message, or as a reply to my read:\n" +
  "• <i>HZ6RL7 trim to 150 odds</i>\n• <i>keep the best 10 games</i>\n" +
  "• <i>split into 3</i>\n• <i>change all draws to under 2.5</i>\n" +
  "• <i>convert to Bet9ja</i>\n• <i>book me today's 5 safest</i>\n\n" +
  "Daily codes: @soccerwizardTG · <a href=\"" + SITE + "\">soccerwizard.live</a>\n<i>18+</i>";

/* CODES IN THE BOT: A TWO-CODE TRIAL PER PERSON, ONCE (owner, 16 Oct 2026; was
   two a day, before that five - the same trial as the site, lib/bookgate.js). The
   doctor is unlimited; converting books a real code at a bookmaker, so it is
   counted in book_quota like every site booking, under a hashed Telegram id
   and src "tgbot". A count we cannot read lets the conversion through, the
   same fail-open rule the site's gate uses - an outage of ours is not the
   reader's problem. The cap is the funnel: past it, the Wizard Pass on the site. */
const CONVERT_CAP = 2;
/* The date decides the offer (lib/pricing.js: new prices from 1 Nov 2026). */
const plusLine = () => "Wizard Pass on <a href=\"" + SITE + "\">soccerwizard.live</a>: " + require("../lib/pricing.js").pitch(Date.now()) + " 🧙";
const subjectOf = (uid) => "tg-" + crypto.createHash("sha256")
  .update((process.env.SW_QUOTA_PEPPER || "") + ":" + uid).digest("hex").slice(0, 24);


/* EVERY CODE ENDS WITH WHAT YOU CAN DO WITH IT (owner, 19 Oct 2026): the site's converter
   tools as buttons. Trim, Split and Convert open their choices in place of these buttons. */
function toolButtons(book, code, job) {
  const k = (t, d) => ({ text: t, callback_data: d + "|" + book + "|" + code });
  const rows = [[k("🛡 Edit for me", "ed"), k("✂️ Trim", "tr"), k("➗ Split", "sp")],
    [k("🔁 Convert", "cx"), { text: "🔔 Follow", callback_data: ["fw", book, code].join("|") }]];
  /* 👍 / 👎 under every answer (owner, 20 Oct 2026); Back to these buttons has no job, so no vote row. */
  if (job) rows.push(ASK.voteRow(job));
  return { inline_keyboard: rows };
}
function choiceButtons(kind, book, code) {
  const back = [{ text: "◀ Back", callback_data: ["bk0", book, code].join("|") }];
  const xs = (list) => list.map((x) => ({ text: "x" + x, callback_data: ["tq", book, code, x].join("|") }));
  if (kind === "tr") return { inline_keyboard: [xs([5, 10, 20, 50]), xs([100, 500, 1000]), back] };
  if (kind === "sp") return { inline_keyboard: [[2, 3, 4].map((n) => ({ text: n + " tickets", callback_data: ["sq", book, code, n].join("|") })), back] };
  if (kind === "cx") {
    const others = ORDER.filter((b) => b !== book).map((b) => ({ text: D.BOOK_NAMES[b], callback_data: ["cv", b, book, code].join("|") }));
    return { inline_keyboard: [others.slice(0, 3), others.slice(3), back] };
  }
  return toolButtons(book, code);
}
const bookButtons = (data) => ({ inline_keyboard: [ORDER.slice(0, 3), ORDER.slice(3)].map((row) =>
  row.map((b) => ({ text: D.BOOK_NAMES[b], callback_data: data(b) }))) });

/* FOLLOW MY SLIP (lib/follow.js, api/tgfollow.js). Up to FOLLOW_CAP open at
   once per person, so the ten-minute job stays small; a slip settles within a
   day or two and frees its place. */
const FOLLOW_CAP = 5;
async function onFollow(cq) {
  const chat = cq.message && cq.message.chat;
  if (!chat || chat.type !== "private") return;
  const [tag, from, code] = String(cq.data || "").split("|");
  if (tag !== "fw" || !ORDER.includes(from) || !/^[A-Z0-9]{4,16}$/.test(code || "")) return;
  const say = (text) => tg("sendMessage", { chat_id: chat.id, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: cq.message.message_id });
  const open = await SB.openFollows(chat.id);
  if (!open.ok) { await say("I can't follow slips right now. Try again in a few minutes."); return; }
  if (!open.rows.some((r) => r.code === code) && open.rows.length >= FOLLOW_CAP) {
    await say("🔔 You're already following " + FOLLOW_CAP + " slips - that's the most at once. " +
      "One frees up as soon as it settles. Every graded code lives on <a href=\"" + SITE + "/booking-codes\">soccerwizard.live</a> 🧙");
    return;
  }
  const legs = await readCode(from, code);
  if (!legs) { await say("That code can't be read any more - it may have expired or its games started."); return; }
  const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => ({}));
  const tracked = FOLLOW.track(legs, (pay && pay.fixtures) || []);
  if (!tracked.length) {
    await say("😤 I can't follow any game on this slip - they're not on our board, or the markets can't be settled from a final score.");
    return;
  }
  const last = tracked.map((l) => Date.parse(l.ko || "")).filter(isFinite).sort((a, b) => b - a)[0];
  const put = await SB.putFollow({ chat_id: chat.id, book: from, code, legs: tracked, seen: {}, done: false,
    last_kickoff: last ? new Date(last).toISOString() : null });
  if (!put.ok) { await say("I can't follow slips right now. Try again in a few minutes."); return; }
  if (!put.added) {
    await say("🔔 You're already following <b>" + code + "</b> - I'll keep the updates coming 🧙");
    return;
  }
  await say("🔔 <b>Following " + code + "</b> 🧙\n\nI'll message you as each game lands, and when the whole slip is in." +
    (tracked.length < legs.length ? "\nTracking " + tracked.length + " of " + legs.length + " games (the rest aren't on our board or settle on a half-time score)." : "") +
    "\n\nWhile you wait: the slip builder and tomorrow's code are on <a href=\"" + SITE + "\">soccerwizard.live</a> 🔥");
}

async function onConvert(cq) {
  const chat = cq.message && cq.message.chat;
  if (!chat || chat.type !== "private") return;
  const [tag, to, from, code] = String(cq.data || "").split("|");
  if (tag !== "cv" || !ORDER.includes(to) || !ORDER.includes(from) || !/^[A-Z0-9]{4,16}$/.test(code || "")) return;
  const say = (text, markup) => tg("sendMessage", { chat_id: chat.id, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: cq.message.message_id, reply_markup: markup });
  const q = await quota(cq.from && cq.from.id, 1);
  if (!q.ok) {
    await say("🔥 " + spent(q) + (q.plan === "trial" ? "\n\nWant more? " + plusLine() : ""));
    return;
  }
  tg("sendChatAction", { chat_id: chat.id, action: "typing" }).catch(() => {});
  const legs = await readCode(from, code);
  if (!legs) { await say("That code can't be read any more - it may have expired or its games started."); return; }
  const r = await CONVERT.convert(legs, to);
  if (!r.code) {
    await say("😤 " + D.BOOK_NAMES[to] + " couldn't take this one" + (r.error ? " - " + esc(r.error) : "") +
      ". Try another bookie, or <a href=\"" + SITE + "/?book=" + from + "&code=" + code + "&go=convert\">the full converter</a>.");
    return;
  }
  await SB.recordBooking(q.subject, q.day, "tgbot").catch(() => {});
  const stuck = r.stuck || [];
  const out = ["🔁 <b>" + D.BOOK_NAMES[to] + ": <code>" + r.code + "</code></b> 🔥",
    r.booked.length + " of " + legs.length + " games converted."];
  if (stuck.length) out.push("Left behind: " + stuck.slice(0, 4).map((s) =>
    esc((s.leg.home || "") + " v " + (s.leg.away || "")) + " (" + esc(s.why) + ")").join("; ") +
    (stuck.length > 4 ? "; +" + (stuck.length - 4) + " more" : ""));
  if ((r.changed || []).length) out.push("Line moved to what " + D.BOOK_NAMES[to] + " sells on " + r.changed.length + " leg" + (r.changed.length === 1 ? "" : "s") + ".");
  out.push("", leftLine(q, 1), "<i>18+</i>");
  await say(out.join("\n"), { inline_keyboard: [ASK.voteRow("convert")] });
}

/* INSTRUCTIONS (28 Sep 2026): trim, keep, split, change, today. Each books
   real codes, so each counts against the same two-code trial as a conversion -
   a split into three costs three. Same fail-open rule on a count we cannot
   read. */
async function quota(uid, cost) {
  const b = await budgetOf(uid);
  const used = await SB.countBookings(b.subject, b.countDay, b.cap).catch(() => ({ ok: false, n: null }));
  return { subject: b.subject, day: b.day, plan: b.plan, cap: b.cap, used, ok: !(used.ok && used.n + cost > b.cap),
           left: (k) => (used.ok ? Math.max(0, b.cap - used.n - k) : null) };
}

/* CONNECTED ACCOUNTS (owner, 16 Oct 2026; lib/tglink.js). A Telegram linked to
   a Plus or Family & friends account books on that account's daily codes -
   counted with the site's, as "u:<id>", so the 20 are 20 across both. The
   admin is counted under a cap no one reaches. Unlinked, free, or a lookup
   that fails: this Telegram's trial, counted over every day. */
async function budgetOf(uid) {
  const day = QUOTA.dayOf(Date.now());
  const trial = { subject: subjectOf(uid), day, countDay: QUOTA.ALL_DAYS, cap: CONVERT_CAP, plan: "trial" };
  try {
    const userId = await SB.tgUserOf(trial.subject);
    if (!userId) return trial;
    const AUTHDB = require("../lib/auth/db.js");
    const u = await AUTHDB.userById(userId);
    const ri = u ? await R.roleInfo(AUTHDB, u, process.env) : { role: "free", plan: null }, role = ri.role;
    if (role === "admin") return { subject: "u:" + userId, day, countDay: day, cap: 1000, plan: "admin" };
    if (role === "plus" || role === "ff") return { subject: "u:" + userId, day, countDay: day, cap: R.codeLimitFor(role, ri.plan), plan: role };
  } catch (e) { /* the trial, as if unlinked */ }
  return trial;
}
/* What the reader is told when the codes run out, and how many are left. */
const spent = (q) => q.plan === "trial" ? "You've used your " + q.cap + " trial codes."
  : "That's your " + q.cap + " codes for today - more after midnight.";
function leftLine(q, k) {
  const l = q.left(k);
  if (q.plan === "admin") return "";
  if (q.plan !== "trial") return l != null ? "⚡ " + l + " code" + (l === 1 ? "" : "s") + " left today." : "";
  return (l != null ? "⚡ " + l + " trial code" + (l === 1 ? "" : "s") + " left. " : "") + plusLine();
}
const xOdds = (o) => "×" + (o >= 100 ? Math.round(o).toLocaleString("en") : o.toFixed(2));
const legNames = (ls, n) => ls.slice(0, n).map((l) => esc((l.home || "?") + " v " + (l.away || "?"))).join("; ") +
  (ls.length > n ? "; +" + (ls.length - n) + " more" : "");
const pc = (p) => Math.round(p * 100) + "%";
const TO_SITE = (book, code, go) => SITE + "/?book=" + book + "&code=" + code + (go ? "&go=" + go : "");
async function fixtures() {
  const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => ({}));
  return (pay && pay.fixtures) || [];
}
/* Re-book legs of a code at its own bookie: their own event ids, the market
   on each leg (changed or not). */
/* Which job a reply to an instruction was, for its 👍 / 👎. */
const JOB_OF = { saferDo: "edit", trim: "trim", keep: "trim", change: "change", split: "split" };
const picksOf = (legs) => legs.map((l) => ({ leg: l, eventId: l.eventId, code: l.prediction }));

async function onAsk(msg, ask, book, code, legs) {
  const chat = msg.chat.id;
  const say = (text, markup) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: msg.message_id, reply_markup: markup });
  const B = D.BOOK_NAMES[book];
  if (ask.kind === "convert") {
    /* The button's own path, so a typed "convert to Bet9ja" and a tap on
       🔁 Bet9ja cannot answer differently. */
    if (ask.to === book) { await say("That code is already on " + B + " 🙂"); return; }
    await onConvert({ message: { chat: msg.chat, message_id: msg.message_id }, from: msg.from,
      data: ["cv", ask.to, book, code].join("|") });
    return;
  }
  const cost = ask.kind === "split" ? ask.n : 1;
  const q = await quota(msg.from && msg.from.id, cost);
  if (!q.ok) {
    const have = q.left(0);
    const kind = q.plan === "trial" ? " trial code" : " code";
    await say("🔥 That needs " + cost + " new code" + (cost === 1 ? "" : "s") + " and you have " +
      (have ? have + kind + (have === 1 ? "" : "s") + " left" : "used your " + q.cap + kind + "s") +
      "." + (q.plan === "trial" ? "\n\n" + plusLine() : ""));
    return;
  }
  const fx = await fixtures();
  /* One message per code: what was done, the code, what it pays, the rest.
     `est` is the product of the book's own leg prices from the read, shown
     as "about" only when the booking reply carries no total. */
  const prod = (ls) => ls.every((l) => +l.odds > 1) ? ls.reduce((s, l) => s * l.odds, 1) : null;
  const done = async (r, head, lines, est) => {
    if (!r.code) {
      await say("😤 " + B + " wouldn't take it" + (r.error ? " - " + esc(r.error) : "") +
        ". Try again, or do it on <a href=\"" + TO_SITE(book, code, "convert") + "\">the converter</a>.");
      return false;
    }
    await SB.recordBooking(q.subject, q.day, "tgbot").catch(() => {});
    const odds = r.odds ? xOdds(r.odds) : (est > 1 && !(r.stuck || []).length
      ? "about " + xOdds(est) : null);
    const out = [head, "<code>" + r.code + "</code> · " + r.booked.length + " game" + (r.booked.length === 1 ? "" : "s") +
      (odds ? " · <b>" + odds + "</b>" : "")].concat(lines || []);
    if ((r.stuck || []).length) out.push("⚠️ " + B + " refused " + legNames(r.stuck.map((s) => s.leg), 3));
    await say(out.join("\n"), toolButtons(book, r.code, JOB_OF[ask.kind]));
    return true;
  };
  const tail = (k) => leftLine(q, k) + "\n<i>18+</i>";

  if (ask.kind === "saferDo") {
    const plan = await saferPlan(book, legs);
    if (!plan.length) { await say("Nothing to change any more - the prices may have moved. Your code stays as it is."); return; }
    tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
    const swap = new Map(plan.map((x) => [x.leg, x.to]));
    const r = await CONVERT.bookPicks(book, legs.map((l) => ({ leg: l, eventId: l.eventId, code: swap.get(l) || l.prediction })));
    await done(r, "🛡 <b>Made safer</b> - " + plan.length + " game" + (plan.length === 1 ? "" : "s") +
      " moved to an easier bet, the rest as they were 🔥", ["", tail(1)], null);
    return;
  }
  if (ask.kind === "trim" || ask.kind === "keep") {
    const plan = ask.kind === "trim" ? ASK.planTrim(legs, fx, ask.odds) : ASK.planKeep(legs, fx, ask.games);
    if (ask.kind === "trim" && plan.short) {
      await say("Your " + legs.length + " games only reach about <b>" + xOdds(plan.odds) + "</b> together - " +
        "under " + xOdds(ask.odds) + ", so there's nothing to trim. Ask for less, or build a bigger slip on " +
        "<a href=\"" + SITE + "\">soccerwizard.live</a> 🧙");
      return;
    }
    if (!plan.keep.length || plan.keep.length >= legs.length) {
      await say("Nothing to trim - that already keeps every game."); return;
    }
    tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
    const kept = plan.keep.map((r) => r.leg);
    const mod = plan.keep.filter((r) => r.src === "model");
    const r = await CONVERT.bookPicks(book, picksOf(kept));
    const head = "✂️ <b>" + (ask.kind === "trim" ? "Trimmed toward " + xOdds(ask.odds) : "Kept the best " + ask.games) +
      "</b> - " + kept.length + " of " + legs.length + " games 🔥";
    await done(r, head, [
      "Kept the " + kept.length + " our model rates likeliest" +
        (mod.length ? " (" + (mod.length < kept.length ? mod.length + " of them " : "") + "avg " +
          pc(mod.reduce((s, x) => s + x.p, 0) / mod.length) + ")" : "") + ", exactly as they were.",
      "Dropped: " + legNames(plan.cut.map((c) => c.leg), 4), "", tail(1)], prod(kept));
    return;
  }
  if (ask.kind === "change") {
    const plan = S.changeAllPlan(legs, ask.from, ask.to);
    if (!plan.changed.length) {
      await say("There are no " + S.CHANGE_FROM[ask.from].label.toLowerCase() + " on this slip to change."); return;
    }
    tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
    const r = await CONVERT.bookPicks(book, picksOf(plan.legs));
    await done(r, "🔁 <b>" + plan.changed.length + " " + S.CHANGE_FROM[ask.from].label.toLowerCase() +
      " → " + S.CHANGE_TO[ask.to].label.toLowerCase() + "</b>, the rest as they were 🔥", ["", tail(1)], null);
    return;
  }
  if (ask.kind === "split") {
    const parts = ASK.planSplit(legs, fx, ask.n);
    if (parts.length < 2 || parts.some((p) => p.length < 2)) {
      await say("That slip is too short to split into " + ask.n + " - each ticket needs at least two games."); return;
    }
    tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
    await say("✂️ <b>Split into " + parts.length + " tickets</b>, dealt so each gets a fair share of the strong games 🔥");
    /* One at a time, inside the function's minute: a part not reached in time
       is said, never silently dropped. */
    const t0 = Date.now();
    let made = 0;
    for (let i = 0; i < parts.length; i++) {
      if (Date.now() - t0 > 40e3) {
        await say("⏳ Ran out of time before ticket " + (i + 1) + ". Split it on the " +
          "<a href=\"" + TO_SITE(book, code, "convert") + "\">converter</a> instead.");
        break;
      }
      const r = await CONVERT.bookPicks(book, picksOf(parts[i]));
      if (await done(r, "🎟 <b>Ticket " + (i + 1) + " of " + parts.length + "</b>", [], prod(parts[i]))) made++;
    }
    if (made) await say(tail(made));
    return;
  }
}

/* "Book me today's 5 safest" - no code, straight off our board: the tips we
   rate highest among games still to come today, paired to the bookie's own
   events and booked by the converter's path. With a target ("10 odds") the
   likeliest are kept until our fair price for them reaches it; the code's
   own total is the book's. */
async function onToday(msg, ask) {
  const chat = msg.chat.id;
  const say = (text, markup) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: msg.message_id, reply_markup: markup });
  const book = ask.book || "sporty", B = D.BOOK_NAMES[book];
  const q = await quota(msg.from && msg.from.id, 1);
  if (!q.ok) {
    await say("🔥 " + spent(q) + (q.plan === "trial" ? " " + plusLine() : ""));
    return;
  }
  tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  let rows = ASK.planToday(await fixtures(), ask);
  if (ask.odds) rows = S.trimToOdds(rows.map((r) => ({ leg: r.leg, p: r.p, odds: 0.94 / r.p })), ask.odds).keep;
  if (rows.length < 2) {
    await say("Not enough games left " + ask.when + " that we rate highly. Try tomorrow, or the builder on " +
      "<a href=\"" + SITE + "\">soccerwizard.live</a> 🧙");
    return;
  }
  const r = await CONVERT.convert(rows.map((x) => x.leg), book);
  if (!r.code) {
    await say("😤 " + B + " wouldn't take it" + (r.error ? " - " + esc(r.error) : "") + ". Try another bookie."); return;
  }
  await SB.recordBooking(q.subject, q.day, "tgbot").catch(() => {});
  const byLeg = new Map(rows.map((x) => [x.leg, x.p]));
  const lines = ["🧙 <b>" + (ask.when === "tomorrow" ? "Tomorrow's" : "Today's") + " safest on " + B + "</b> 🔥",
    "<code>" + r.code + "</code> · " + r.booked.length + " games" + (r.odds ? " · <b>" + xOdds(r.odds) + "</b>" : ""), ""];
  for (const x of r.booked) {
    const p = byLeg.get(x.leg);
    lines.push(esc(D.label(x.leg)) + (p ? " · <b>" + pc(p) + "</b>" : ""));
  }
  const l = q.left(1);
  lines.push("", (l != null && q.plan !== "admin" ? "⚡ " + l + (q.plan === "trial" ? " trial code" : " code") + (l === 1 ? "" : "s") +
    (q.plan === "trial" ? " left. " : " left today. ") : "") +
    "Every graded code on <a href=\"" + SITE + "/booking-codes\">soccerwizard.live</a>", "<i>Estimates, not certainties. 18+</i>");
  await say(lines.join("\n"), toolButtons(book, r.code, "today"));
}

/* EDIT FOR ME: which legs move, on the reader's bookie's own prices (lib/ask.js planSafer). */
async function saferPlan(book, legs) {
  let body = null;
  try { body = await (await fetch(SITE + CONVERT.FEED[book], { signal: AbortSignal.timeout(8000) })).json(); } catch (e) { body = null; }
  const evs = CONVERT.events(book, body);
  const priceOf = (l, c) => { const e = CONVERT.pair(evs, l); return e && +e.odds[c] > 1.01 ? +e.odds[c] : null; };
  return ASK.planSafer(legs, await fixtures(), priceOf);
}
async function onSaferAsk(chat, replyTo, book, code, legs) {
  const say = (text, markup) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: replyTo, reply_markup: markup });
  tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  const plan = await saferPlan(book, legs);
  if (!plan.length) {
    await say("🛡 Nothing to change: every game we rate is already " + pc(ASK.TIGHT) + "+, or " + D.BOOK_NAMES[book] +
      " sells nothing safer on it.\n\nTrim it to your odds instead?", choiceButtons("tr", book, code));
    return;
  }
  const lines = ["🛡 <b>Edit for me</b> - " + plan.length + " of " + legs.length + " games to an easier bet on the same game:", ""];
  for (const x of plan.slice(0, 8)) {
    lines.push(esc((x.leg.home || "?") + " v " + (x.leg.away || "?")) + "\n   " + esc(D.label(x.leg)) + " " + pc(x.pOld) +
      " → <b>" + esc(D.label(Object.assign({}, x.leg, { prediction: x.to }))) + " " + pc(x.pNew) + "</b>");
  }
  if (plan.length > 8) lines.push("+" + (plan.length - 8) + " more");
  lines.push("", "Safer bets pay less. Nothing is booked until you tap <b>Do it</b>.", "<i>18+</i>");
  await say(lines.join("\n"), { inline_keyboard: [[{ text: "✅ Do it", callback_data: ["eq", book, code].join("|") },
    { text: "Keep as is", callback_data: ["bk0", book, code].join("|") }]] });
}

/* BUILD ME A SLIP: PICK FOR ME (owner, 20 Oct 2026: "now do the telegram"). The site's Pick for
   me (lib/pickforme.js): a payout -> the surest market in each game still to come today, on the
   reader's bookie, at most 40 games. Today first; when today cannot reach the payout, the coming
   days, and the message says so. x2, x5 and x10 for everyone, x20 and up with Wizard Pass. "Another"
   is a new shuffle for this reader, not a different rule. */
async function onBuild(chat, replyTo, fromId, book, target, nth) {
  const say = (text, markup) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: replyTo, reply_markup: markup });
  const PFM = require("../lib/pickforme.js");
  /* Pick for me stops at x200 (owner, 20 Oct 2026); bigger odds go to the Slider and the Wizard.
     Asked before the quota, so a refused payout costs no request. */
  const top = PFM.PAYS[PFM.PAYS.length - 1];
  if (target > top) {
    await say("⚡ <b>Pick for me goes up to x" + top + ".</b> Want bigger odds? Use the Slider or the Wizard on the site.",
      { inline_keyboard: [[{ text: "🎚️ Slider", url: SITE + "/" }, { text: "🔮 Wizard", url: SITE + "/" }]] });
    return;
  }
  const q = await quota(fromId, 1);
  if (!q.ok) { await say("🔥 " + spent(q) + (q.plan === "trial" ? "\n\n" + plusLine() : "")); return; }
  if (target > PFM.FREE_UP_TO && !["plus", "ff", "admin"].includes(q.plan)) {
    await say("🔒 <b>x" + target + " and up come with Wizard Pass.</b> x2, x5 and x10 are open to everyone.\n\n" + plusLine(),
      { inline_keyboard: [[2, 5, 10].map((x) => ({ text: "x" + x, callback_data: ["bd", book, x, 0].join("|") }))] });
    return;
  }
  tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  const BIG = require("../lib/bigodds.js");
  const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => ({}));
  let feed = [];
  try { feed = await BIG.feedNow(); } catch (e) { feed = []; }
  const now = Date.now(), seed = String(fromId) + "|" + QUOTA.dayOf(now) + "|" + (nth || 0);
  let picked = PFM.pick(pay || {}, now, feed, target, "today", seed), later = false;
  if (picked.short || picked.legs.length < 2) { picked = PFM.pick(pay || {}, now, feed, target, "all", seed); later = true; }
  if (picked.short || picked.legs.length < 2) {
    await say("😤 Not enough games on the board for x" + target + " right now. Try a smaller payout 🧙");
    return;
  }
  const r = await CONVERT.convert(picked.legs, book, now);
  if (!r.code) { await say("😤 " + D.BOOK_NAMES[book] + " wouldn't take it" + (r.error ? " - " + esc(r.error) : "") + ". Try another bookie."); return; }
  await SB.recordBooking(q.subject, q.day, "pickforme").catch(() => {});
  const lines = ["🧙 <b>Picked for you: x" + target + " on " + D.BOOK_NAMES[book] + "</b> 🔥",
    ...(later ? ["Not enough games left today, so this one runs into the coming days."] : []),
    "<code>" + r.code + "</code> · " + r.booked.length + " games" + (r.odds ? " · <b>" + xOdds(r.odds) + "</b>" : ""), ""];
  for (const x of r.booked.slice(0, 8)) lines.push(esc(D.label(x.leg)) + (x.leg.p ? " · <b>" + pc(x.leg.p) + "</b>" : ""));
  if (r.booked.length > 8) lines.push("+" + (r.booked.length - 8) + " more");
  if ((r.stuck || []).length) lines.push("⚠️ " + D.BOOK_NAMES[book] + " refused " + legNames(r.stuck.map((x) => x.leg), 3));
  lines.push("", leftLine(q, 1), "<i>Estimates, not certainties. 18+</i>");
  const tools = toolButtons(book, r.code, "pick");
  tools.inline_keyboard.unshift([{ text: "🔁 Another x" + target, callback_data: ["bd", book, target, (nth || 0) + 1].join("|") }]);
  await say(lines.join("\n"), tools);
}
/* CONVERT A CODE (owner, 19 Oct 2026: "its the most used, it should have its own link"). Asked as
   a reply prompt, so the answer carries the bookie and nothing is stored. */
async function askConvert(chat, replyTo, book) {
  await tg("sendMessage", { chat_id: chat, reply_to_message_id: replyTo, parse_mode: "HTML",
    text: ASK.CONVERT_ASK + "<b>" + D.BOOK_NAMES[book] + "</b>. Any bookie, any size.",
    reply_markup: { force_reply: true, input_field_placeholder: "Paste the code here" } });
}
/* BUILD ME A SLIP, the three ways (owner, 20 Oct 2026; the site's chooser): Pick for me right
   here by payout, Slider and Wizard on the site. */
async function onBuildMenu(chat, replyTo, book) {
  const xs = (list) => list.map((x) => ({ text: "x" + x, callback_data: ["bd", book, x, 0].join("|") }));
  await tg("sendMessage", { chat_id: chat, reply_to_message_id: replyTo, parse_mode: "HTML", disable_web_page_preview: true,
    text: "🧙 <b>Build me a slip</b> on " + D.BOOK_NAMES[book] + "\n\n" +
      "⚡ <b>Pick for me</b>: no options to choose. We take the surest market in each game and stop at your payout. " +
      "Tap one, or type any number up to <b>200</b>.\n\n" +
      "🎚️ <b>Slider</b> and 🔮 <b>Wizard</b>: choose your own options on the site. Want bigger odds? Use these.\n\n<i>x20 and up come with Wizard Pass. 18+</i>",
    reply_markup: { inline_keyboard: [xs([2, 5, 10, 20]), xs([50, 100, 150, 200]),
      [{ text: "🎚️ Slider", url: SITE + "/" }, { text: "🔮 Wizard", url: SITE + "/" }]] } });
}
/* TODAY'S LADDER: the 10:30 codes (lib/ladder.js). x5 for everyone, every rung on Wizard Pass. */
async function onLadder(chat, replyTo, fromId, book) {
  const say = (text) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: replyTo });
  const L = require("../lib/ladder.js"), SOC = require("../lib/social.js");
  const got = await SB.getLadder(SOC.dayOf(Date.now())).catch(() => ({ ok: false }));
  const rows = got && got.ok ? got.rows : [];
  if (!rows.length) { await say("📅 Today's daily odds land at <b>10:30</b>. Check back then 🧙"); return; }
  const b = await budgetOf(fromId), pass = ["plus", "ff", "admin"].includes(b.plan);
  const lines = ["📅 <b>Daily odds on " + D.BOOK_NAMES[book] + "</b>", ""];
  for (const r of rows) {
    const c = r.codes && r.codes[book];
    const head = "<b>x" + r.rung + "</b> · " + (r.legs || []).length + " games · " + xOdds(+r.odds || 0);
    if (!c) lines.push(head + " · not on " + D.BOOK_NAMES[book] + " today");
    else if (pass || r.rung === L.OPEN_RUNG) lines.push(head + " · <code>" + c.code + "</code>");
    else lines.push(head + " · 🔒 Wizard Pass");
  }
  if (!pass) lines.push("", "Every rung comes with Wizard Pass. " + plusLine());
  lines.push("<i>18+</i>");
  await say(lines.join("\n"));
}
/* Every button's tap, by its first word. Choices open in place; actions read the code fresh. */
async function onButton(cq) {
  const chat = cq.message && cq.message.chat;
  if (!chat || chat.type !== "private") return;
  const p = String(cq.data || "").split("|"), tag = p[0];
  const edit = (markup) => tg("editMessageReplyMarkup", { chat_id: chat.id, message_id: cq.message.message_id, reply_markup: markup });
  const msgLike = { chat, message_id: cq.message.message_id, from: cq.from };
  if (tag === "fb") {
    const v = ASK.parseVote(cq.data);
    if (!v) return;
    await edit(ASK.dropVoteRow(cq.message.reply_markup));
    await SB.putBotVote({ job: v.job, vote: v.vote, who: subjectOf(cq.from && cq.from.id), msg: cq.message.message_id }).catch(() => {});
    return;
  }
  if (tag === "fw") return onFollow(cq);
  if (tag === "cv") return onConvert(cq);
  if (tag === "bk") {
    if (!ORDER.includes(p[1])) return;
    await tg("sendMessage", { chat_id: chat.id, parse_mode: "HTML",
      text: "✅ <b>" + D.BOOK_NAMES[p[1]] + "</b> it is. Your menu is under the chat box 👇\n\n" +
        "Type a number like <b>50</b> for a x50 slip, or send any booking code.",
      reply_markup: ASK.menuKeyboard(p[1]) });
    await tg("sendMessage", { chat_id: chat.id, parse_mode: "HTML", text: "🎯 Or start with one of these:",
      reply_markup: { inline_keyboard: [[10, 50, 100].map((x) => ({ text: "🎯 x" + x + " slip", callback_data: ["bd", p[1], x, 0].join("|") }))] } });
    return;
  }
  if (tag === "ct") { if (ORDER.includes(p[1])) await askConvert(chat.id, cq.message.message_id, p[1]); return; }
  if (tag === "bd") {
    const x = +p[2];
    if (!ORDER.includes(p[1]) || !(x >= 2 && x <= ASK.MAX_BUILD)) return;
    return onBuild(chat.id, cq.message.message_id, cq.from && cq.from.id, p[1], x, Math.min(5, +p[3] || 0));
  }
  const book = p[1], code = p[2];
  if (!ORDER.includes(book) || !/^[A-Z0-9]{4,16}$/.test(code || "")) return;
  if (tag === "bk0") return edit(toolButtons(book, code));
  if (tag === "tr" || tag === "sp" || tag === "cx") return edit(choiceButtons(tag, book, code));
  const legs = await readCode(book, code);
  if (!legs) {
    await tg("sendMessage", { chat_id: chat.id, reply_to_message_id: cq.message.message_id,
      text: "That code can't be read any more - it may have expired or its games started." });
    return;
  }
  if (tag === "ed") return onSaferAsk(chat.id, cq.message.message_id, book, code, legs);
  if (tag === "eq") return onAsk(msgLike, { kind: "saferDo" }, book, code, legs);
  if (tag === "tq" && +p[3] > 1) return onAsk(msgLike, { kind: "trim", odds: +p[3] }, book, code, legs);
  if (tag === "sq" && +p[3] >= 2) return onAsk(msgLike, { kind: "split", n: Math.min(4, +p[3]) }, book, code, legs);
}

const esc = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  const token = TOKEN();
  if (!token || req.headers["x-telegram-bot-api-secret-token"] !== secretFor(token)) {
    return res.status(401).json({ ok: false });
  }
  const cq = req.body && req.body.callback_query;
  if (cq) {
    /* Stop the button's spinner first; the work can take a few seconds. */
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: /^fb\|/.test(cq.data || "") ? "Thanks 🧙" : "On it 🧙" }).catch(() => {});
    try { await onButton(cq); } catch (e) { /* the reader can tap again */ }
    return res.status(200).json({ ok: true });
  }
  const msg = req.body && req.body.message;
  if (!msg || !msg.chat || msg.chat.type !== "private" || typeof msg.text !== "string") {
    return res.status(200).json({ ok: true });
  }
  const chat = msg.chat.id;
  const say = (text) => tg("sendMessage", { chat_id: chat, text, parse_mode: "HTML",
    disable_web_page_preview: true, reply_to_message_id: msg.message_id });

  try {
    /* CONNECT TELEGRAM: "Connect Telegram" in the account panel opens
       t.me/<bot>?start=link_<token> (lib/tglink.js). */
    const link = /^\/start\s+link_([0-9a-z]{55})\s*$/.exec(msg.text);
    if (link) {
      const userId = TGLINK.readToken(link[1], Date.now(), process.env.AUTH_PEPPER);
      const done = userId ? await SB.putTgLink(subjectOf(msg.from && msg.from.id), userId).catch(() => ({ ok: false })) : { ok: false };
      await say(done.ok
        ? "✅ <b>Connected to your Soccerwizard account.</b>\n\nYour Wizard Pass works here now - send me a code 🧙"
        : userId ? "Couldn't connect just now. Tap Connect Telegram on the site again."
        : "That link has expired. Tap Connect Telegram on <a href=\"" + SITE + "\">soccerwizard.live</a> for a fresh one.");
      return res.status(200).json({ ok: true });
    }
    /* MY DAILY SLIP on Telegram (17 Oct 2026, lib/ladder.js): tg_links keeps only a
       hashed id, which cannot be messaged, so "/daily" files this chat on the
       reader's autopilot row. "/daily off" stops Telegram delivery. Wizard Pass. */
    const daily = /^\/daily(?:\s+(off|stop))?\s*$/i.exec(msg.text);
    if (daily) {
      let line = "Connect Telegram on <a href=\"" + SITE + "\">soccerwizard.live</a> first (your account, Connect Telegram). Then send /daily again.";
      try {
        const userId = await SB.tgUserOf(subjectOf(msg.from && msg.from.id));
        if (userId) {
          const AUTHDB = require("../lib/auth/db.js");
          const u = await AUTHDB.userById(userId);
          const role = u ? await R.roleOf(AUTHDB, u, process.env) : "free";
          const got = await SB.getAutopilot(userId);
          if (!["plus", "ff", "admin"].includes(role)) line = "My daily slip comes with Wizard Pass. " + plusLine();
          else if (!(got.ok && got.row)) line = "Pick your daily slip first: on <a href=\"" + SITE + "\">soccerwizard.live</a>, open your account, then My daily slip. Then send /daily again.";
          else if (daily[1]) line = (await SB.putAutopilot(userId, { tg_chat: null })).ok ? "Done. No more daily slips here. Your phone alerts stay as they are." : "Couldn't change it just now. Try again.";
          else line = (await SB.putAutopilot(userId, { tg_chat: chat })).ok
            ? "✅ <b>Done.</b> Your x" + got.row.rung + " slip comes here every morning at 10:30.\n\nSend /daily off to stop."
            : "Couldn't turn it on just now. Try again.";
        }
      } catch (e) { line = "Couldn't check just now. Try again."; }
      await say(line);
      return res.status(200).json({ ok: true });
    }
    /* t.me/<bot>?start=book_CODE arrives as "/start book_CODE" - the site's
       code dialog opens the bot on the code the reader just got. */
    const deep = /^\/start\s+(sporty|bet9ja|betking|betpawa|onexbet|betway)_([A-Za-z0-9]{4,16})\s*$/i.exec(msg.text);
    if (!deep && /^\/(start|menu)\b(?!\s+convert)/i.test(msg.text)) {
      /* Two messages: the welcome with buttons to try straight away (an inline keyboard), then
         the menu under the chat box (a reply keyboard) - Telegram allows one kind per message. */
      /* BOOKIE FIRST (owner, 19 Oct 2026: the example bot "asks for the preferred bookie of a user
         after the start button"): the welcome ends on that question; the answer sets the menu. */
      const pick = bookButtons((b) => "bk|" + b);
      pick.inline_keyboard.push([{ text: "📖 How it works", web_app: { url: SITE + "/bot" } }]);
      await tg("sendMessage", { chat_id: chat, text: HELLO_MENU, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: pick });
      return res.status(200).json({ ok: true });
    }
    /* The Menu button's commands (scripts/tgwebhook.js), routed like the menu's own buttons. */
    const cmd = /^\/(build|check|dailyodds|bookie|guide|convert)\b/i.exec(msg.text) || /^\/start\s+(convert)\s*$/i.exec(msg.text);
    if (!deep && cmd) {
      const c = cmd[1].toLowerCase();
      if (c === "convert") await tg("sendMessage", { chat_id: chat, text: "🔁 Convert a code to which bookie?",
        reply_to_message_id: msg.message_id, reply_markup: bookButtons((b) => "ct|" + b) });
      else if (c === "build") await onBuildMenu(chat, msg.message_id, "sporty");
      else if (c === "dailyodds") await onLadder(chat, msg.message_id, msg.from && msg.from.id, "sporty");
      else if (c === "bookie") await tg("sendMessage", { chat_id: chat, text: "🏦 Which bookie do you use?",
        reply_to_message_id: msg.message_id, reply_markup: bookButtons((b) => "bk|" + b) });
      else if (c === "guide") await tg("sendMessage", { chat_id: chat, text: "📖 The whole bot in one page, with examples you can tap:",
        reply_markup: { inline_keyboard: [[{ text: "📖 Open the guide", web_app: { url: SITE + "/bot" } }]] } });
      else await tg("sendMessage", { chat_id: chat, parse_mode: "HTML", reply_to_message_id: msg.message_id,
        text: "🔍 Send me the code - from any bookie. I'll show you the strong games and the weak ones.",
        reply_markup: { force_reply: true, input_field_placeholder: "Paste the code here" } });
      return res.status(200).json({ ok: true });
    }
    if (!deep && /^\/help\b/i.test(msg.text)) { await say(HELLO); return res.status(200).json({ ok: true }); }
    const menu = deep ? null : ASK.parseMenu(msg.text);
    if (menu) {
      if (menu.kind === "menuConvert") await askConvert(chat, msg.message_id, menu.book);
      else if (menu.kind === "tool") await tg("sendMessage", { chat_id: chat, reply_to_message_id: msg.message_id,
        text: ASK.TOOL_ASK[menu.tool] + " Any bookie.", reply_markup: { force_reply: true, input_field_placeholder: "Paste the code here" } });
      else if (menu.kind === "menuBuild") await onBuildMenu(chat, msg.message_id, menu.book);
      else if (menu.kind === "ladder") await onLadder(chat, msg.message_id, msg.from && msg.from.id, menu.book);
      else if (menu.kind === "bookie") await tg("sendMessage", { chat_id: chat, text: "🏦 Which bookie do you use?",
        reply_to_message_id: msg.message_id, reply_markup: bookButtons((b) => "bk|" + b) });
      else await tg("sendMessage", { chat_id: chat, parse_mode: "HTML", reply_to_message_id: msg.message_id,
        text: "🔍 Send me the code - from any bookie. I'll show you the strong games and the weak ones.",
        reply_markup: { force_reply: true, input_field_placeholder: "Paste the code here" } });
      return res.status(200).json({ ok: true });
    }
    let { code, book } = deep ? { code: deep[2].toUpperCase(), book: deep[1].toLowerCase() } : D.parse(msg.text);
    /* "trim to 150" sent as a reply to the bot's read of a code acts on that
       code - the reply carries it, so nothing has to be remembered. */
    const rt = msg.reply_to_message && (msg.reply_to_message.text || msg.reply_to_message.caption);
    /* A code sent in answer to "Send the code you want on Bet9ja." goes straight to Bet9ja. */
    const convertTo = rt ? ASK.convertTarget(rt) : null;
    const toolTo = rt ? ASK.toolAsked(rt) : null;
    if (!code && !deep && rt && !convertTo && !toolTo) { const r = D.parse(rt); code = r.code; book = book || r.book; }
    const ask = deep ? null : ASK.parseAsk(msg.text, code);
    if (!code && ask && ask.kind === "today") { await onToday(msg, ask); return res.status(200).json({ ok: true }); }
    if (!code && ask && ask.kind === "build") {
      if (ask.book) await onBuild(chat, msg.message_id, msg.from && msg.from.id, ask.book, ask.odds, 0);
      else await tg("sendMessage", { chat_id: chat, reply_to_message_id: msg.message_id, parse_mode: "HTML",
        text: "🎯 A x" + ask.odds + " slip - on which bookie?", reply_markup: bookButtons((b) => ["bd", b, ask.odds, 0].join("|")) });
      return res.status(200).json({ ok: true });
    }
    if (!code) {
      await tg("sendMessage", { chat_id: chat, parse_mode: "HTML", reply_to_message_id: msg.message_id,
        text: "Send me a booking code, like <code>HUW6YC</code>, or type a number like <b>50</b> for a x50 slip. " +
          "The buttons below do the rest 🧙", reply_markup: ASK.menuKeyboard("sporty") });
      return res.status(200).json({ ok: true });
    }
    tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});

    /* The book named, or each in turn: one code rarely means something on two. */
    let legs = null, used = null;
    for (const b of book ? [book] : ORDER) {
      legs = await readCode(b, code);
      if (legs) { used = b; break; }
    }
    if (!legs) {
      await say("I couldn't read <code>" + code + "</code>" + (book ? " on " + D.BOOK_NAMES[book] : " on any of the " + BOOKS.COUNT_WORD + " bookies") +
        ". Check the code - or it may have expired, or every game may have started.");
      return res.status(200).json({ ok: true });
    }
    /* An instruction goes straight to its answer; "safer" and a bare
       "convert" are what the read already offers, so they get the read. */
    if (convertTo) {
      if (convertTo === used) await say("That code is already on " + D.BOOK_NAMES[used] + " 🙂 Send a code from another bookie.");
      else await onConvert({ message: { chat: msg.chat, message_id: msg.message_id }, from: msg.from, data: ["cv", convertTo, used, code].join("|") });
      return res.status(200).json({ ok: true });
    }
    /* A code sent in answer to a tool's question goes straight to that tool. */
    if (toolTo === "safer" || (ask && ask.kind === "safer")) { await onSaferAsk(chat, msg.message_id, used, code, legs); return res.status(200).json({ ok: true }); }
    if (toolTo === "trim" || toolTo === "split") {
      await tg("sendMessage", { chat_id: chat, reply_to_message_id: msg.message_id, parse_mode: "HTML",
        text: (toolTo === "trim" ? "✂️ <b>Trim " + code + "</b> - " + legs.length + " games. To what odds?\nWe keep the games our model likes best."
          : "➗ <b>Split " + code + "</b> - " + legs.length + " games. Into how many tickets?"),
        reply_markup: choiceButtons(toolTo === "trim" ? "tr" : "sp", used, code) });
      return res.status(200).json({ ok: true });
    }
    if (ask && !(ask.kind === "convert" && !ask.to)) {
      await onAsk(msg, ask, used, code, legs);
      return res.status(200).json({ ok: true });
    }
    const pay = await (await fetch(SITE + "/predictions.json")).json().catch(() => ({}));
    await tg("sendMessage", { chat_id: chat, text: D.reply(used, code, legs, (pay && pay.fixtures) || [], SITE),
      parse_mode: "HTML", disable_web_page_preview: true, reply_to_message_id: msg.message_id,
      reply_markup: toolButtons(used, code, "read") });
  } catch (e) {
    await say("Something went wrong reading that code. Try again in a minute.").catch(() => {});
  }
  return res.status(200).json({ ok: true });
};

module.exports.secretFor = secretFor;
module.exports.HELLO = HELLO;
