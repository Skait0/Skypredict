// api/p.js
"use strict";
/* GET /p/:id - the link a challenger shares. Server-rendered so WhatsApp and
   X preview who is challenging whom; a person is sent straight into the game
   at /penalty?c=<id>, which owns the experience. Same idea as api/s.js. */
const { applyCache, NO_STORE } = require("../lib/cachepolicy.js");
const D = require("../lib/penaltydb.js");
const P = require("../lib/penalty.js");

const ORIGIN = "https://www.soccerwizard.live";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* A duel (9 Oct 2026): who wants a duel, or how it ended. */
function renderDuel(d) {
  const st = P.duelState(d.kicks || []), a = d.a_name, b = d.b_name || "a friend";
  const title = !st.done ? a + " wants a penalty duel"
    : st.winner === "draw" ? a + " and " + b + " drew " + st.score.a + "-" + st.score.b + " on Play Penalty"
    : (st.winner === "a" ? a + " beat " + b + " " + st.score.a + "-" + st.score.b : b + " beat " + a + " " + st.score.b + "-" + st.score.a) + " on Play Penalty";
  return { title, line: st.done ? "See how it went, then start your own." : "Save their penalty, then take yours. Turn by turn, free, no stakes.", go: "/penalty?d=" + d.id };
}
function render(m, t, duel) {
  let title, line, go;
  if (duel) ({ title, line, go } = renderDuel(duel));
  else if (!m) { title = "Play Penalty"; line = "This challenge doesn't exist. Start your own."; go = "/penalty"; }
  else {
    const s = P.shootout(m.friend_kicks.map((k) => k.outcome));
    const ch = m.challenger_name, fr = m.friend_name;
    if (s.done && s.winner === "a") title = fr + " beat " + ch + " " + s.a + "-" + s.b + " on Play Penalty";
    else if (s.done && s.winner === "b") title = ch + " beat " + fr + " " + s.b + "-" + s.a + " on Play Penalty";
    else if (s.done) title = ch + " and " + fr + " drew " + s.a + "-" + s.b + " on Play Penalty";
    else title = ch + " challenges you to a penalty shootout";
    const expired = !m.friend_kicks.length && Date.parse(m.expires_at) <= t;
    line = expired ? "This challenge ran out. Start your own." : s.done ? "See how it went, then start your own." : "Take your 5 shots and make your 5 saves. Free, no stakes.";
    go = expired ? "/penalty" : "/penalty?c=" + m.id;
  }
  const url = ORIGIN + (duel ? "/p/" + duel.id : m ? "/p/" + m.id : "/penalty"), img = ORIGIN + "/penalty/og-card.jpg";
  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>" + esc(title) + "</title>" +
    "<meta name=\"description\" content=\"" + esc(line) + "\">" +
    "<meta property=\"og:title\" content=\"" + esc(title) + "\">" +
    "<meta property=\"og:description\" content=\"" + esc(line) + "\">" +
    "<meta property=\"og:image\" content=\"" + img + "\">" +
    "<meta property=\"og:url\" content=\"" + esc(url) + "\">" +
    "<meta property=\"og:site_name\" content=\"Soccerwizard\">" +
    "<meta name=\"twitter:card\" content=\"summary_large_image\">" +
    "<meta name=\"twitter:site\" content=\"@SoccerWizardhq\">" +
    "<meta name=\"twitter:title\" content=\"" + esc(title) + "\">" +
    "<meta name=\"twitter:image\" content=\"" + img + "\">" +
    "<meta name=\"robots\" content=\"noindex\">" +
    "<style>body{margin:0;background:#0D0D0F;color:#f3f3f5;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px}a{color:#E63946;font-weight:800}</style>" +
    "</head><body><div><h1>" + esc(title) + "</h1><p>" + esc(line) + "</p><p><a href=\"" + esc(go) + "\">Play</a></p></div>" +
    "<script>location.replace(" + JSON.stringify(go) + ")</script></body></html>";
}

module.exports = async function handler(req, res) {
  const id = String((req.query || {}).id || "").toUpperCase();
  const duel = D.ID_RE.test(id) ? await D.getDuel(id) : null;
  const m = !duel && D.ID_RE.test(id) ? await D.getMatch(id) : null;
  applyCache(res, NO_STORE);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(m || duel ? 200 : 404).end(render(m, Date.now(), duel));
};
module.exports.render = render;
