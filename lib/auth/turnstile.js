"use strict";
/* The bot check in front of "Email me a code". Every failure is a refusal:
   an email-sending endpoint that fails open is a spam cannon with our
   domain's name on it. Spec section 4.2. */
const URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function verify(token, ip) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret || typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const r = await fetch(URL, { method: "POST", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
    if (!r.ok) return false;
    const j = await r.json();
    return !!j && j.success === true;
  } catch (e) { return false; }
}

module.exports = { verify };
