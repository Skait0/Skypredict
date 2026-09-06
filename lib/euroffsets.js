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
    for (const c in d.countries) {
      const v = d.countries[c] && d.countries[c].offset;
      if (typeof v === "number" && isFinite(v) && v >= 0) clean[c] = v;
    }
    data = { offsets: clean, generated: d.generated, seasons: d.seasons || [],
             shrinkageK: d.shrinkageK };
    return data;
  } catch (e) {
    return null;
  }
}

function offsetFor(country) {
  return data ? data.offsets[String(country || "")] : undefined;
}

function meta() {
  if (!data) return null;
  return { generated: data.generated, seasons: data.seasons,
           fitted: Object.keys(data.offsets).length };
}

_loadFrom(DEFAULT);

module.exports = { offsetFor, meta, _loadFrom };
