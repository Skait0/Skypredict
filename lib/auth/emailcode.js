"use strict";
/* The email code: six digits, ten minutes, five tries, used once, bound to
   the email it was sent to and to the server's pepper. Stored only as an
   HMAC, so a database read reveals no usable code. Spec section 4.2. */
const crypto = require("crypto");
const { hmacHex, sameHex } = require("./crypto.js");

const CODE_TTL_MS = 10 * 60e3;
const MAX_TRIES = 5;
/* Sent from a subdomain Resend verifies on its own (owner, 30 Sep 2026), so a
   bad day for login mail cannot touch the main domain's reputation. */
const FROM = "Soccerwizard <login@mail.soccerwizard.live>";

function newCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, "0"); }
function codeHash(pepper, email, code) { return hmacHex(pepper, email + ":" + code); }

function checkCode(row, pepper, email, typed, nowMs) {
  if (!row) return "none";
  if (row.consumed_at) return "used";
  if ((row.attempts | 0) >= MAX_TRIES) return "dead";
  if (Date.parse(row.expires_at) <= nowMs) return "expired";
  const digits = String(typed == null ? "" : typed).replace(/\D/g, "");
  if (digits.length !== 6) return "wrong";
  return sameHex(codeHash(pepper, email, digits), String(row.code_hash)) ? "ok" : "wrong";
}

async function resend(payload) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(6000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ from: FROM }, payload)),
    });
    return r.ok;
  } catch (e) { return false; }
}

function sendCode(email, code) {
  return resend({
    to: [email],
    subject: "Your Soccerwizard code: " + code,
    text: "Your Soccerwizard sign-in code is " + code + ".\n\nIt works for 10 minutes, once. " +
      "If you did not ask for it, ignore this email: nobody can sign in without the code.\n\n18+",
  });
}

function sendNewDevice(email, label) {
  return resend({
    to: [email],
    subject: "New sign-in to Soccerwizard",
    text: "Your Soccerwizard account was just signed in on " + String(label).slice(0, 40) + ".\n\n" +
      "Not you? Open soccerwizard.live, go to your account and tap Sign out everywhere.",
  });
}

module.exports = { CODE_TTL_MS, MAX_TRIES, newCode, codeHash, checkCode, sendCode, sendNewDevice };
