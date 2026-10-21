"use strict";
/* A youth, reserve or women's COMPETITION, read from its name. Shared by the build (no such fixture on
   our board), the Wizard's Eye (never rate such a leg with the senior game's numbers) and the converter
   (never carry it to another book, whose events carry no league to tell the two apart). 21 Oct 2026:
   a UEFA Youth League leg "Bayern Munich v Arsenal FC" was read as the senior game. */
function youthComp(s) {
  const t = " " + String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ") + " ";
  return / (w|women|womens|feminin|feminine|femenino|ladies) /.test(t) ||
    / u(15|16|17|18|19|20|21|23) /.test(t) ||
    / (paf|youth|junior|juniors|academy|reserve|reserves|primavera) /.test(t);
}
module.exports = { youthComp };
