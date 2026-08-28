"use strict";

/**
 * The identity of a fixture, as one string.
 *
 * Deliberately naive. Both the page and the sweep start from the same
 * published payload, so they are keying the *same* strings - `f.home` as we
 * printed it, not as some feed spells it. That makes a heavy normaliser
 * unnecessary here and a liability: the page and the server each carry their
 * own fuzzy team matcher for reconciling feeds, and if either one drifted the
 * two would start writing the same match under two keys.
 *
 * Fuzzy matching belongs where feeds are reconciled. This only has to be
 * stable and identical on both sides, so it is lowercase, accents folded, and
 * everything else collapsed to hyphens.
 */
function slug(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fixtureKey(date, home, away) {
  return String(date == null ? "" : date) + "|" + slug(home) + "|" + slug(away);
}

module.exports = { slug, fixtureKey };
