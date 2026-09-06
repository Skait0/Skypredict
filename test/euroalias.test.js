"use strict";
/* WHY THESE ARE EXPLICIT ALIASES AND NOT A LOWER FUZZY THRESHOLD.
 *
 * openfootball uses full official names. Measured against our index, the
 * nearest fuzzy candidate is frequently the WRONG CLUB:
 *
 *   HJK Helsinki      -> JJK Jyvaskyla    (0.31)   a different club
 *   Real Betis        -> Real Madrid      (0.55)   a different club
 *   FC Internazionale -> Salernitana      (0.29)   a different club
 *   AEK Athen         -> Athens Kallithea (0.44)   a different club
 *   Stade Brestois 29 -> St Etienne       (0.35)   a different club
 *   Wisla Krakow      -> Wisla Plock      (0.42)   a different club
 *
 * matchTeam refuses all of these today, because the bar is 0.82 with a league
 * given. That refusal is the system working. Lowering the bar to admit the
 * corpus would admit these too - the same failure as York City scoring 0.889
 * against Cork City. So the names are stated, once, by hand. */
const test = require("node:test");
const assert = require("node:assert");
const M = require("../lib/model.js");

const D = new Date("2026-05-01");
const m = (league, home, away) => ({ date: D, league, home, away, hg: 1, ag: 0 });

/* Only the clubs these assertions need, in their real leagues. */
const idx = M.buildIndex([
  m("Spain La Liga 1", "Ath Bilbao", "Betis"),
  m("Spain La Liga 1", "Real Madrid", "Ath Madrid"),
  m("Italy Serie A", "Inter", "Lazio"),
  m("Italy Serie A", "Salernitana", "Fiorentina"),
  m("Finland Veikkausliiga", "HJK", "JJK Jyvaskyla"),
  m("Finland Veikkausliiga", "KuPS", "VPS"),
  m("Finland Veikkausliiga", "SJK", "Ekenas"),
  m("Greece Super League", "AEK", "Athens Kallithea"),
  m("France Ligue 1", "Paris SG", "Marseille"),
  m("France Ligue 1", "Lyon", "Brest"),
  m("France Ligue 1", "St Etienne", "Le Havre"),
  m("Germany Bundesliga 1", "Bayern Munich", "Leverkusen"),
  m("Germany Bundesliga 1", "Hoffenheim", "Heidenheim"),
  m("Germany Bundesliga 1", "Mainz", "Schalke 04"),
  m("England Premier League", "Man City", "Man United"),
  m("Netherlands Eredivisie", "PSV Eindhoven", "Ajax"),
  m("Belgium Pro League", "St. Gilloise", "Charleroi"),
  m("Portugal Primeira Liga", "Sp Lisbon", "Benfica"),
  m("Portugal Primeira Liga", "Sp Braga", "Porto"),
  m("Denmark Superliga", "FC Copenhagen", "Odense"),
  m("Poland Ekstraklasa", "Wisla", "Wisla Plock"),
  m("Poland Ekstraklasa", "Jagiellonia", "Legia"),
  m("Turkey Super Lig", "Buyuksehyr", "Galatasaray"),
  m("Sweden Allsvenskan", "AIK", "GAIS"),
  m("Austria Bundesliga", "Salzburg", "Hartberg"),
  m("Ireland Premier Division", "St. Patricks", "Shamrock Rovers"),
  m("Romania Superliga", "Univ. Craiova", "CFR Cluj"),
]);
const li = (league) => idx.lIdx[league];

