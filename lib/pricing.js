"use strict";
/* WIZARD PASS PRICES, NOW AND FROM 1 NOV 2026 (owner, 18 Oct 2026: "after 2 weeks, we move
   to the new prices"; "leave it as it is for everybody until the new plan kicks in").

   Until SWITCH_AT nothing changes: Day N200, Week N800, Month N2,000, 20 codes a day each,
   and the pricing card shows the new price struck through beside today's. From SWITCH_AT,
   by itself: Day N500, Week N1,500, Month N4,000, every one UNLIMITED codes with a stated
   fair-use limit of FAIR_USE a day (owner, 18 Oct 2026: "realistically, nobody is minting
   60 codes per day"; Puntrr Gold sells "unlimited" at N5,000). The limit only stops
   scripts and resellers; it is written on the card and the page. For every pass then running. No N200 plan after the switch (owner, 18 Oct 2026: "take off the 200").
   Free stays the 2-code trial.
   A code is one booking code on one bookie (owner, option A): converting to three bookies
   is three. Founding Wizards stay N1,500 for their first 3 month passes (api/pay.js). */
const SWITCH_AT = Date.parse("2026-11-01T00:00:00+01:00");
const NOW = {
  day: { days: 1, kobo: 20000, codes: 20, label: "Day pass" },
  week: { days: 7, kobo: 80000, codes: 20, label: "Week pass" },
  month: { days: 30, kobo: 200000, codes: 20, label: "Month pass" },
};
const FAIR_USE = 100;
const NEXT = {
  day: { days: 1, kobo: 50000, codes: FAIR_USE, unlimited: true, label: "Day pass" },
  week: { days: 7, kobo: 150000, codes: FAIR_USE, unlimited: true, label: "Week pass" },
  month: { days: 30, kobo: 400000, codes: FAIR_USE, unlimited: true, label: "Month pass" },
};

const passesAt = (t) => (t >= SWITCH_AT ? NEXT : NOW);
/* Codes a day for a running pass of this plan. A plan name we do not sell (an old gift)
   gets the Day allowance. */
const codesFor = (plan, t) => {
  const P = passesAt(t);
  return P[plan] ? P[plan].codes : P.day.codes;
};
/* The one line that sells the pass, in a refusal or the bot, for the date. */
const pitch = (t) => (t >= SWITCH_AT ? "unlimited codes, from ₦500" : "20 codes a day, from ₦200");

module.exports = { SWITCH_AT, FAIR_USE, NOW, NEXT, passesAt, codesFor, pitch };
