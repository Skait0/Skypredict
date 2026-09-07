"use strict";
/**
 * The fitted country offsets, as the build sees them.
 *
 * Read once, at module load, from a small committed JSON. No fit, no fetch, no
 * corpus - the build's whole cost for this feature is one readFileSync.
 *
 * EVERY FAILURE PATH LANDS ON TODAY'S BEHAVIOUR. A missing file is the normal
 * state before the first harvest; a broken one is a bad commit. Neither is
 * worth failing a deploy over, because the fallback - computing from the UEFA
 * coefficient - is exactly what the site did before this existed.
 */
const fs = require("fs");
const path = require("path");

const DEFAULT = path.join(__dirname, "..", "data", "country-offsets.json");

let data = null;

function valid(d) {
  return d && typeof d === "object" && d.countries &&
         typeof d.countries === "object" && !Array.isArray(d.countries);
}

function _loadFrom(file) {
  data = null;
  if (file === null) return null;
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!valid(d)) return null;
    const clean = {};
    const pinned = {};
    for (const c in d.countries) {
      const row = d.countries[c] || {};
      const v = row.offset;
      if (typeof v === "number" && isFinite(v) && v >= 0) clean[c] = v;
      /* Measured evidence that ran into the cap. Both halves matter: no
         evidence at all is not pinned, it is the imported number standing
         unopposed, and Russia must keep pricing the way it does today. */
      if (row.clamped === true && typeof row.matches === "number" && row.matches > 0)
        pinned[c] = true;
    }
    /* A venue effect the artefact does not carry is zero, not a guess: an
       older artefact predates this and must keep pricing as it did. */
    const he = typeof d.homeEdge === "number" && isFinite(d.homeEdge) ? d.homeEdge : 0;
    data = { offsets: clean, pinned: pinned, generated: d.generated, seasons: d.seasons || [],
             shrinkageK: d.shrinkageK,
             /* Bounded here as well as in the fit. This number is added to
                every European tie's edge, so a corrupt one would move the
                whole competition rather than one country. */
             homeEdge: Math.min(0.5, Math.max(-0.5, he)) };
    return data;
  } catch (e) {
    return null;
  }
}

function offsetFor(country) {
  return data ? data.offsets[String(country || "")] : undefined;
}

/* A country whose fit ended up sitting on the cap.
 *
 * The cap is where the model stops being able to describe a gap, so a value
 * resting on it is a lower bound rather than a measurement - and the corpus
 * shows how far out that can be: Irish clubs score less than half what we
 * predict. The board refuses these ties instead of pricing them, the same
 * answer countryHandicap has always given for a country it holds no
 * coefficient for. */
function isPinned(country) {
  return !!(data && data.pinned[String(country || "")]);
}

/* The extra home advantage a cross-border tie carries, in log goal-rate.
   Zero whenever there is no artefact, which is exactly today's behaviour. */
function homeEdge() {
  return data ? data.homeEdge : 0;
}

function meta() {
  if (!data) return null;
  return { generated: data.generated, seasons: data.seasons,
           fitted: Object.keys(data.offsets).length, homeEdge: data.homeEdge,
           pinned: Object.keys(data.pinned) };
}

_loadFrom(DEFAULT);

module.exports = { offsetFor, isPinned, homeEdge, meta, _loadFrom };