/* openfootball spelling -> what our index calls it, and where it plays. */
const PAIRS = [
  ["Paris Saint-Germain FC", "Paris SG", "France Ligue 1"],
  ["Olympique de Marseille", "Marseille", "France Ligue 1"],
  ["Olympique Lyonnais", "Lyon", "France Ligue 1"],
  ["Stade Brestois 29", "Brest", "France Ligue 1"],
  ["FC Bayern München", "Bayern Munich", "Germany Bundesliga 1"],
  ["Bayer 04 Leverkusen", "Leverkusen", "Germany Bundesliga 1"],
  ["1899 Hoffenheim", "Hoffenheim", "Germany Bundesliga 1"],
  ["1. FC Heidenheim 1846", "Heidenheim", "Germany Bundesliga 1"],
  ["1. FSV Mainz 05", "Mainz", "Germany Bundesliga 1"],
  ["Club Atlético de Madrid", "Ath Madrid", "Spain La Liga 1"],
  ["Athletic Club", "Ath Bilbao", "Spain La Liga 1"],
  ["Real Betis", "Betis", "Spain La Liga 1"],
  ["FC Internazionale Milano", "Inter", "Italy Serie A"],
  ["Lazio Roma", "Lazio", "Italy Serie A"],
  ["Manchester City FC", "Man City", "England Premier League"],
  ["Manchester United", "Man United", "England Premier League"],
  ["PSV", "PSV Eindhoven", "Netherlands Eredivisie"],
  ["Union Saint-Gilloise", "St. Gilloise", "Belgium Pro League"],
  ["Royale Union Saint-Gilloise", "St. Gilloise", "Belgium Pro League"],
  ["Sporting Charleroi", "Charleroi", "Belgium Pro League"],
  ["Sporting Clube de Portugal", "Sp Lisbon", "Portugal Primeira Liga"],
  ["Sport Lisboa e Benfica", "Benfica", "Portugal Primeira Liga"],
  ["Sporting Braga", "Sp Braga", "Portugal Primeira Liga"],
  ["FC København", "FC Copenhagen", "Denmark Superliga"],
  ["HJK Helsinki", "HJK", "Finland Veikkausliiga"],
  ["Kuopion PS", "KuPS", "Finland Veikkausliiga"],
  ["Vaasan PS", "VPS", "Finland Veikkausliiga"],
  ["SJK Seinäjoki", "SJK", "Finland Veikkausliiga"],
  ["AEK Athen", "AEK", "Greece Super League"],
  ["AIK Solna", "AIK", "Sweden Allsvenskan"],
  ["FC Red Bull Salzburg", "Salzburg", "Austria Bundesliga"],
  ["Wisła Kraków", "Wisla", "Poland Ekstraklasa"],
  ["Jagiellonia Białystok", "Jagiellonia", "Poland Ekstraklasa"],
  ["İstanbul Başakşehir", "Buyuksehyr", "Turkey Super Lig"],
  ["St Patrick's Athletic", "St. Patricks", "Ireland Premier Division"],
];

test("every openfootball spelling resolves to the club we mean", () => {
  for (const [name, want, league] of PAIRS) {
    assert.equal(M.matchTeam(idx, name, li(league)), want,
      name + " should resolve to " + want);
  }
});

test("the near misses that fuzzy matching would have taken are not taken", () => {
  assert.notEqual(M.matchTeam(idx, "HJK Helsinki", li("Finland Veikkausliiga")), "JJK Jyvaskyla");
  assert.notEqual(M.matchTeam(idx, "Real Betis", li("Spain La Liga 1")), "Real Madrid");
  assert.notEqual(M.matchTeam(idx, "FC Internazionale Milano", li("Italy Serie A")), "Salernitana");
  assert.notEqual(M.matchTeam(idx, "AEK Athen", li("Greece Super League")), "Athens Kallithea");
  assert.notEqual(M.matchTeam(idx, "Stade Brestois 29", li("France Ligue 1")), "St Etienne");
  assert.notEqual(M.matchTeam(idx, "Wisła Kraków", li("Poland Ekstraklasa")), "Wisla Plock");
});

test("a club we hold no ratings for still resolves to nothing", () => {
  /* Corvinul Hunedoara plays below the Romanian top flight and is not in our
     index. It must stay a clean drop - inventing an alias for it would put a
     club we cannot rate into a fit that assumes we can. */
  assert.equal(M.matchTeam(idx, "FC Corvinul Hunedoara", li("Romania Superliga")), null);
});

test("Craiova stays unresolved, because our own index cannot settle it", () => {
  /* openfootball carries CS Universitatea Craiova. Our index holds U Craiova,
     Univ. Craiova and U Craiova 1948, and the 1948 side is a different club
     from a split. test/teamindex.test.js already forbids an alias here; this
     asserts the corpus obeys that rather than quietly widening it. Those
     Romanian ties drop, which is the cheaper mistake. */
  assert.equal(M.matchTeam(idx, "CS Universitatea Craiova", li("Romania Superliga")), null);
});

test("the aliases have not disturbed the clubs already resolving", () => {
  assert.equal(M.matchTeam(idx, "Real Madrid", li("Spain La Liga 1")), "Real Madrid");
  assert.equal(M.matchTeam(idx, "Wisla Plock", li("Poland Ekstraklasa")), "Wisla Plock");
  assert.equal(M.matchTeam(idx, "JJK Jyvaskyla", li("Finland Veikkausliiga")), "JJK Jyvaskyla");
  assert.equal(M.matchTeam(idx, "Athens Kallithea", li("Greece Super League")), "Athens Kallithea");
});
